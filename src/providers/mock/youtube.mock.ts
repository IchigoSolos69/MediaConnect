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

export class YouTubeMockProvider implements ISocialProvider {
  public platform: SocialPlatform = "YOUTUBE";

  async getAuthUrl(state: string): Promise<string> {
    return `/api/auth/mock-callback?platform=YOUTUBE&state=${state}`;
  }

  async exchangeCode(code: string): Promise<AuthTokenResult> {
    return {
      accessToken: "mock_yt_access_token_" + Math.random().toString(36).substring(7),
      refreshToken: "mock_yt_refresh_token_" + Math.random().toString(36).substring(7),
      expiresInSeconds: 3600,
      platformAccountId: "yt_mock_" + Math.random().toString(36).substring(5),
      username: "@AcmeStudios",
      displayName: "Acme Studios (Mock)",
      avatarUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150&auto=format&fit=crop&q=80",
      followersCount: 48200,
    };
  }

  async refreshToken(token: string): Promise<AuthTokenResult> {
    return this.exchangeCode(token);
  }

  async publishPost(
    account: ConnectedAccountData,
    payload: PostPublishPayload
  ): Promise<PublishResult> {
    const videoId = "mock_yt_" + Math.random().toString(36).substring(2, 9);
    // Simulate slight network dispatch delay
    await new Promise((r) => setTimeout(r, 200));

    return {
      success: true,
      platformPostId: videoId,
      liveUrl: `https://youtube.com/watch?v=${videoId}`,
      publishedAt: new Date(),
    };
  }

  async fetchInsights(
    account: ConnectedAccountData,
    timeRange: TimeRange
  ): Promise<SocialInsights> {
    const days = 14;
    const dailyMetrics = [];
    let totalViews = 0;
    let totalEngagements = 0;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      const views = Math.floor(3500 + Math.random() * 2500);
      const likes = Math.floor(views * 0.05);
      const comments = Math.floor(likes * 0.15);
      const shares = Math.floor(likes * 0.08);
      const clicks = Math.floor(views * 0.03);
      const engagements = likes + comments + shares;

      totalViews += views;
      totalEngagements += engagements;

      dailyMetrics.push({
        date: dateStr,
        impressions: Math.floor(views * 1.6),
        reach: Math.floor(views * 1.3),
        videoViews: views,
        engagements,
        likes,
        comments,
        shares,
        clicks,
      });
    }

    return {
      platform: "YOUTUBE",
      totalImpressions: Math.floor(totalViews * 1.6),
      totalReach: Math.floor(totalViews * 1.3),
      totalEngagements,
      totalFollowers: 48200,
      followerGrowth: 680,
      engagementRate: Number(((totalEngagements / totalViews) * 100).toFixed(2)),
      dailyMetrics,
    };
  }

  async fetchAudienceActivity(account: ConnectedAccountData): Promise<AudienceHeatmapData> {
    const cells = [];
    // YouTube peaks in early evenings and weekends
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let base = 25;
        // Weekends have higher daytime activity
        if (day === 0 || day === 6) {
          if (hour >= 11 && hour <= 22) base += 45;
        } else {
          // Weekdays peak 16:00 to 22:00
          if (hour >= 16 && hour <= 21) base += 55;
          if (hour >= 12 && hour <= 14) base += 25;
        }
        const jitter = Math.floor(Math.random() * 15) - 7;
        const score = Math.min(100, Math.max(10, base + jitter));
        cells.push({ dayOfWeek: day, hour, activityScore: score });
      }
    }

    return {
      platform: "YOUTUBE",
      bestTimeSlots: [
        { dayOfWeek: 5, hour: 18, label: "Friday 6:00 PM" },
        { dayOfWeek: 6, hour: 15, label: "Saturday 3:00 PM" },
        { dayOfWeek: 0, hour: 17, label: "Sunday 5:00 PM" },
      ],
      cells,
    };
  }
}
