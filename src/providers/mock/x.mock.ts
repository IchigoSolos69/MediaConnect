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
} from "../types";

export class XMockProvider implements ISocialProvider {
  public platform: SocialPlatform = "X";
  private idempotencyCache = new Map<string, PublishResult>();

  async getAuthUrl(state: string): Promise<string> {
    return `/api/auth/mock-callback?platform=X&state=${state}`;
  }

  async exchangeCode(_code: string): Promise<AuthTokenResult> {
    return {
      accessToken: "mock_x_access_token_" + Math.random().toString(36).substring(7),
      refreshToken: "mock_x_refresh_token_" + Math.random().toString(36).substring(7),
      expiresInSeconds: 7200,
      platformAccountId: "x_mock_" + Math.random().toString(36).substring(5),
      username: "@AcmeMediaHQ",
      displayName: "Acme Media HQ (Mock)",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      followersCount: 89100,
    };
  }

  async refreshToken(token: string): Promise<AuthTokenResult> {
    return this.exchangeCode(token);
  }

  async publishPost(
    account: ConnectedAccountData,
    payload: PostPublishPayload
  ): Promise<PublishResult> {
    if (payload.idempotencyKey && this.idempotencyCache.has(payload.idempotencyKey)) {
      return this.idempotencyCache.get(payload.idempotencyKey)!;
    }

    const tweetId = "18" + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    await new Promise((r) => setTimeout(r, 100));

    const result: PublishResult = {
      success: true,
      platformPostId: tweetId,
      liveUrl: `https://x.com/${account.username.replace("@", "")}/status/${tweetId}`,
      publishedAt: new Date(),
    };

    if (payload.idempotencyKey) {
      this.idempotencyCache.set(payload.idempotencyKey, result);
    }

    return result;
  }

  async fetchInsights(
    _account: ConnectedAccountData,
    _timeRange: TimeRange
  ): Promise<SocialInsights> {
    const days = 14;
    const dailyMetrics = [];
    let totalImpressions = 0;
    let totalEngagements = 0;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      const impressions = Math.floor(12000 + Math.random() * 6000);
      const reach = Math.floor(impressions * 0.85);
      const likes = Math.floor(impressions * 0.032);
      const comments = Math.floor(likes * 0.18);
      const shares = Math.floor(likes * 0.35); // Retweets
      const clicks = Math.floor(impressions * 0.045);
      const engagements = likes + comments + shares + clicks;

      totalImpressions += impressions;
      totalEngagements += engagements;

      dailyMetrics.push({
        date: dateStr,
        impressions,
        reach,
        engagements,
        likes,
        comments,
        shares,
        clicks,
      });
    }

    return {
      platform: "X",
      totalImpressions,
      totalReach: Math.floor(totalImpressions * 0.85),
      totalEngagements,
      totalFollowers: 89100,
      followerGrowth: 1140,
      engagementRate: Number(((totalEngagements / totalImpressions) * 100).toFixed(2)),
      dailyMetrics,
    };
  }

  async fetchAudienceActivity(_account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    const cells = [];
    // X peaks during morning news rush (8-10am) and mid-afternoon (1-4pm) Mon-Fri
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let base = 25;
        if (day >= 1 && day <= 5) {
          if (hour >= 8 && hour <= 10) base += 55; // morning rush
          if (hour >= 13 && hour <= 16) base += 45; // afternoon break
          if (hour >= 20 && hour <= 22) base += 30; // evening catchup
        } else {
          // Weekends slightly lower
          if (hour >= 10 && hour <= 16) base += 35;
        }
        const jitter = Math.floor(Math.random() * 12) - 6;
        const score = Math.min(100, Math.max(10, base + jitter));
        cells.push({ dayOfWeek: day, hour, activityScore: score });
      }
    }

    return {
      platform: "X",
      bestTimeSlots: [
        { dayOfWeek: 2, hour: 9, label: "Tuesday 9:00 AM" },
        { dayOfWeek: 3, hour: 14, label: "Wednesday 2:00 PM" },
        { dayOfWeek: 4, hour: 9, label: "Thursday 9:00 AM" },
      ],
      cells,
    };
  }
}
