import { db } from "./lib/db";

async function verifyPhase2() {
  console.log("🧪 Verifying Phase 2: Workspaces & Channels Hub...\n");

  // 1. Verify workspace exists
  const workspace = await db.workspace.findFirst({
    include: {
      accounts: true,
      users: true,
    },
  });

  if (!workspace) throw new Error("No workspace found!");
  console.log(`✓ Active Workspace: ${workspace.name} (Slug: ${workspace.slug})`);
  console.log(`  Users: ${workspace.users.map((u) => `${u.name} <${u.email}>`).join(", ")}`);

  // 2. Verify Accounts
  console.log(`  Connected Channels count: ${workspace.accounts.length}`);
  for (const acc of workspace.accounts) {
    console.log(`  - [${acc.platform}] ${acc.displayName} (${acc.username}) - ${acc.followersCount.toLocaleString()} followers [Status: ${acc.status}]`);
  }

  if (workspace.accounts.length < 3) {
    throw new Error("Expected at least 3 connected accounts");
  }

  console.log("\n🎉 PHASE 2 VERIFICATION PASSED SUCCESSFULLY!");
}

verifyPhase2()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
