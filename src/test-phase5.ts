import { db } from "./lib/db";
import { AnalyticsService } from "./services/analytics.service";

async function verifyPhase5() {
  console.log("🧪 Verifying Phase 5: Metricool-Style Analytics & Intelligence...\n");

  const workspace = await db.workspace.findFirst();
  if (!workspace) throw new Error("No workspace found");

  // 1. Test Analytics Aggregator
  const overview = await AnalyticsService.getOverview(workspace.id, 14);
  console.log("1. Analytics Overview (Past 14 Days):");
  console.log(`   - Total Impressions: ${overview.totalImpressions.toLocaleString()}`);
  console.log(`   - Total Reach: ${overview.totalReach.toLocaleString()}`);
  console.log(`   - Total Engagements: ${overview.totalEngagements.toLocaleString()}`);
  console.log(`   - Overall Engagement Rate: ${overview.engagementRate}%`);
  console.log(`   - Follower Growth: +${(overview.followerGrowth ?? 0).toLocaleString()}`);
  console.log(`   - Timeline points: ${overview.dailyTimeline.length} days recorded`);

  if (overview.totalImpressions <= 0) {
    throw new Error("Expected impressions > 0 from seeded database");
  }

  // 2. Test Metricool 24x7 Audience Heatmap
  console.log("\n2. Metricool 24x7 Audience Heatmap:");
  const heatmap = await AnalyticsService.getAudienceHeatmap(workspace.id, "ALL");
  console.log(`   - Heatmap Cells count: ${heatmap.cells.length} (must be 168)`);
  console.log(`   - Top 3 Recommended Peak Hours:`);
  for (const slot of heatmap.bestSlots) {
    console.log(`     • ${slot.label} (Score: ${slot.score}%)`);
  }

  if (heatmap.cells.length !== 168) {
    throw new Error(`Expected 168 cells, got ${heatmap.cells.length}`);
  }

  // 3. Test Competitor Profiles
  console.log("\n3. Competitor Benchmarking:");
  const competitors = await db.competitor.findMany({
    where: { workspaceId: workspace.id },
  });
  console.log(`   - Tracked competitors: ${competitors.length}`);
  for (const comp of competitors) {
    console.log(`     • [${comp.platform}] ${comp.displayName} (@${comp.username}) - ${comp.followersCount.toLocaleString()} followers (${comp.engagementRate}% engagement)`);
  }

  if (competitors.length < 3) {
    throw new Error("Expected at least 3 competitors from seed");
  }

  console.log("\n🎉 PHASE 5 VERIFICATION PASSED SUCCESSFULLY!");
}

verifyPhase5()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
