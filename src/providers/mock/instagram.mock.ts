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

export class InstagramMockProvider implements ISocialProvider {
  public platform: SocialPlatform = "INSTAGRAM";
  private idempotencyCache = new Map<string, PublishResult>();

  async getAuthUrl(state: string): Promise<string> {
    return `/api/auth/mock-callback?platform=INSTAGRAM&state=${state}`;
  }

  async exchangeCode(code: string): Promise<AuthTokenResult> {
    return {
      accessToken: "mock_ig_access_token_" + Math.random().toString(36).substring(7),
      refreshToken: "mock_ig_refresh_token_" + Math.random().toString(36).substring(7),
      expiresInSeconds: 5184000, // 60 days for Meta long-lived token
      platformAccountId: "ig_mock_" + Math.random().toString(36).substring(5),
      username: "@acmemedia",
      displayName: "Acme Media Official (Mock)",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
      followersCount: 124500,
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

    const postCode = "mock_ig_" + Math.random().toString(36).substring(2, 9);
    await new Promise((r) => setTimeout(r, 100));

    const result: PublishResult = {
      success: true,
      platformPostId: postCode,
      liveUrl: `https://instagram.com/p/${postCode}`,
      publishedAt: new Date(),
    };

    if (payload.idempotencyKey) {
      this.idempotencyCache.set(payload.idempotencyKey, result);
    }

    return result;
  }

  async fetchInsights(
    account: ConnectedAccountData,
    timeRange: TimeRange
  ): Promise<SocialInsights> {
    const days = 14;
    const dailyMetrics = [];
    let totalImpressions = 0;
    let totalEngagements = 0;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      const impressions = Math.floor(8000 + Math.random() * 4500);
      const reach = Math.floor(impressions * 0.76);
      const likes = Math.floor(impressions * 0.048);
      const comments = Math.floor(likes * 0.09);
      const shares = Math.floor(likes * 0.14);
      const clicks = Math.floor(impressions * 0.015);
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
      platform: "INSTAGRAM",
      totalImpressions,
      totalReach: Math.floor(totalImpressions * 0.76),
      totalEngagements,
      totalFollowers: 124500,
      followerGrowth: 1820,
      engagementRate: Number(((totalEngagements / totalImpressions) * 100).toFixed(2)),
      dailyMetrics,
    };
  }

  async fetchAudienceActivity(account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    const cells = [];
    // Instagram peaks midday (12-2pm) and evening (7-9pm)
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let base = 20;
        if (hour >= 12 && hour <= 14) base += 45; // lunch rush
        if (hour >= 18 && hour <= 21) base += 55; // evening prime
        if (day === 3 || day === 4) base += 10;   // Wed/Thu peak activity
        const jitter = Math.floor(Math.random() * 14) - 7;
        const score = Math.min(100, Math.max(10, base + jitter));
        cells.push({ dayOfWeek: day, hour, activityScore: score });
      }
    }

    return {
      platform: "INSTAGRAM",
      bestTimeSlots: [
        { dayOfWeek: 3, hour: 19, label: "Wednesday 7:00 PM" },
        { dayOfWeek: 4, hour: 13, label: "Thursday 1:00 PM" },
        { dayOfWeek: 5, hour: 20, label: "Friday 8:00 PM" },
      ],
      cells,
    };
  }
}
