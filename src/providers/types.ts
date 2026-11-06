export type SocialPlatform = "YOUTUBE" | "INSTAGRAM" | "X";

export interface ConnectedAccountData {
  id: string;
  platform: SocialPlatform;
  platformAccountId: string;
  username: string;
  displayName: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  isMock: boolean;
}

export interface PostPublishPayload {
  postId: string;
  targetId: string;
  content: string;
  customContent?: string | null;
  mediaUrls: string[];
  firstComment?: string | null;
  videoTitle?: string | null;
  videoTags?: string | null;
  idempotencyKey?: string | null;
}

export interface PublishResult {
  success: boolean;
  platformPostId: string;
  liveUrl: string;
  publishedAt: Date;
  error?: string;
}

export interface AuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  platformAccountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  followersCount: number;
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews?: number;
}

export interface SocialInsights {
  platform: SocialPlatform;
  totalImpressions: number;
  totalReach: number;
  totalEngagements: number;
  totalFollowers: number;
  followerGrowth: number;
  engagementRate: number;
  dailyMetrics: DailyMetric[];
}

export interface AudienceHeatmapCell {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  hour: number;      // 0 to 23
  activityScore: number; // 0 to 100 (100 = highest audience online density)
}

export interface AudienceHeatmapData {
  platform: SocialPlatform;
  bestTimeSlots: Array<{ dayOfWeek: number; hour: number; label: string }>;
  cells: AudienceHeatmapCell[]; // 168 cells (7 x 24)
}

export interface ISocialProvider {
  platform: SocialPlatform;
  getAuthUrl(state: string): Promise<string>;
  exchangeCode(code: string): Promise<AuthTokenResult>;
  refreshToken(token: string): Promise<AuthTokenResult>;
  publishPost(account: ConnectedAccountData, payload: PostPublishPayload): Promise<PublishResult>;
  fetchInsights(account: ConnectedAccountData, timeRange: TimeRange): Promise<SocialInsights>;
  fetchAudienceActivity(account: ConnectedAccountData): Promise<AudienceHeatmapData>;
}
