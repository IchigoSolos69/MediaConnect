import { db } from "./lib/db";
import { TokenVault, TamperDetectedError } from "./lib/crypto/vault";
import { createSessionToken, verifySessionToken } from "./lib/auth/session";
import { authorizeWorkspaceAccess, ForbiddenError, sanitizeAccount } from "./lib/auth/server";
import { hasPermission } from "./lib/auth/permissions";
import bcrypt from "bcryptjs";

async function runMilestone6aSecurityAudit() {
  console.log("==================================================================");
  console.log("🔒 RUNNING MILESTONE 6A SECURITY, AUTH & TOKEN VAULT AUDIT SUITE");
  console.log("==================================================================\n");

  // Load test users and workspaces
  const acmeWorkspace = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  const betaWorkspace = await db.workspace.findFirst({ where: { slug: "beta-agency" } });

  if (!acmeWorkspace || !betaWorkspace) {
    throw new Error("Required workspaces (acme-media, beta-agency) not found. Run migration script first.");
  }

  const ownerUser = await db.user.findUnique({ where: { email: "owner@mediaconnect.app" } });
  const editorUser = await db.user.findUnique({ where: { email: "editor@mediaconnect.app" } });
  const betaUser = await db.user.findUnique({ where: { email: "beta_user@mediaconnect.app" } });

  if (!ownerUser || !editorUser || !betaUser) {
    throw new Error("Test users not found in database.");
  }

  // -------------------------------------------------------------
  // TEST 1: Password Authentication & Session Verification
  // -------------------------------------------------------------
  console.log("TEST 1: Password Authentication & Secure Session Verification");
  const validPassword = await bcrypt.compare("Password123!", ownerUser.passwordHash!);
  if (!validPassword) throw new Error("Owner password verification failed");
  console.log("   ✓ Bcrypt password verification succeeded for owner@mediaconnect.app");

  const invalidPassword = await bcrypt.compare("WrongPassword123", ownerUser.passwordHash!);
  if (invalidPassword) throw new Error("Security failure: Invalid password was accepted!");
  console.log("   ✓ Invalid password rejected successfully");

  const sessionToken = await createSessionToken({
    userId: ownerUser.id,
    email: ownerUser.email,
    name: ownerUser.name,
    activeWorkspaceId: acmeWorkspace.id,
    role: "OWNER",
  });
  const decoded = await verifySessionToken(sessionToken);
  if (!decoded || decoded.userId !== ownerUser.id || decoded.role !== "OWNER") {
    throw new Error("Session token failed verification");
  }
  console.log("   ✓ Signed JWT session verified with activeWorkspaceId and role");

  // -------------------------------------------------------------
  // TEST 2: Multi-Tenant Workspace Isolation (Cross-Tenant Denial)
  // -------------------------------------------------------------
  console.log("\nTEST 2: Cross-Tenant Isolation Enforcement");
  // Dana (beta_user) belongs only to Beta Agency. She attempts to access Acme Media:
  let crossTenantDenied = false;
  try {
    await authorizeWorkspaceAccess(betaUser.id, acmeWorkspace.id, "analytics:view");
  } catch (err: any) {
    if (err instanceof ForbiddenError && err.statusCode === 403) {
      crossTenantDenied = true;
      console.log(`   ✓ Cross-tenant request rejected with 403: ${err.message}`);
    }
  }
  if (!crossTenantDenied) {
    throw new Error("Security failure: Cross-tenant access was not blocked!");
  }

  // -------------------------------------------------------------
  // TEST 3: Role-Based Access Control (RBAC) & Privilege Escalation
  // -------------------------------------------------------------
  console.log("\nTEST 3: Role-Based Access Control (RBAC) Boundaries");
  // Charlie (editor) is a member of Acme Media, but role is EDITOR
  const editorMembership = await authorizeWorkspaceAccess(
    editorUser.id,
    acmeWorkspace.id,
    "posts:create"
  );
  console.log(`   ✓ Editor authorized for allowed action [posts:create] (Role: ${editorMembership.role})`);

  let privilegeEscalationCaught = false;
  try {
    // Editor tries to execute OWNER-only action (channels:connect)
    await authorizeWorkspaceAccess(editorUser.id, acmeWorkspace.id, "channels:connect");
  } catch (err: any) {
    if (err instanceof ForbiddenError && err.statusCode === 403) {
      privilegeEscalationCaught = true;
      console.log(`   ✓ Privilege escalation rejected with 403: ${err.message}`);
    }
  }
  if (!privilegeEscalationCaught) {
    throw new Error("Security failure: Editor was allowed to execute channels:connect!");
  }

  // Verify permission matrix rules
  if (hasPermission("EDITOR", "channels:connect")) throw new Error("EDITOR should not have channels:connect");
  if (hasPermission("EDITOR", "posts:publish_now")) throw new Error("EDITOR should not have posts:publish_now");
  if (!hasPermission("APPROVER", "posts:publish_now")) throw new Error("APPROVER should have posts:publish_now");
  if (!hasPermission("OWNER", "workspace:manage")) throw new Error("OWNER should have workspace:manage");
  console.log("   ✓ Verified documented permission matrix for OWNER, APPROVER, and EDITOR");

  // -------------------------------------------------------------
  // TEST 4: Token Vault Cryptography & Tamper Detection
  // -------------------------------------------------------------
  console.log("\nTEST 4: Token Vault Cryptography & Tamper Detection");
  const testPlaintext = "ya29.live_oauth_token_production_secret_sample_token_998877";
  const testAad = "acc_test_record_123";

  const encrypted = TokenVault.encrypt(testPlaintext, testAad, "v1");
  console.log(`   Encrypted Envelope: ${encrypted.substring(0, 36)}...`);
  if (!encrypted.startsWith("enc:v1:")) {
    throw new Error("Invalid vault envelope version header");
  }

  const decrypted = TokenVault.decrypt(encrypted, testAad);
  if (decrypted !== testPlaintext) {
    throw new Error("Decrypted token does not match original plaintext");
  }
  console.log("   ✓ AES-256-GCM authenticated decryption succeeded");

  // Tamper detection
  const parts = encrypted.split(":");
  const tamperedEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}ff:${parts[4]}`;
  let tamperCaught = false;
  try {
    TokenVault.decrypt(tamperedEnvelope, testAad);
  } catch (err: any) {
    if (err instanceof TamperDetectedError || err.name === "TamperDetectedError") {
      tamperCaught = true;
      console.log(`   ✓ Corrupted ciphertext detected & rejected: ${err.message}`);
    }
  }
  if (!tamperCaught) {
    throw new Error("Security failure: Tampered token was decrypted without detecting corruption!");
  }

  // -------------------------------------------------------------
  // TEST 5: Key Rotation (v1 -> v2)
  // -------------------------------------------------------------
  console.log("\nTEST 5: Key Versioning & Zero-Downtime Rotation");
  const rotated = TokenVault.rotate(encrypted, "v2", testAad);
  console.log(`   Rotated Envelope: ${rotated.substring(0, 36)}...`);
  if (!rotated.startsWith("enc:v2:")) {
    throw new Error("Rotation failed to upgrade envelope to v2");
  }

  const decryptedV2 = TokenVault.decrypt(rotated, testAad);
  if (decryptedV2 !== testPlaintext) {
    throw new Error("Failed to decrypt rotated v2 token");
  }
  console.log("   ✓ Key rotation from v1 to v2 succeeded without token exposure");

  // -------------------------------------------------------------
  // TEST 6: Zero Plaintext Token Leaks in Database & API Sanitizer
  // -------------------------------------------------------------
  console.log("\nTEST 6: Database & API Response Token Sanitization");
  const dbAccounts = await db.account.findMany();
  console.log(`   Auditing ${dbAccounts.length} accounts in database for token encryption...`);

  for (const acc of dbAccounts) {
    if (acc.accessToken) {
      if (!TokenVault.isEncrypted(acc.accessToken)) {
        throw new Error(`Account ${acc.id} contains unencrypted plaintext accessToken!`);
      }
    }
    if (acc.refreshToken) {
      if (!TokenVault.isEncrypted(acc.refreshToken)) {
        throw new Error(`Account ${acc.id} contains unencrypted plaintext refreshToken!`);
      }
    }

    // Verify sanitizeAccount strips tokens
    const sanitized = sanitizeAccount(acc);
    if ("accessToken" in sanitized || "refreshToken" in sanitized) {
      throw new Error(`sanitizeAccount leaked credentials on account ${acc.id}`);
    }
  }
  console.log("   ✓ 100% of account credentials in database are encrypted with AES-256-GCM vault envelopes");
  console.log("   ✓ sanitizeAccount verified: tokens are strictly stripped from all serialized API output");

  console.log("\n==================================================================");
  console.log("🎉 ALL MILESTONE 6A SECURITY & MULTI-TENANCY AUDITS PASSED (6/6)!");
  console.log("==================================================================");
}

runMilestone6aSecurityAudit()
  .catch((err) => {
    console.error("❌ Milestone 6A Audit Failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
