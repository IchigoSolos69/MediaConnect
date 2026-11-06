import { db } from "../lib/db";
import { TokenVault } from "../lib/crypto/vault";

async function runMigration() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify");

  console.log("==================================================================");
  console.log("🔒 MEDIACONNECT PRODUCTION TOKEN VAULT MIGRATION & AUDIT TOOL");
  console.log("==================================================================\n");

  const accounts = await db.account.findMany();
  console.log(`Inspecting ${accounts.length} social accounts in database...`);

  if (accounts.length === 0) {
    console.warn("⚠️ No accounts found in database to audit or migrate.");
    if (verifyOnly) {
      console.error("❌ Verification failed: Database has 0 accounts.");
      process.exit(1);
    }
    return;
  }

  let alreadyEncrypted = 0;
  let newlyMigrated = 0;
  let verificationFailures = 0;

  for (const acc of accounts) {
    if (verifyOnly) {
      // STRICTLY READ-ONLY VERIFICATION MODE: No writes, no mutations
      if (!TokenVault.isEncrypted(acc.accessToken)) {
        console.error(`  ❌ [FAIL - UNENCRYPTED] Account ${acc.id} (${acc.username}): Plaintext token found.`);
        verificationFailures++;
        continue;
      }

      try {
        const decrypted = TokenVault.decrypt(acc.accessToken!, acc.id);
        if (!decrypted) {
          console.error(`  ❌ [FAIL - EMPTY] Account ${acc.id} (${acc.username}): Decrypted to empty payload.`);
          verificationFailures++;
        } else {
          alreadyEncrypted++;
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`  ❌ [FAIL - DECRYPTION] Account ${acc.id} (${acc.username}): ${error.message}`);
        verificationFailures++;
      }
    } else {
      // MIGRATION MODE: Only encrypt unencrypted account tokens; do NOT create users or workspaces
      if (TokenVault.isEncrypted(acc.accessToken)) {
        try {
          TokenVault.decrypt(acc.accessToken!, acc.id);
          alreadyEncrypted++;
        } catch (err: unknown) {
          const error = err as Error;
          console.error(`  ❌ Account ${acc.id} has invalid vault ciphertext: ${error.message}`);
          verificationFailures++;
        }
      } else {
        const plaintext = acc.accessToken;
        if (!plaintext) {
          console.warn(`  ⚠️ Account ${acc.id} has null accessToken; skipping.`);
          continue;
        }

        const encrypted = TokenVault.encrypt(plaintext, acc.id, "v1");

        // Verify roundtrip before persisting
        const testDecrypted = TokenVault.decrypt(encrypted, acc.id);
        if (testDecrypted !== plaintext) {
          throw new Error(`Roundtrip verification failed for account ${acc.id}. Aborting migration.`);
        }

        await db.account.update({
          where: { id: acc.id },
          data: {
            accessToken: encrypted,
            tokenKeyVersion: "v1",
          },
        });
        newlyMigrated++;
        console.log(`  ✓ Account ${acc.id} (${acc.username}) safely migrated to AES-256-GCM envelope.`);
      }
    }
  }

  console.log(`\nAudit Summary:`);
  console.log(`  - Total Accounts: ${accounts.length}`);
  console.log(`  - Verified Encrypted: ${alreadyEncrypted}`);
  console.log(`  - Newly Migrated: ${newlyMigrated}`);
  console.log(`  - Verification Failures: ${verificationFailures}`);

  if (verificationFailures > 0) {
    console.error(`\n❌ Token audit failed with ${verificationFailures} failures.`);
    process.exit(1);
  }

  console.log("\n🎉 Token audit & verification passed successfully (0 failures).");
  process.exit(0);
}

runMigration()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
