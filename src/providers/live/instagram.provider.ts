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

export class InstagramMediaProcessingError extends Error {
  public containerId: string;
  public statusCode: string;
  constructor(containerId: string, statusCode: string, message: string) {
    super(message);
    this.name = "InstagramMediaProcessingError";
    this.containerId = containerId;
    this.statusCode = statusCode;
  }
}

export class InstagramLiveProvider implements ISocialProvider {
  public platform: SocialPlatform = "INSTAGRAM";
  private idempotencyCache = new Map<string, PublishResult>();

  private getCredentials(): { appId: string; appSecret: string; redirectUri: string } {
    const appId = process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID || "";
    const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_CLIENT_SECRET || "";
    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl.replace(/\/+$/, "")}/api/auth/callback/instagram`;

    if (!appId || !appSecret) {
      throw new ProviderConfigurationError(
        "INSTAGRAM",
        "Instagram live integration is not configured: META_APP_ID and META_APP_SECRET environment variables are required."
      );
    }

    return { appId, appSecret, redirectUri };
  }

  /**
   * Generates Instagram Login authorization URL for professional (Creator/Business) accounts.
   */
  async getAuthUrl(state: string): Promise<string> {
    const { appId, redirectUri } = this.getCredentials();

    const scopes = [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_insights",
      "instagram_business_manage_comments",
    ].join(",");

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: "code",
      state,
    });

    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchanges OAuth code for short-lived token, upgrades to a 60-day long-lived token,
   * and verifies the professional account profile via Instagram Graph API.
   */
  async exchangeCode(code: string): Promise<AuthTokenResult> {
    const { appId, appSecret, redirectUri } = this.getCredentials();

    // Step 1: Exchange code for short-lived access token
    const tokenFormData = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenFormData,
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Instagram OAuth code exchange failed (${tokenRes.status}): ${err}`);
    }

    const shortTokenData = await tokenRes.json();
    const shortLivedToken = shortTokenData.access_token;
    const igUserId = shortTokenData.user_id;

    if (!shortLivedToken) {
      throw new Error("Instagram OAuth response did not include an access_token");
    }

    // Step 2: Upgrade to 60-day long-lived access token
    const longTokenUrl = new URL("https://graph.instagram.com/access_token");
    longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("access_token", shortLivedToken);

    const longRes = await fetch(longTokenUrl.toString());
    if (!longRes.ok) {
      const errText = await longRes.text();
      throw new Error(`Instagram long-lived token exchange failed (${longRes.status}): ${errText}`);
    }

    const longData = await longRes.json();
    const accessToken = longData.access_token || shortLivedToken;
    const expiresInSeconds = Number(longData.expires_in) || 5184000;

    // Step 3: Fetch verified professional account profile
    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url,followers_count,account_type&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      throw new Error(`Failed to fetch Instagram account profile (${profileRes.status}): ${errText}`);
    }

    const profileData = await profileRes.json();
    const resolvedId = String(profileData.user_id || profileData.id || igUserId || "");
    if (!resolvedId || !profileData.username) {
      throw new Error("Instagram profile response did not contain a valid user_id and username");
    }

    return {
      accessToken,
      refreshToken: accessToken, // Instagram refreshes long-lived tokens directly via ig_refresh_token
      expiresInSeconds,
      platformAccountId: resolvedId,
      username: profileData.username.startsWith("@")
        ? profileData.username
        : `@${profileData.username}`,
      displayName: profileData.name || profileData.username,
      avatarUrl: profileData.profile_picture_url,
      followersCount: Number(profileData.followers_count) || 0,
    };
  }

  /**
   * Refreshes a long-lived Instagram access token for another 60 days.
   */
  async refreshToken(token: string): Promise<AuthTokenResult> {
    this.getCredentials();
    if (!token) {
      throw new Error("Cannot refresh Instagram token: token is empty");
    }

    const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
    refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
    refreshUrl.searchParams.set("access_token", token);

    const res = await fetch(refreshUrl.toString());
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to refresh Instagram access token (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error("Instagram token refresh response did not contain access_token");
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.access_token,
      expiresInSeconds: Number(data.expires_in) || 5184000,
      platformAccountId: "",
      username: "",
      displayName: "",
      followersCount: 0,
    };
  }

  /**
   * Polls Instagram media container processing status until FINISHED.
   */
  private async waitForContainerReady(
    containerId: string,
    accessToken: string
  ): Promise<void> {
    const maxAttempts = parseInt(process.env.INSTAGRAM_POLL_MAX_ATTEMPTS || "10", 10);
    const baseIntervalMs = parseInt(process.env.INSTAGRAM_POLL_INTERVAL_MS || "1000", 10);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statusUrl = new URL(`https://graph.instagram.com/v21.0/${containerId}`);
      statusUrl.searchParams.set("fields", "status_code,status,error_message");
      statusUrl.searchParams.set("access_token", accessToken);

      const res = await fetch(statusUrl.toString());
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Failed to check Instagram media container ${containerId} status (${res.status}): ${errText}`
        );
      }

      const data = await res.json();
      const statusCode = String(data.status_code || "").toUpperCase();

      if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
        return;
      }

      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new InstagramMediaProcessingError(
          containerId,
          statusCode,
          `Instagram media container ${containerId} failed with status ${statusCode}: ${data.error_message || data.status || "Media processing error"}`
        );
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseIntervalMs));
      }
    }

    throw new InstagramMediaProcessingError(
      containerId,
      "IN_PROGRESS",
      `Instagram media container ${containerId} did not finish processing after ${maxAttempts} polling attempts.`
    );
  }

  /**
   * Publishes media via the full Instagram Graph API workflow:
   * 1. Validate public media URL (never substitutes placeholder URLs)
   * 2. Create media container (POST /{ig-user-id}/media)
   * 3. Poll container status until FINISHED (GET /{container-id}?fields=status_code)
   * 4. Publish container (POST /{ig-user-id}/media_publish)
   * 5. Retrieve confirmed media permalink (GET /{media-id}?fields=id,permalink,shortcode)
   * 6. Optional: Post first comment
   */
  async publishPost(
    account: ConnectedAccountData,
    payload: PostPublishPayload
  ): Promise<PublishResult> {
    this.getCredentials();

    if (account.isMock) {
      throw new ProviderConfigurationError(
        "INSTAGRAM",
        "Mock accounts cannot be published via InstagramLiveProvider. Use InstagramMockProvider."
      );
    }

    if (!account.accessToken) {
      throw new ProviderConfigurationError(
        "INSTAGRAM",
        `Account ${account.id} is missing an access token for live Instagram publishing.`
      );
    }

    if (payload.idempotencyKey && this.idempotencyCache.has(payload.idempotencyKey)) {
      return this.idempotencyCache.get(payload.idempotencyKey)!;
    }

    const mediaUrl = payload.mediaUrls?.[0]?.trim();
    if (!mediaUrl) {
      throw new Error(
        "Instagram publishing requires a valid media URL. Refusing to publish without media."
      );
    }

    if (!mediaUrl.startsWith("https://")) {
      throw new Error(
        `Instagram Graph API requires a publicly accessible HTTPS media URL (received: ${mediaUrl}). Configure S3/R2 public storage for live publishing.`
      );
    }

    const igUserId = account.platformAccountId;
    const accessToken = account.accessToken;

    const lowerUrl = mediaUrl.toLowerCase();
    const isVideo =
      lowerUrl.endsWith(".mp4") ||
      lowerUrl.endsWith(".mov") ||
      payload.mediaMimeType?.startsWith("video/") ||
      false;

    // Step 1: Create media container
    const containerParams = new URLSearchParams({
      access_token: accessToken,
      caption: payload.content,
    });

    if (isVideo) {
      containerParams.set("media_type", "REELS");
      containerParams.set("video_url", mediaUrl);
    } else {
      containerParams.set("image_url", mediaUrl);
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: containerParams,
      }
    );

    if (!containerRes.ok) {
      const err = await containerRes.text();
      throw new Error(`Instagram container creation failed (${containerRes.status}): ${err}`);
    }

    const containerData = await containerRes.json();
    const creationId = containerData?.id ? String(containerData.id) : "";
    if (!creationId) {
      throw new Error("Instagram container creation did not return a valid container ID.");
    }

    // Step 2: Poll container processing status until FINISHED
    await this.waitForContainerReady(creationId, accessToken);

    // Step 3: Publish the processed container
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: publishParams,
      }
    );

    if (!publishRes.ok) {
      const err = await publishRes.text();
      throw new Error(`Instagram media publishing failed (${publishRes.status}): ${err}`);
    }

    const publishData = await publishRes.json();
    const publishedMediaId = publishData?.id ? String(publishData.id) : "";
    if (!publishedMediaId) {
      throw new Error("Instagram media_publish did not return a confirmed media ID.");
    }

    // Step 4: Fetch the confirmed permalink from Instagram Graph API
    const permalinkRes = await fetch(
      `https://graph.instagram.com/v21.0/${publishedMediaId}?fields=id,permalink,shortcode,media_type&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!permalinkRes.ok) {
      const err = await permalinkRes.text();
      throw new Error(
        `Instagram media ${publishedMediaId} was published, but permalink confirmation failed (${permalinkRes.status}): ${err}`
      );
    }

    const permalinkData = await permalinkRes.json();
    const confirmedPermalink =
      permalinkData.permalink ||
      (permalinkData.shortcode
        ? `https://www.instagram.com/${isVideo ? "reel" : "p"}/${permalinkData.shortcode}/`
        : "");

    if (!confirmedPermalink) {
      throw new Error(
        `Instagram Graph API did not return a permalink or shortcode for published media ${publishedMediaId}.`
      );
    }

    // Step 5: Optional first comment
    if (payload.firstComment && payload.firstComment.trim()) {
      const commentRes = await fetch(
        `https://graph.instagram.com/v21.0/${publishedMediaId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            message: payload.firstComment,
            access_token: accessToken,
          }),
        }
      );
      if (!commentRes.ok) {
        const errText = await commentRes.text();
        console.warn(`First comment failed on media ${publishedMediaId}: ${errText}`);
      }
    }

    const result: PublishResult = {
      success: true,
      platformPostId: publishedMediaId,
      liveUrl: confirmedPermalink,
      publishedAt: new Date(),
    };

    if (payload.idempotencyKey) {
      this.idempotencyCache.set(payload.idempotencyKey, result);
    }

    return result;
  }

  /**
   * Live analytics boundary: Refuses to return synthetic metrics disguised as live insights.
   */
  async fetchInsights(account: ConnectedAccountData, _timeRange: TimeRange): Promise<SocialInsights> {
    this.getCredentials();
    if (account.isMock || !account.accessToken) {
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        "Live Instagram analytics requires a connected live account with a valid access token."
      );
    }
    throw new LiveAnalyticsNotSupportedError(
      "INSTAGRAM",
      "Live Instagram insights ingestion is not enabled in Phase 6B. Use mock mode until Phase 6C analytics ingestion is activated."
    );
  }

  async fetchAudienceActivity(_account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    throw new LiveAnalyticsNotSupportedError(
      "INSTAGRAM",
      "Live Instagram audience activity heatmaps are not enabled in Phase 6B. Use mock mode for simulated heatmaps."
    );
  }
}
