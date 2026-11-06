import { db } from "../lib/db";
import { TokenVault } from "../lib/crypto/vault";
import bcrypt from "bcryptjs";

async function runMigration() {
  console.log("🔒 Running Milestone 6A Token & Membership Migration...\n");

  // 1. Encrypt all plaintext account tokens
  const accounts = await db.account.findMany();
  console.log(`Found ${accounts.length} social accounts to inspect for token encryption...`);

  let encryptedCount = 0;
  for (const acc of accounts) {
    let needsUpdate = false;
    let tokenToEncrypt = acc.accessToken;

    if (!tokenToEncrypt) {
      tokenToEncrypt = `mock_${acc.platform.toLowerCase()}_token_${Math.random().toString(36).slice(2)}`;
      needsUpdate = true;
    }

    let encryptedAccess = acc.accessToken;
    if (tokenToEncrypt && !TokenVault.isEncrypted(tokenToEncrypt)) {
      encryptedAccess = TokenVault.encrypt(tokenToEncrypt, acc.id, "v1");
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db.account.update({
        where: { id: acc.id },
        data: {
          accessToken: encryptedAccess,
          tokenKeyVersion: "v1",
        },
      });
      encryptedCount++;
    }
  }
  console.log(`✓ Plaintext tokens encrypted: ${encryptedCount} accounts updated to AES-256-GCM vault.`);

  // 2. Setup Multi-Tenant Workspaces & Role Memberships
  let primaryWorkspace = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  if (!primaryWorkspace) {
    primaryWorkspace = await db.workspace.create({
      data: {
        name: "Acme Media",
        slug: "acme-media",
      },
    });
  }

  // Create or find isolated secondary workspace for tenant-isolation testing
  let betaWorkspace = await db.workspace.findFirst({ where: { slug: "beta-agency" } });
  if (!betaWorkspace) {
    betaWorkspace = await db.workspace.create({
      data: {
        name: "Beta Agency",
        slug: "beta-agency",
      },
    });

    // Create an account in Beta Agency
    await db.account.create({
      data: {
        workspaceId: betaWorkspace.id,
        platform: "X",
        platformAccountId: "beta_x_001",
        username: "@BetaAgencyHQ",
        displayName: "Beta Agency HQ",
        followersCount: 5200,
        accessToken: TokenVault.encrypt("mock_beta_secret", "beta_x_001", "v1"),
        isMock: true,
      },
    });
  }

  // 3. Seed / Update Verified Users with Hashed Passwords & Workspace Roles
  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const usersToSeed = [
    {
      email: "owner@mediaconnect.app",
      name: "Alice Owner",
      role: "OWNER" as const,
      workspaceId: primaryWorkspace.id,
    },
    {
      email: "approver@mediaconnect.app",
      name: "Bob Approver",
      role: "APPROVER" as const,
      workspaceId: primaryWorkspace.id,
    },
    {
      email: "editor@mediaconnect.app",
      name: "Charlie Editor",
      role: "EDITOR" as const,
      workspaceId: primaryWorkspace.id,
    },
    {
      email: "beta_user@mediaconnect.app",
      name: "Dana Beta",
      role: "OWNER" as const,
      workspaceId: betaWorkspace.id,
    },
  ];

  for (const u of usersToSeed) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        workspaceId: u.workspaceId,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        workspaceId: u.workspaceId,
        role: u.role,
      },
    });

    // Ensure WorkspaceMember record
    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: u.workspaceId,
          userId: user.id,
        },
      },
      update: {
        role: u.role,
      },
      create: {
        workspaceId: u.workspaceId,
        userId: user.id,
        role: u.role,
      },
    });

    console.log(`  ✓ User [${u.email}] linked to workspace [${u.workspaceId}] as ${u.role}`);
  }

  console.log("\n🎉 Milestone 6A Token & Membership Migration Completed Successfully!");
}

runMigration()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
