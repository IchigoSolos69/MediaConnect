import { ISocialProvider, SocialPlatform } from "./types";
import { YouTubeMockProvider } from "./mock/youtube.mock";
import { InstagramMockProvider } from "./mock/instagram.mock";
import { XMockProvider } from "./mock/x.mock";
import { YouTubeLiveProvider, YouTubeQuotaManager } from "./live/youtube.provider";
import { InstagramLiveProvider, InstagramMediaProcessingError } from "./live/instagram.provider";
import { XLiveProvider, PaidApiGuardrailError } from "./live/x.provider";

const mockProviders: Record<SocialPlatform, ISocialProvider> = {
  YOUTUBE: new YouTubeMockProvider(),
  INSTAGRAM: new InstagramMockProvider(),
  X: new XMockProvider(),
};

const liveProviders: Record<SocialPlatform, ISocialProvider> = {
  YOUTUBE: new YouTubeLiveProvider(),
  INSTAGRAM: new InstagramLiveProvider(),
  X: new XLiveProvider(),
};

/**
 * Returns the active provider implementation for a given platform.
 * Strictly separates 'mock' and 'live' modes without silent fallback.
 */
export function getSocialProvider(
  platform: SocialPlatform | string,
  modeOverride?: "mock" | "live"
): ISocialProvider {
  const normalizedPlatform = platform.toUpperCase() as SocialPlatform;
  const mode = modeOverride || process.env.NEXT_PUBLIC_SOCIAL_MODE || "mock";

  if (mode === "live") {
    const live = liveProviders[normalizedPlatform];
    if (!live) {
      throw new Error(`Unsupported social platform for live mode: ${platform}`);
    }
    return live;
  }

  const mock = mockProviders[normalizedPlatform];
  if (!mock) {
    throw new Error(`Unsupported social platform: ${platform}`);
  }
  return mock;
}

/**
 * Reports whether live OAuth and API integration is authorized and configured on the server per platform.
 */
export function getLiveIntegrationStatus(): Record<SocialPlatform, { enabled: boolean; reason?: string }> {
  const ytConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  const igConfigured = Boolean(
    (process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID) &&
      (process.env.META_APP_SECRET || process.env.INSTAGRAM_CLIENT_SECRET)
  );
  const xKeysConfigured = Boolean(
    (process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID) &&
      (process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET)
  );
  const xPaidAuthorized = process.env.ALLOW_PAID_X_API === "true";

  return {
    YOUTUBE: {
      enabled: ytConfigured,
      reason: ytConfigured
        ? undefined
        : "YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not configured on the server.",
    },
    INSTAGRAM: {
      enabled: igConfigured,
      reason: igConfigured
        ? undefined
        : "META_APP_ID and META_APP_SECRET are not configured on the server.",
    },
    X: {
      enabled: xKeysConfigured && xPaidAuthorized,
      reason: !xKeysConfigured
        ? "TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET are not configured on the server."
        : !xPaidAuthorized
        ? "Live X API requires explicit billing authorization (ALLOW_PAID_X_API=true)."
        : undefined,
    },
  };
}

export * from "./types";
export { YouTubeLiveProvider, YouTubeQuotaManager } from "./live/youtube.provider";
export { InstagramLiveProvider, InstagramMediaProcessingError } from "./live/instagram.provider";
export { XLiveProvider, PaidApiGuardrailError } from "./live/x.provider";
