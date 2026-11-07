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
   * Publishes media via the full Instagram Graph API workflow with ambiguous-failure reconciliation:
   * 0. Reconcile existing publishedMediaId or remoteContainerId from prior interrupted attempt
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

    let creationId = payload.remoteContainerId ? String(payload.remoteContainerId) : "";
    let publishedMediaId = payload.existingPlatformPostId
      ? String(payload.existingPlatformPostId)
      : "";

    const attachStateAndThrow = (err: unknown): never => {
      const enriched = (err instanceof Error ? err : new Error(String(err))) as Error & {
        remoteContainerId?: string;
        platformPostId?: string;
      };
      if (creationId) enriched.remoteContainerId = creationId;
      if (publishedMediaId) enriched.platformPostId = publishedMediaId;
      throw enriched;
    };

    try {
      // Step 0A: If publishedMediaId is already recorded from a prior attempt where permalink retrieval failed,
      // skip container creation and media_publish entirely and go straight to permalink reconciliation!
      if (!publishedMediaId && creationId) {
        // Step 0B: Check existing container status on Instagram before creating a new one
        const checkUrl = new URL(`https://graph.instagram.com/v21.0/${creationId}`);
        checkUrl.searchParams.set("fields", "status_code,status,error_message");
        checkUrl.searchParams.set("access_token", accessToken);

        const checkRes = await fetch(checkUrl.toString());
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const code = String(checkData.status_code || "").toUpperCase();

          if (code === "PUBLISHED") {
            // Container was already published! Reconcile the published media ID from the user's recent media feed
            const feedRes = await fetch(
              `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,caption,permalink,shortcode,media_type,timestamp&limit=10&access_token=${encodeURIComponent(accessToken)}`
            );
            if (feedRes.ok) {
              const feedData = await feedRes.json();
              const items: Array<{
                id: string;
                caption?: string;
                permalink?: string;
                shortcode?: string;
              }> = feedData.data || [];
              const matched =
                items.find((item) => item.caption === payload.content) || items[0];
              if (matched?.id) {
                publishedMediaId = String(matched.id);
                if (matched.permalink || matched.shortcode) {
                  const reconciledPermalink =
                    matched.permalink ||
                    `https://www.instagram.com/${isVideo ? "reel" : "p"}/${matched.shortcode}/`;
                  const reconciledResult: PublishResult = {
                    success: true,
                    platformPostId: publishedMediaId,
                    liveUrl: reconciledPermalink,
                    publishedAt: new Date(),
                    remoteContainerId: creationId,
                  };
                  if (payload.idempotencyKey) {
                    this.idempotencyCache.set(payload.idempotencyKey, reconciledResult);
                  }
                  return reconciledResult;
                }
              }
            }
          } else if (code === "ERROR" || code === "EXPIRED") {
            throw new InstagramMediaProcessingError(
              creationId,
              code,
              `Instagram media container ${creationId} failed with status ${code}: ${checkData.error_message || "Media processing error"}`
            );
          } else if (code === "IN_PROGRESS") {
            await this.waitForContainerReady(creationId, accessToken);
          }
          // If code === "FINISHED", we already have a ready container and can proceed to Step 3 (media_publish)
        }
      }

      if (!publishedMediaId) {
        if (!creationId) {
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
          creationId = containerData?.id ? String(containerData.id) : "";
          if (!creationId) {
            throw new Error("Instagram container creation did not return a valid container ID.");
          }

          // Step 2: Poll container processing status until FINISHED
          await this.waitForContainerReady(creationId, accessToken);
        }

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
        publishedMediaId = publishData?.id ? String(publishData.id) : "";
        if (!publishedMediaId) {
          throw new Error("Instagram media_publish did not return a confirmed media ID.");
        }
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
        remoteContainerId: creationId || undefined,
      };

      if (payload.idempotencyKey) {
        this.idempotencyCache.set(payload.idempotencyKey, result);
      }

      return result;
    } catch (err) {
      return attachStateAndThrow(err);
    }
  }

  /**
   * Live analytics ingestion: Queries real Instagram Graph API v21.0 user insights and profile metrics.
   * Respects metric availability, permissions, and 100-follower minimums without fabricating data.
   */
  async fetchInsights(account: ConnectedAccountData, timeRange: TimeRange): Promise<SocialInsights> {
    this.getCredentials();
    if (account.isMock || !account.accessToken) {
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        "Live Instagram analytics requires a connected live account with a valid access token."
      );
    }

    const igUserId = account.platformAccountId;
    const accessToken = account.accessToken;
    const sinceUnix = Math.floor(timeRange.startDate.getTime() / 1000);
    const untilUnix = Math.floor(timeRange.endDate.getTime() / 1000);

    // Meta deprecated 'impressions' on Instagram in 2025 in favor of 'views'.
    // Query currently supported metrics: views, reach, total_interactions, follower_count.
    const insightsUrl = new URL(`https://graph.instagram.com/v21.0/${igUserId}/insights`);
    insightsUrl.searchParams.set("metric", "views,reach,total_interactions,follower_count");
    insightsUrl.searchParams.set("period", "day");
    insightsUrl.searchParams.set("since", String(sinceUnix));
    insightsUrl.searchParams.set("until", String(untilUnix));
    insightsUrl.searchParams.set("access_token", accessToken);

    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(insightsUrl.toString());
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 200));
          continue;
        }
      }
      break;
    }

    // Graceful fallback: If an environment/mock specifically provides 'impressions' instead of 'views', try fallback
    if (!res || !res.ok) {
      const errText = res ? await res.text() : "No response";
      if (res?.status === 400 && errText.toLowerCase().includes("views")) {
        const fallbackUrl = new URL(insightsUrl.toString());
        fallbackUrl.searchParams.set("metric", "reach,impressions,total_interactions,follower_count");
        res = await fetch(fallbackUrl.toString());
      } else {
        throw new Error(`Instagram Graph Insights API request failed (${res?.status || 500}): ${errText}`);
      }
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : "No response";
      throw new Error(`Instagram Graph Insights API request failed (${res?.status || 500}): ${errText}`);
    }

    const insightsPayload = await res.json();
    const seriesList: Array<{
      name: string;
      values?: Array<{ value: number; end_time: string }>;
    }> = insightsPayload.data || [];

    // Fetch current profile followers_count
    let currentFollowers = 0;
    try {
      const profRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`
      );
      if (profRes.ok) {
        const profData = await profRes.json();
        currentFollowers = Number(profData.followers_count) || 0;
      }
    } catch {
      // Non-fatal
    }

    const dailyByDate = new Map<
      string,
      {
        impressions: number;
        reach: number;
        engagements: number;
        followerDelta: number;
        hasFollowerDelta: boolean;
      }
    >();

    const seenMetricNames = new Set<string>();

    for (const metricSeries of seriesList) {
      const metricName = metricSeries.name;
      seenMetricNames.add(metricName);
      for (const point of metricSeries.values || []) {
        const dateKey = (point.end_time || "").slice(0, 10);
        if (!dateKey) continue;
        const entry = dailyByDate.get(dateKey) || {
          impressions: 0,
          reach: 0,
          engagements: 0,
          followerDelta: 0,
          hasFollowerDelta: false,
        };
        const val = Number(point.value) || 0;
        if (metricName === "views" || metricName === "impressions") {
          entry.impressions = val;
        } else if (metricName === "reach") {
          entry.reach = val;
        } else if (metricName === "total_interactions" || metricName === "accounts_engaged") {
          entry.engagements = val;
        } else if (metricName === "follower_count") {
          entry.followerDelta = val;
          entry.hasFollowerDelta = true;
        }
        dailyByDate.set(dateKey, entry);
      }
    }

    const availableMetrics: string[] = [];
    const unavailableMetrics: string[] = ["clicks"];

    if (seenMetricNames.has("views") || seenMetricNames.has("impressions")) {
      availableMetrics.push("views");
      availableMetrics.push("impressions");
    } else {
      unavailableMetrics.push("views");
      unavailableMetrics.push("impressions");
    }

    if (seenMetricNames.has("reach")) {
      availableMetrics.push("reach");
    } else {
      unavailableMetrics.push("reach");
    }

    if (seenMetricNames.has("total_interactions") || seenMetricNames.has("accounts_engaged")) {
      availableMetrics.push("engagements");
    } else {
      unavailableMetrics.push("engagements");
    }

    const hasFollowerGrowthSeries = seenMetricNames.has("follower_count");
    if (hasFollowerGrowthSeries) {
      availableMetrics.push("followerGrowth");
    } else {
      unavailableMetrics.push("followerGrowth");
    }

    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagements = 0;
    let followerGrowthSum = 0;

    const sortedDates = Array.from(dailyByDate.keys()).sort();
    const dailyMetrics = sortedDates.map((date) => {
      const row = dailyByDate.get(date)!;
      totalImpressions += row.impressions;
      totalReach += row.reach;
      totalEngagements += row.engagements;
      followerGrowthSum += row.followerDelta;

      return {
        date,
        impressions: row.impressions,
        reach: row.reach,
        engagements: row.engagements,
        likes: row.engagements,
        comments: 0,
        shares: 0,
        clicks: 0,
        followers: currentFollowers,
        followerGrowth: row.hasFollowerDelta ? row.followerDelta : undefined,
        availableMetrics,
      };
    });

    const denominator = totalImpressions > 0 ? totalImpressions : totalReach;
    const engagementRate =
      denominator > 0 ? Number(((totalEngagements / denominator) * 100).toFixed(2)) : 0;

    return {
      platform: "INSTAGRAM",
      source: "LIVE_INSTAGRAM_INSIGHTS",
      syncedAt: new Date(),
      unavailableMetrics,
      reportingDelayHours: 24,
      totalImpressions,
      totalReach,
      totalEngagements,
      totalFollowers: currentFollowers,
      followerGrowth: hasFollowerGrowthSeries ? followerGrowthSum : null,
      engagementRate,
      dailyMetrics,
    };
  }

  /**
   * Queries real Instagram `online_followers` lifetime insight when available (requires >= 100 followers).
   * Never fabricates synthetic heatmap cells.
   */
  async fetchAudienceActivity(account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    this.getCredentials();
    if (account.isMock || !account.accessToken) {
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        "Live Instagram audience activity requires a connected live account with a valid access token."
      );
    }

    const url = new URL(`https://graph.instagram.com/v21.0/${account.platformAccountId}/insights`);
    url.searchParams.set("metric", "online_followers");
    url.searchParams.set("period", "lifetime");
    url.searchParams.set("access_token", account.accessToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errText = await res.text();
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        `Instagram online_followers insight is unavailable (${res.status}): ${errText}`
      );
    }

    const payload = await res.json();
    const rawValue = payload.data?.[0]?.values?.[0]?.value as
      | Record<string, number | Record<string, number>>
      | undefined;

    if (!rawValue || Object.keys(rawValue).length === 0) {
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        "Instagram online_followers returned no audience activity data (professional account requires at least 100 followers)."
      );
    }

    const firstEntry = Object.values(rawValue)[0];
    const isHourlyFlatMap = typeof firstEntry === "number";

    const getHourCount = (day: number, hour: number): number => {
      if (isHourlyFlatMap) {
        return Number((rawValue as Record<string, number>)[String(hour)]) || 0;
      }
      const dayMap = (rawValue[String(day)] as Record<string, number> | undefined) || {};
      return Number(dayMap[String(hour)]) || 0;
    };

    let maxCount = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const count = getHourCount(d, h);
        if (count > maxCount) maxCount = count;
      }
    }

    if (maxCount === 0) {
      throw new LiveAnalyticsNotSupportedError(
        "INSTAGRAM",
        "Instagram online_followers returned zero active audience counts."
      );
    }

    const cells: Array<{ dayOfWeek: number; hour: number; activityScore: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const count = getHourCount(d, h);
        const score = Math.round((count / maxCount) * 100);
        cells.push({ dayOfWeek: d, hour: h, activityScore: score });
      }
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const bestTimeSlots = [...cells]
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 3)
      .map((slot) => {
        const h = slot.hour % 12 || 12;
        const ampm = slot.hour >= 12 ? "PM" : "AM";
        return {
          dayOfWeek: slot.dayOfWeek,
          hour: slot.hour,
          label: `${dayNames[slot.dayOfWeek]} ${h}:00 ${ampm}`,
        };
      });

    return {
      platform: "INSTAGRAM",
      bestTimeSlots,
      cells,
    };
  }
}
