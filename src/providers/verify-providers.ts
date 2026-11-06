import { getSocialProvider, SocialPlatform } from "./index";

async function verifyProviders() {
  console.log("🧪 Testing Social Provider Abstraction Layer...\n");

  const platforms: SocialPlatform[] = ["YOUTUBE", "INSTAGRAM", "X"];

  for (const platform of platforms) {
    const provider = getSocialProvider(platform, "mock");
    console.log(`Checking ${platform} Provider:`);

    // 1. Auth URL
    const authUrl = await provider.getAuthUrl("test_state_123");
    if (!authUrl.includes(platform)) throw new Error(`Auth URL invalid for ${platform}`);
    console.log(`  ✓ Auth URL generated: ${authUrl}`);

    // 2. Token Exchange
    const tokenResult = await provider.exchangeCode("mock_code");
    if (!tokenResult.accessToken || !tokenResult.username) {
      throw new Error(`Token exchange failed for ${platform}`);
    }
    console.log(`  ✓ Token exchanged for user: ${tokenResult.username} (${tokenResult.followersCount.toLocaleString()} followers)`);

    // 3. Publishing
    const publishResult = await provider.publishPost(
      {
        id: "acc_test",
        platform,
        platformAccountId: tokenResult.platformAccountId,
        username: tokenResult.username,
        displayName: tokenResult.displayName,
        isMock: true,
      },
      {
        postId: "post_test_01",
        targetId: "target_test_01",
        content: "Testing MediaConnect publish dispatcher!",
        mediaUrls: [],
      }
    );
    if (!publishResult.success || !publishResult.liveUrl) {
      throw new Error(`Publish failed for ${platform}`);
    }
    console.log(`  ✓ Post published successfully! Link: ${publishResult.liveUrl}`);

    // 4. Insights
    const insights = await provider.fetchInsights(
      {
        id: "acc_test",
        platform,
        platformAccountId: tokenResult.platformAccountId,
        username: tokenResult.username,
        displayName: tokenResult.displayName,
        isMock: true,
      },
      { startDate: new Date(), endDate: new Date() }
    );
    if (!insights.dailyMetrics || insights.dailyMetrics.length === 0) {
      throw new Error(`Insights returned no data for ${platform}`);
    }
    console.log(`  ✓ Insights fetched: ${insights.totalImpressions.toLocaleString()} impressions, ${insights.engagementRate}% engagement rate`);

    // 5. Heatmap
    const heatmap = await provider.fetchAudienceActivity({
      id: "acc_test",
      platform,
      platformAccountId: tokenResult.platformAccountId,
      username: tokenResult.username,
      displayName: tokenResult.displayName,
      isMock: true,
    });
    if (heatmap.cells.length !== 168) {
      throw new Error(`Heatmap must have 168 cells, got ${heatmap.cells.length}`);
    }
    console.log(`  ✓ 24x7 Audience Heatmap verified: 168 hourly slots, Top slot: ${heatmap.bestTimeSlots[0]?.label}\n`);
  }

  console.log("🎉 ALL SOCIAL PROVIDERS VERIFIED SUCCESSFULLY!");
}

verifyProviders().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
