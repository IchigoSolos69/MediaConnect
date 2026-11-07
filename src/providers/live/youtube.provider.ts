import { db } from "@/lib/db";
import { StorageService, verifyFileSignature } from "@/services/storage.service";
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

/**
 * Persistent database-backed quota tracker for YouTube Data API v3 daily video.insert calls.
 * Enforces Google's default 100 videos.insert calls per day limit across process restarts.
 */
export class YouTubeQuotaManager {
  public static getDailyLimit(): number {
    const configured = parseInt(process.env.YOUTUBE_DAILY_UPLOAD_LIMIT || "100", 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 100;
  }

  static async checkAndReserveUploadQuota(
    entityId: string
  ): Promise<{ allowed: boolean; remaining: number; used: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const limitCount = this.getDailyLimit();

    const existing = await db.platformQuota.findUnique({
      where: {
        platform_entityId_date: {
          platform: "YOUTUBE",
          entityId,
          date: today,
        },
      },
    });

    if (existing && existing.usedCount >= limitCount) {
      return {
        allowed: false,
        remaining: 0,
        used: existing.usedCount,
      };
    }

    const updated = await db.platformQuota.upsert({
      where: {
        platform_entityId_date: {
          platform: "YOUTUBE",
          entityId,
          date: today,
        },
      },
      update: {
        usedCount: { increment: 1 },
        limitCount,
      },
      create: {
        platform: "YOUTUBE",
        entityId,
        date: today,
        usedCount: 1,
        limitCount,
      },
    });

    if (updated.usedCount > limitCount) {
      return {
        allowed: false,
        remaining: 0,
        used: updated.usedCount,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limitCount - updated.usedCount),
      used: updated.usedCount,
    };
  }

  static async getRemainingQuota(entityId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const limitCount = this.getDailyLimit();
    const existing = await db.platformQuota.findUnique({
      where: {
        platform_entityId_date: {
          platform: "YOUTUBE",
          entityId,
          date: today,
        },
      },
    });
    if (!existing) return limitCount;
    return Math.max(0, limitCount - existing.usedCount);
  }
}

export class YouTubeLiveProvider implements ISocialProvider {
  public platform: SocialPlatform = "YOUTUBE";
  private idempotencyCache = new Map<string, PublishResult>();

  private getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = process.env.YOUTUBE_CLIENT_ID || "";
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl.replace(/\/+$/, "")}/api/auth/callback/youtube`;

    if (!clientId || !clientSecret) {
      throw new ProviderConfigurationError(
        "YOUTUBE",
        "YouTube live integration is not configured: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET environment variables are required."
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Generates Google OAuth 2.0 Authorization URL with PKCE S256 support.
   */
  async getAuthUrl(state: string, codeChallenge?: string): Promise<string> {
    const { clientId, redirectUri } = this.getCredentials();

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code (and PKCE code_verifier) for access and refresh tokens,
   * then retrieves the authenticated user's real YouTube channel profile.
   */
  async exchangeCode(code: string, codeVerifier?: string): Promise<AuthTokenResult> {
    const { clientId, clientSecret, redirectUri } = this.getCredentials();

    const bodyParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    if (codeVerifier) {
      bodyParams.set("code_verifier", codeVerifier);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams,
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`YouTube OAuth token exchange failed (${tokenRes.status}): ${errBody}`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("YouTube OAuth token response did not contain an access_token");
    }

    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!channelRes.ok) {
      const errText = await channelRes.text();
      throw new Error(`Failed to fetch YouTube channel profile (${channelRes.status}): ${errText}`);
    }

    const channelData = await channelRes.json();
    const item = channelData.items?.[0];
    if (!item || !item.id) {
      throw new Error("No YouTube channel found for the authenticated Google account");
    }

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: Number(tokenData.expires_in) || 3600,
      platformAccountId: String(item.id),
      username: item.snippet?.customUrl || `@${(item.snippet?.title || item.id).replace(/\s+/g, "")}`,
      displayName: item.snippet?.title || "YouTube Channel",
      avatarUrl: item.snippet?.thumbnails?.default?.url,
      followersCount: parseInt(item.statistics?.subscriberCount || "0", 10),
    };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokenResult> {
    const { clientId, clientSecret } = this.getCredentials();
    if (!refreshToken) {
      throw new Error("Cannot refresh YouTube token: refreshToken is empty");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`YouTube token refresh failed (${tokenRes.status}): ${errText}`);
    }

    const data = await tokenRes.json();
    if (!data.access_token) {
      throw new Error("YouTube refresh response did not include an access_token");
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresInSeconds: Number(data.expires_in) || 3600,
      platformAccountId: "",
      username: "",
      displayName: "",
      followersCount: 0,
    };
  }

  /**
   * Resolves the binary video buffer from the publish payload or storage service.
   */
  private async resolveVideoBuffer(
    payload: PostPublishPayload
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const mimeType = payload.mediaMimeType || "video/mp4";

    if (payload.mediaBuffer && Buffer.isBuffer(payload.mediaBuffer)) {
      const sig = verifyFileSignature(payload.mediaBuffer, mimeType);
      if (!sig.valid) {
        throw new Error(`Invalid video payload: ${sig.reason}`);
      }
      return { buffer: payload.mediaBuffer, mimeType };
    }

    const mediaUrl = payload.mediaUrls?.[0];
    if (!mediaUrl) {
      throw new Error("YouTube publishing requires a video file (mediaUrls is empty and no mediaBuffer provided).");
    }

    if (mediaUrl.startsWith("https://") || mediaUrl.startsWith("http://")) {
      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) {
        throw new Error(`Failed to download video media from ${mediaUrl} (HTTP ${mediaRes.status})`);
      }
      const arrayBuf = await mediaRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const detectedMime = mediaRes.headers.get("content-type") || mimeType;
      const sig = verifyFileSignature(buffer, detectedMime);
      if (!sig.valid) {
        throw new Error(`Downloaded media failed signature check: ${sig.reason}`);
      }
      return { buffer, mimeType: detectedMime };
    }

    if (mediaUrl.startsWith("/uploads/")) {
      const storageKey = mediaUrl.replace(/^\/uploads\//, "");
      const workspaceSegment = storageKey.split("/")[0];
      const buffer = await StorageService.getProvider().read(storageKey, workspaceSegment);
      const sig = verifyFileSignature(buffer, mimeType);
      if (!sig.valid) {
        throw new Error(`Stored video failed signature check: ${sig.reason}`);
      }
      return { buffer, mimeType };
    }

    throw new Error(`Unsupported video media source URL for YouTube upload: ${mediaUrl}`);
  }

  /**
   * Queries an existing resumable upload session to determine how many bytes YouTube has received,
   * or whether the upload has already completed.
   */
  private async queryResumableUploadStatus(
    sessionUri: string,
    accessToken: string,
    totalBytes: number
  ): Promise<{ completed: boolean; videoId?: string; nextByteOffset: number }> {
    const statusRes = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": "0",
        "Content-Range": `bytes */${totalBytes}`,
      },
    });

    if (statusRes.status === 200 || statusRes.status === 201) {
      const data = await statusRes.json();
      if (!data?.id) {
        throw new Error("YouTube resumable status returned 200 OK but no video ID was present.");
      }
      return { completed: true, videoId: String(data.id), nextByteOffset: totalBytes };
    }

    if (statusRes.status === 308) {
      const rangeHeader = statusRes.headers.get("range");
      if (!rangeHeader) {
        return { completed: false, nextByteOffset: 0 };
      }
      const match = /bytes=0-(\d+)/.exec(rangeHeader);
      if (match) {
        return { completed: false, nextByteOffset: parseInt(match[1], 10) + 1 };
      }
      return { completed: false, nextByteOffset: 0 };
    }

    const errText = await statusRes.text();
    throw new Error(`YouTube resumable session status check failed (${statusRes.status}): ${errText}`);
  }

  /**
   * Transfers binary chunks to the YouTube resumable session URL with interrupted upload recovery.
   */
  private async transferBinaryToResumableSession(
    sessionUri: string,
    accessToken: string,
    videoBuffer: Buffer,
    mimeType: string,
    startOffset = 0
  ): Promise<string> {
    const totalBytes = videoBuffer.length;
    const chunkSize = 4 * 1024 * 1024; // 4 MB chunk size
    let offset = startOffset;

    while (offset < totalBytes) {
      const endExclusive = Math.min(offset + chunkSize, totalBytes);
      const chunk = videoBuffer.subarray(offset, endExclusive);
      const contentRange = `bytes ${offset}-${endExclusive - 1}/${totalBytes}`;

      const putRes = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType,
          "Content-Length": String(chunk.length),
          "Content-Range": contentRange,
        },
        body: new Uint8Array(chunk),
      });

      if (putRes.status === 200 || putRes.status === 201) {
        const resultData = await putRes.json();
        if (!resultData || typeof resultData.id !== "string" || !resultData.id.trim()) {
          throw new Error("YouTube upload finished with 200/201 but returned no confirmed video ID.");
        }
        return resultData.id;
      }

      if (putRes.status === 308) {
        const rangeHeader = putRes.headers.get("range");
        if (rangeHeader) {
          const match = /bytes=0-(\d+)/.exec(rangeHeader);
          offset = match ? parseInt(match[1], 10) + 1 : endExclusive;
        } else {
          offset = endExclusive;
        }
        continue;
      }

      // If transient 5xx error occurs mid-transfer, query session status to recover offset once
      if (putRes.status === 500 || putRes.status === 502 || putRes.status === 503 || putRes.status === 504) {
        const recovery = await this.queryResumableUploadStatus(sessionUri, accessToken, totalBytes);
        if (recovery.completed && recovery.videoId) {
          return recovery.videoId;
        }
        offset = recovery.nextByteOffset;
        continue;
      }

      const errText = await putRes.text();
      throw new Error(`YouTube binary chunk upload failed (${putRes.status}): ${errText}`);
    }

    throw new Error("YouTube binary transfer loop ended without final confirmation from API.");
  }

  /**
   * Publishes a video to YouTube using the complete Data API v3 Resumable Upload protocol.
   * Never generates synthetic IDs or URLs.
   */
  async publishPost(
    account: ConnectedAccountData,
    payload: PostPublishPayload
  ): Promise<PublishResult> {
    this.getCredentials();

    if (account.isMock) {
      throw new ProviderConfigurationError(
        "YOUTUBE",
        "Mock accounts cannot be published via YouTubeLiveProvider. Use YouTubeMockProvider."
      );
    }

    if (!account.accessToken) {
      throw new ProviderConfigurationError(
        "YOUTUBE",
        `Account ${account.id} is missing an access token for live YouTube publishing.`
      );
    }

    if (payload.idempotencyKey && this.idempotencyCache.has(payload.idempotencyKey)) {
      return this.idempotencyCache.get(payload.idempotencyKey)!;
    }

    // 1. Resolve & validate actual binary video content before consuming quota
    const { buffer: videoBuffer, mimeType } = await this.resolveVideoBuffer(payload);
    const totalBytes = videoBuffer.length;

    const title = (payload.videoTitle || payload.content.slice(0, 70) || "Untitled Video").trim();
    const description = payload.content;
    const isShort =
      title.toLowerCase().includes("#shorts") ||
      description.toLowerCase().includes("#shorts") ||
      Boolean(payload.videoTags && payload.videoTags.toLowerCase().includes("shorts"));

    let sessionUri = payload.resumableSessionUri || "";
    let startOffset = 0;

    // 2. If recovering an interrupted resumable session, query status first
    if (sessionUri) {
      const recovery = await this.queryResumableUploadStatus(
        sessionUri,
        account.accessToken,
        totalBytes
      );
      if (recovery.completed && recovery.videoId) {
        const liveUrl = isShort
          ? `https://www.youtube.com/shorts/${recovery.videoId}`
          : `https://www.youtube.com/watch?v=${recovery.videoId}`;
        const recoveredResult: PublishResult = {
          success: true,
          platformPostId: recovery.videoId,
          liveUrl,
          publishedAt: new Date(),
          resumableSessionUri: sessionUri,
        };
        if (payload.idempotencyKey) {
          this.idempotencyCache.set(payload.idempotencyKey, recoveredResult);
        }
        return recoveredResult;
      }
      startOffset = recovery.nextByteOffset;
    } else {
      // 3. Enforce persistent daily videos.insert quota before initiating a new session
      const quota = await YouTubeQuotaManager.checkAndReserveUploadQuota(
        account.platformAccountId
      );
      if (!quota.allowed) {
        throw new Error(
          `YouTube daily video upload quota exceeded (${YouTubeQuotaManager.getDailyLimit()} videos.insert calls/day limit reached for ${account.platformAccountId}).`
        );
      }

      const metadata = {
        snippet: {
          title,
          description,
          tags: payload.videoTags
            ? payload.videoTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          categoryId: "22",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      };

      const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(totalBytes),
            "X-Upload-Content-Type": mimeType,
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!initRes.ok) {
        const err = await initRes.text();
        throw new Error(`YouTube resumable upload initialization failed (${initRes.status}): ${err}`);
      }

      const location = initRes.headers.get("location");
      if (!location) {
        throw new Error("YouTube API did not return a resumable upload session 'location' header.");
      }
      sessionUri = location;
    }

    // 4. Upload actual video bytes and obtain the API-confirmed video ID
    let confirmedVideoId: string;
    try {
      confirmedVideoId = await this.transferBinaryToResumableSession(
        sessionUri,
        account.accessToken,
        videoBuffer,
        mimeType,
        startOffset
      );
    } catch (transferErr) {
      const enriched = transferErr as Error & { resumableSessionUri?: string };
      enriched.resumableSessionUri = sessionUri;
      throw enriched;
    }

    const liveUrl = isShort
      ? `https://www.youtube.com/shorts/${confirmedVideoId}`
      : `https://www.youtube.com/watch?v=${confirmedVideoId}`;

    const result: PublishResult = {
      success: true,
      platformPostId: confirmedVideoId,
      liveUrl,
      publishedAt: new Date(),
      resumableSessionUri: sessionUri,
    };

    if (payload.idempotencyKey) {
      this.idempotencyCache.set(payload.idempotencyKey, result);
    }

    return result;
  }

  /**
   * Live analytics boundary: Queries real YouTube Analytics API v2 reports if configured;
   * never returns fabricated metrics disguised as live data.
   */
  async fetchInsights(account: ConnectedAccountData, timeRange: TimeRange): Promise<SocialInsights> {
    this.getCredentials();

    if (account.isMock || !account.accessToken) {
      throw new LiveAnalyticsNotSupportedError(
        "YOUTUBE",
        "Live YouTube analytics requires a connected live account with a valid access token."
      );
    }

    const startDate = timeRange.startDate.toISOString().slice(0, 10);
    const endDate = timeRange.endDate.toISOString().slice(0, 10);

    const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    url.searchParams.set("ids", "channel==MINE");
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("metrics", "views,likes,comments,shares,subscribersGained");
    url.searchParams.set("dimensions", "day");
    url.searchParams.set("sort", "day");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube Analytics API request failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const rows: Array<[string, number, number, number, number, number]> = data.rows || [];

    let totalViews = 0;
    let totalEngagements = 0;
    let followerGrowth = 0;

    const dailyMetrics = rows.map((row) => {
      const [date, views, likes, comments, shares, subsGained] = row;
      const engagements = (likes || 0) + (comments || 0) + (shares || 0);
      totalViews += views || 0;
      totalEngagements += engagements;
      followerGrowth += subsGained || 0;

      return {
        date: String(date),
        impressions: views || 0,
        reach: views || 0,
        engagements,
        likes: likes || 0,
        comments: comments || 0,
        shares: shares || 0,
        clicks: 0,
        videoViews: views || 0,
      };
    });

    const engagementRate =
      totalViews > 0 ? Number(((totalEngagements / totalViews) * 100).toFixed(2)) : 0;

    return {
      platform: "YOUTUBE",
      totalImpressions: totalViews,
      totalReach: totalViews,
      totalEngagements,
      totalFollowers: 0,
      followerGrowth,
      engagementRate,
      dailyMetrics,
    };
  }

  /**
   * YouTube Data/Analytics APIs do not expose a 168-hour online-follower heatmap endpoint.
   * Refuses to return synthetic heatmap data in live mode.
   */
  async fetchAudienceActivity(_account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    throw new LiveAnalyticsNotSupportedError(
      "YOUTUBE",
      "YouTube API does not provide a 168-hour audience activity heatmap endpoint. Use mock mode for simulated heatmap previews."
    );
  }
}
