import { db } from "./lib/db";
import { PublisherService } from "./services/publisher.service";

async function verifyPhase3() {
  console.log("🧪 Verifying Phase 3: Visual Calendar, Queue & Publisher Engine...\n");

  const workspace = await db.workspace.findFirst({
    include: { accounts: true },
  });
  if (!workspace) throw new Error("No workspace found");

  // 1. Test getNextQueueSlot
  const nextSlot = await PublisherService.getNextQueueSlot(workspace.id);
  console.log(`✓ Next Buffer Queue Slot calculated: ${nextSlot.toISOString()}`);

  // 2. Create a test post scheduled for right now
  const testPost = await db.post.create({
    data: {
      workspaceId: workspace.id,
      title: "Automated Phase 3 Verification Post",
      content: "Testing automatic multi-channel dispatch to YouTube, Instagram, and X with simulated live URLs! #MediaConnect #Automation",
      status: "SCHEDULED",
      scheduledAt: new Date(Date.now() - 5000), // 5 seconds in past so it's due
      targets: {
        create: workspace.accounts.map((acc) => ({
          accountId: acc.id,
          platform: acc.platform,
          status: "PENDING",
          videoTitle: acc.platform === "YOUTUBE" ? "Verification Video Walkthrough" : null,
          firstComment: acc.platform === "INSTAGRAM" ? "#TechReview #CreatorTools" : null,
        })),
      },
    },
    include: { targets: true },
  });
  console.log(`✓ Created scheduled test post with ${testPost.targets.length} targets.`);

  // 3. Dispatch Due Posts
  const dispatchResult = await PublisherService.dispatchDuePosts();
  console.log(`✓ Dispatched due posts: count = ${dispatchResult.dispatchedCount}`);

  // 4. Verify post status updated to PUBLISHED
  const updatedPost = await db.post.findUnique({
    where: { id: testPost.id },
    include: { targets: true },
  });

  if (updatedPost?.status !== "PUBLISHED") {
    throw new Error(`Expected post status to be PUBLISHED, got ${updatedPost?.status}`);
  }

  console.log(`✓ Post status transitioned to: ${updatedPost.status}`);
  for (const t of updatedPost.targets) {
    if (t.status !== "PUBLISHED" || !t.liveUrl) {
      throw new Error(`Target ${t.platform} not published properly`);
    }
    console.log(`  - [${t.platform}] Live URL: ${t.liveUrl}`);
  }

  console.log("\n🎉 PHASE 3 VERIFICATION PASSED SUCCESSFULLY!");
}

verifyPhase3()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
