import { ISocialProvider, SocialPlatform } from "./types";
import { YouTubeMockProvider } from "./mock/youtube.mock";
import { InstagramMockProvider } from "./mock/instagram.mock";
import { XMockProvider } from "./mock/x.mock";

const mockProviders: Record<SocialPlatform, ISocialProvider> = {
  YOUTUBE: new YouTubeMockProvider(),
  INSTAGRAM: new InstagramMockProvider(),
  X: new XMockProvider(),
};

/**
 * Returns the active provider implementation for a given platform.
 * If NEXT_PUBLIC_SOCIAL_MODE is 'mock' (default), returns the zero-cost mock sandbox adapter.
 */
export function getSocialProvider(
  platform: SocialPlatform | string,
  modeOverride?: "mock" | "live"
): ISocialProvider {
  const normalizedPlatform = platform.toUpperCase() as SocialPlatform;
  const mode = modeOverride || process.env.NEXT_PUBLIC_SOCIAL_MODE || "mock";

  if (mode === "mock") {
    const provider = mockProviders[normalizedPlatform];
    if (!provider) {
      throw new Error(`Unsupported social platform: ${platform}`);
    }
    return provider;
  }

  // When live mode is activated, fallback to mock if credentials missing
  const provider = mockProviders[normalizedPlatform];
  if (!provider) {
    throw new Error(`Unsupported social platform: ${platform}`);
  }
  return provider;
}

export * from "./types";
