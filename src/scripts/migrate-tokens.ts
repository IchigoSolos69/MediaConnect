import { db } from "../lib/db";
import { TokenVault } from "../lib/crypto/vault";
import bcrypt from "bcryptjs";

async function runMigration() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify");

  console.log("==================================================================");
  console.log("🔒 MEDIACONNECT CRYPTOGRAPHIC TOKEN VAULT MIGRATION & AUDIT TOOL");
  console.log("==================================================================\n");

  // 1. Inspect all account credentials in database
  const accounts = await db.account.findMany();
  console.log(`Auditing ${accounts.length} social accounts in database...`);

  let alreadyEncrypted = 0;
  let migratedCount = 0;
  let verificationFailures = 0;

  for (const acc of accounts) {
    let decrypted: string | null = null;
    let aadUsed = acc.id;

    if (TokenVault.isEncrypted(acc.accessToken)) {
      try {
        decrypted = TokenVault.decrypt(acc.accessToken!, acc.id);
      } catch {
        // Try fallback AAD with platformAccountId for legacy accounts
        try {
          decrypted = TokenVault.decrypt(acc.accessToken!, acc.platformAccountId);
          aadUsed = acc.platformAccountId;
        } catch {
          decrypted = null;
        }
      }

      if (decrypted) {
        // If it was encrypted with legacy AAD, re-encrypt with canonical acc.id
        if (aadUsed !== acc.id && !verifyOnly) {
          const canonicalEncrypted = TokenVault.encrypt(decrypted, acc.id, "v1");
          await db.account.update({
            where: { id: acc.id },
            data: { accessToken: canonicalEncrypted },
          });
          console.log(`  ✓ Account ${acc.id} (${acc.username}) re-bound to canonical account.id AAD.`);
        }
        alreadyEncrypted++;
      } else {
        console.error(`  ❌ [DECRYPTION FAILED] Account ${acc.id} (${acc.username}): Cryptographic authentication failed.`);
        verificationFailures++;
      }
    } else {
      if (verifyOnly) {
        console.warn(`  ⚠️ [UNENCRYPTED] Account ${acc.id} (${acc.username}): Found unencrypted plaintext token.`);
        continue;
      }

      // Perform verified zero-downtime migration to AES-256-GCM vault envelope
      const plaintext = acc.accessToken || `mock_${acc.platform.toLowerCase()}_token_${acc.id}`;
      const encryptedEnvelope = TokenVault.encrypt(plaintext, acc.id, "v1");

      // Verify before write (pre-flight roundtrip check)
      const testDecrypted = TokenVault.decrypt(encryptedEnvelope, acc.id);
      if (testDecrypted !== plaintext) {
        throw new Error(`Roundtrip verification failed for account ${acc.id}. Aborting migration.`);
      }

      await db.account.update({
        where: { id: acc.id },
        data: {
          accessToken: encryptedEnvelope,
          tokenKeyVersion: "v1",
        },
      });

      migratedCount++;
      console.log(`  ✓ Account ${acc.id} (${acc.username}) safely migrated to AES-256-GCM vault envelope.`);
    }
  }

  console.log(`\nAccount Audit Summary:`);
  console.log(`  - Total Accounts: ${accounts.length}`);
  console.log(`  - Already Encrypted: ${alreadyEncrypted}`);
  console.log(`  - Newly Migrated: ${migratedCount}`);
  console.log(`  - Verification Failures: ${verificationFailures}`);

  if (verificationFailures > 0) {
    throw new Error(`Migration completed with ${verificationFailures} cryptographic verification failures.`);
  }

  // 2. Ensure Primary Workspace and Isolated Tenant exist
  let primaryWorkspace = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  if (!primaryWorkspace) {
    primaryWorkspace = await db.workspace.create({
      data: {
        name: "Acme Media",
        slug: "acme-media",
      },
    });
  }

  let betaWorkspace = await db.workspace.findFirst({ where: { slug: "beta-agency" } });
  if (!betaWorkspace) {
    betaWorkspace = await db.workspace.create({
      data: {
        name: "Beta Agency",
        slug: "beta-agency",
      },
    });

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

  // 3. User Seed / Migration (SAFE: Never overwrite existing user passwords)
  const defaultPassword = "Password123!";
  const newPasswordHash = await bcrypt.hash(defaultPassword, 12);

  const usersToEnsure = [
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

  for (const u of usersToEnsure) {
    const existing = await db.user.findUnique({ where: { email: u.email } });

    let userId = existing?.id;

    if (!existing) {
      // New user creation
      const created = await db.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: newPasswordHash,
          workspaceId: u.workspaceId,
          role: u.role,
        },
      });
      userId = created.id;
      console.log(`  ✓ Created user [${u.email}] with role [${u.role}]`);
    } else {
      // Existing user: NEVER reset or overwrite existing passwordHash!
      const updateData: any = { name: u.name };
      if (!existing.passwordHash) {
        updateData.passwordHash = newPasswordHash;
        console.log(`  ✓ Configured initial password for passwordless user [${u.email}]`);
      } else {
        console.log(`  ✓ Preserved existing password for user [${u.email}] (No password reset)`);
      }

      await db.user.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    // Ensure WorkspaceMember record exists
    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: u.workspaceId,
          userId: userId!,
        },
      },
      update: {
        role: u.role,
      },
      create: {
        workspaceId: u.workspaceId,
        userId: userId!,
        role: u.role,
      },
    });
  }

  console.log("\n🎉 Migration & Security Audit Finished Successfully!");
}

runMigration()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
