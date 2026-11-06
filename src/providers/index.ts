import { ISocialProvider, SocialPlatform } from "./types";
import { YouTubeMockProvider } from "./mock/youtube.mock";
import { InstagramMockProvider } from "./mock/instagram.mock";
import { XMockProvider } from "./mock/x.mock";
import { YouTubeLiveProvider } from "./live/youtube.provider";
import { InstagramLiveProvider } from "./live/instagram.provider";
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
 * If NEXT_PUBLIC_SOCIAL_MODE is 'mock' (default), returns the zero-cost mock sandbox adapter.
 * If NEXT_PUBLIC_SOCIAL_MODE is 'live', returns the production OAuth/API adapter.
 */
export function getSocialProvider(
  platform: SocialPlatform | string,
  modeOverride?: "mock" | "live"
): ISocialProvider {
  const normalizedPlatform = platform.toUpperCase() as SocialPlatform;
  const mode = modeOverride || process.env.NEXT_PUBLIC_SOCIAL_MODE || "mock";

  if (mode === "live") {
    const live = liveProviders[normalizedPlatform];
    if (live) return live;
  }

  const mock = mockProviders[normalizedPlatform];
  if (!mock) {
    throw new Error(`Unsupported social platform: ${platform}`);
  }
  return mock;
}

export * from "./types";
export { YouTubeLiveProvider } from "./live/youtube.provider";
export { InstagramLiveProvider } from "./live/instagram.provider";
export { XLiveProvider, PaidApiGuardrailError } from "./live/x.provider";
