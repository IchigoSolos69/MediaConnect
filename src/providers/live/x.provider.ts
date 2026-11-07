import {
  ISocialProvider,
  SocialPlatform,
  ConnectedAccountData,
  PostPublishPayload,
  PublishResult,
  AuthTokenResult,
  SocialInsights,
  TimeRange,
  AudienceHeatmapData,
  ProviderConfigurationError,
  LiveAnalyticsNotSupportedError,
} from "../types";

export class PaidApiGuardrailError extends Error {
  public costEstimateUsd: number;
  constructor(message: string, costEstimateUsd: number = 0.015) {
    super(message);
    this.name = "PaidApiGuardrailError";
    this.costEstimateUsd = costEstimateUsd;
  }
}

export class XLiveProvider implements ISocialProvider {
  public platform: SocialPlatform = "X";

  private getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID || "";
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET || "";
    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl.replace(/\/+$/, "")}/api/auth/callback/x`;

    if (!clientId || !clientSecret) {
      throw new ProviderConfigurationError(
        "X",
        "X (Twitter) live integration is not configured: TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET environment variables are required."
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Generates X (Twitter) OAuth 2.0 PKCE authorization URL using S256 code_challenge.
   * Refuses fixed or plain challenges.
   */
  async getAuthUrl(state: string, codeChallenge?: string): Promise<string> {
    const { clientId, redirectUri } = this.getCredentials();

    if (!codeChallenge || codeChallenge.length < 43) {
      throw new Error(
        "X OAuth 2.0 requires a cryptographically random PKCE S256 code_challenge (minimum 43 characters)."
      );
    }

    const scopes = ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" ");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges OAuth 2.0 PKCE authorization code for X tokens.
   * Requires explicit billing authorization (ALLOW_PAID_X_API=true) before calling live X endpoints,
   * and never returns synthetic account data.
   */
  async exchangeCode(code: string, codeVerifier?: string): Promise<AuthTokenResult> {
    const { clientId, clientSecret, redirectUri } = this.getCredentials();

    if (!codeVerifier || codeVerifier.length < 43) {
      throw new Error("X OAuth 2.0 token exchange requires the original PKCE code_verifier.");
    }

    if (process.env.ALLOW_PAID_X_API !== "true") {
      throw new PaidApiGuardrailError(
        "Paid API Guardrail: Live X API calls are disabled to prevent consumption billing. Keep X in mock mode or set ALLOW_PAID_X_API=true."
      );
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, "utf-8").toString("base64");
    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`X OAuth token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("X OAuth response did not contain an access_token");
    }

    const userRes = await fetch(
      "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url,public_metrics",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!userRes.ok) {
      const errText = await userRes.text();
      throw new Error(`Failed to fetch X user profile (${userRes.status}): ${errText}`);
    }

    const userData = await userRes.json();
    const user = userData.data;
    if (!user?.id || !user?.username) {
      throw new Error("X user profile response did not contain a valid id and username");
    }

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: Number(tokenData.expires_in) || 7200,
      platformAccountId: String(user.id),
      username: `@${user.username.replace(/^@/, "")}`,
      displayName: user.name || user.username,
      avatarUrl: user.profile_image_url,
      followersCount: Number(user.public_metrics?.followers_count) || 0,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenResult> {
    const { clientId, clientSecret } = this.getCredentials();

    if (process.env.ALLOW_PAID_X_API !== "true") {
      throw new PaidApiGuardrailError(
        "Paid API Guardrail: Live X API calls are disabled to prevent consumption billing."
      );
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, "utf-8").toString("base64");
    const res = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        client_id: clientId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`X token refresh failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresInSeconds: Number(data.expires_in) || 7200,
      platformAccountId: "",
      username: "",
      displayName: "",
      followersCount: 0,
    };
  }

  /**
   * Strictly blocks live X API writes (~$0.015/post) in Phase 6B.
   * Never returns synthetic tweet IDs or URLs.
   */
  async publishPost(
    _account: ConnectedAccountData,
    _payload: PostPublishPayload
  ): Promise<PublishResult> {
    throw new PaidApiGuardrailError(
      "Paid API Guardrail: Live X (Twitter) post creation is disabled in Phase 6B because X charges consumption-based pricing (~$0.015/post). Use XMockProvider for zero-cost testing."
    );
  }

  async fetchInsights(_account: ConnectedAccountData, _timeRange: TimeRange): Promise<SocialInsights> {
    throw new LiveAnalyticsNotSupportedError(
      "X",
      "Live X analytics ingestion is disabled to prevent paid API consumption. Use mock mode for simulated analytics."
    );
  }

  async fetchAudienceActivity(_account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    throw new LiveAnalyticsNotSupportedError(
      "X",
      "Live X audience heatmaps are disabled to prevent paid API consumption. Use mock mode for simulated heatmaps."
    );
  }
}
