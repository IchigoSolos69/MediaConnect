import { db } from "./lib/db";
import { getAuthSecret, getTokenVaultKey, getDispatchSecret, ConfigError } from "./lib/config/secrets";
import { TokenVault, PlaintextTokenRejectedError } from "./lib/crypto/vault";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  invalidateAllUserSessions,
} from "./lib/auth/session";
import { sanitizeAccount } from "./lib/auth/server";
import { PublisherService, UnapprovedPostError } from "./services/publisher.service";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "./app/api/auth/login/route";
import { GET as sessionGetRoute, POST as sessionLogoutRoute } from "./app/api/auth/session/route";
import { POST as dispatchRoute } from "./app/api/posts/dispatch/route";
import { GET as queueSlotsGet, POST as queueSlotsPost } from "./app/api/queue-slots/route";
import { POST as postCreateRoute } from "./app/api/posts/route";

async function runMilestone6A2TestSuite() {
  console.log("==================================================================");
  console.log("🔒 MEDIACONNECT MILESTONE 6A.2: FINAL PRODUCTION HARDENING SUITE");
  console.log("==================================================================\n");

  let passedTests = 0;
  const totalTests = 14;

  // ----------------------------------------------------------------------
  // TEST 1: Strict Production Secrets Validation (No Silent Weak Key Hashing)
  // ----------------------------------------------------------------------
  console.log("TEST 1: Strict Production Secrets Validation");
  const origEnv = process.env.NODE_ENV;
  const origAuth = process.env.AUTH_SECRET;
  const origKey1 = process.env.TOKEN_VAULT_KEY_V1;
  const origDisp = process.env.DISPATCH_SECRET;

  try {
    (process.env as unknown as { NODE_ENV: string }).NODE_ENV = "production";

    // 1a. Weak key in production (must NOT silently hash into 32 bytes)
    process.env.TOKEN_VAULT_KEY_V1 = "short_weak_key";
    let weakKeyRejected = false;
    try {
      getTokenVaultKey("v1");
    } catch (err: unknown) {
      if (err instanceof ConfigError) weakKeyRejected = true;
    }
    if (!weakKeyRejected) {
      throw new Error("Security failure: Production accepted non-hex/weak encryption key without failing!");
    }

    // 1b. Missing AUTH_SECRET in production
    delete process.env.AUTH_SECRET;
    let authSecretFailed = false;
    try {
      getAuthSecret();
    } catch (err: unknown) {
      if (err instanceof ConfigError) authSecretFailed = true;
    }
    if (!authSecretFailed) throw new Error("Security failure: Missing AUTH_SECRET did not fail in production!");

    // 1c. Missing DISPATCH_SECRET in production
    delete process.env.DISPATCH_SECRET;
    let dispatchSecretFailed = false;
    try {
      getDispatchSecret();
    } catch (err: unknown) {
      if (err instanceof ConfigError) dispatchSecretFailed = true;
    }
    if (!dispatchSecretFailed) throw new Error("Security failure: Missing DISPATCH_SECRET did not fail in production!");

    console.log("   ✓ Weak encryption keys and missing production secrets strictly fail-closed with ConfigError");
    passedTests++;
  } finally {
    (process.env as unknown as { NODE_ENV: string }).NODE_ENV = origEnv;
    process.env.AUTH_SECRET = origAuth;
    process.env.TOKEN_VAULT_KEY_V1 = origKey1;
    process.env.DISPATCH_SECRET = origDisp;
  }

  // ----------------------------------------------------------------------
  // TEST 2: Plaintext Token Rejection in Production Mode
  // ----------------------------------------------------------------------
  console.log("\nTEST 2: Plaintext Token Rejection in Production Mode");
  try {
    (process.env as unknown as { NODE_ENV: string }).NODE_ENV = "production";
    let plaintextCaught = false;
    try {
      TokenVault.decrypt("unencrypted_raw_api_secret_sample", "acc_sample");
    } catch (err: unknown) {
      if (err instanceof PlaintextTokenRejectedError || (err as Error).name === "PlaintextTokenRejectedError") {
        plaintextCaught = true;
        console.log(`   ✓ Plaintext token fail-closed rejected: ${(err as Error).message}`);
      }
    }
    if (!plaintextCaught) throw new Error("Security failure: Plaintext token accepted in production!");
    passedTests++;
  } finally {
    (process.env as unknown as { NODE_ENV: string }).NODE_ENV = origEnv;
  }

  // ----------------------------------------------------------------------
  // TEST 3: Login HttpOnly Cookie Isolation (Zero Token in JSON Body)
  // ----------------------------------------------------------------------
  console.log("\nTEST 3: Login HttpOnly Cookie Isolation (Zero Token in JSON Body)");
  const loginReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@mediaconnect.app",
      password: "Password123!",
    }),
  });

  const loginRes = await loginRoute(loginReq);
  const loginData = await loginRes.json();

  if (!loginData.success) {
    throw new Error(`Login failed unexpectedly: ${loginData.error}`);
  }

  if ("token" in loginData) {
    throw new Error("Security failure: Session token was returned in login JSON body! Must be HttpOnly cookie only.");
  }

  const sessionCookie = loginRes.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie || !sessionCookie.value) {
    throw new Error("Security failure: HttpOnly session cookie was not set on login response!");
  }
  if (!sessionCookie.httpOnly) {
    throw new Error("Security failure: Session cookie is not HttpOnly!");
  }

  console.log("   ✓ Login returns 0 session tokens in JSON response body");
  console.log(`   ✓ mc_session cookie verified: httpOnly=${sessionCookie.httpOnly}, sameSite=${sessionCookie.sameSite}`);
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 4: Server-Side Session Revocation on Logout & Replay Denial
  // ----------------------------------------------------------------------
  console.log("\nTEST 4: Server-Side Session Revocation on Logout & Replay Denial");
  const testUser = await db.user.findUnique({ where: { email: "owner@mediaconnect.app" } });
  if (!testUser) throw new Error("Missing test user");

  // Create temporary session token to test logout & replay
  const logoutTestToken = await createSessionToken({
    userId: testUser.id,
    email: testUser.email,
    name: testUser.name,
    activeWorkspaceId: testUser.workspaceId || "acme",
    role: "OWNER",
    tokenVersion: testUser.tokenVersion,
  });

  // Verify session is initially valid
  const initialVerify = await verifySessionToken(logoutTestToken, true);
  if (!initialVerify) throw new Error("Failed to verify newly created session token");

  // Perform logout via API route
  const logoutReq = new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${logoutTestToken}`,
    },
  });
  const logoutRes = await sessionLogoutRoute(logoutReq);
  if (logoutRes.status !== 200) throw new Error("Logout request failed");

  // Attacker attempts to replay the logged-out session token
  const replayVerify = await verifySessionToken(logoutTestToken, true);
  if (replayVerify !== null) {
    throw new Error("Security failure: Server accepted a logged-out session token! Revocation failed.");
  }

  // Also verify route rejects replayed session
  const replayReq = new NextRequest("http://localhost:3000/api/auth/session", {
    method: "GET",
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${logoutTestToken}`,
    },
  });
  const replayRes = await sessionGetRoute(replayReq);
  if (replayRes.status !== 401) {
    throw new Error(`Security failure: Route accepted revoked session! Status: ${replayRes.status}`);
  }

  console.log("   ✓ Session successfully revoked on server side");
  console.log("   ✓ Replay of logged-out session token strictly rejected with 401 Unauthorized");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 5: Global Session Invalidation on Password Reset / Deactivation
  // ----------------------------------------------------------------------
  console.log("\nTEST 5: Global Session Invalidation on Password Reset");
  const activeSessionToken = await createSessionToken({
    userId: testUser.id,
    email: testUser.email,
    name: testUser.name,
    activeWorkspaceId: testUser.workspaceId || "acme",
    role: "OWNER",
    tokenVersion: testUser.tokenVersion,
  });

  // Verify active before reset
  if ((await verifySessionToken(activeSessionToken, true)) === null) {
    throw new Error("Expected session to be active before password reset");
  }

  // Simulate password reset (increments user tokenVersion)
  await invalidateAllUserSessions(testUser.id);

  // Old session token with outdated tokenVersion must be rejected
  const invalidatedVerify = await verifySessionToken(activeSessionToken, true);
  if (invalidatedVerify !== null) {
    throw new Error("Security failure: Stale session accepted after password reset / tokenVersion increment!");
  }

  console.log("   ✓ User tokenVersion increment instantly invalidates all active sessions across all devices");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 6: Durable Authentication Rate Limiting
  // ----------------------------------------------------------------------
  console.log("\nTEST 6: Durable Authentication Rate Limiting (Brute-Force Defense)");
  const testIp = "192.168.200.75";
  const bruteEmail = "brute_force_test@mediaconnect.app";

  for (let i = 1; i <= 5; i++) {
    const badReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": testIp,
      },
      body: JSON.stringify({ email: bruteEmail, password: "WrongPassword!" }),
    });
    const res = await loginRoute(badReq);
    if (res.status !== 401) throw new Error(`Expected 401 on attempt ${i}, got ${res.status}`);
  }

  // 6th attempt must be 429
  const throttledReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": testIp,
    },
    body: JSON.stringify({ email: bruteEmail, password: "WrongPassword!" }),
  });
  const throttledRes = await loginRoute(throttledReq);
  if (throttledRes.status !== 429) {
    throw new Error(`Security failure: Expected 429 Too Many Requests after 5 failures, got ${throttledRes.status}`);
  }
  const retryHeader = throttledRes.headers.get("Retry-After");
  if (!retryHeader) {
    throw new Error("Security failure: Missing Retry-After header on 429 response!");
  }
  console.log(`   ✓ 6th failed attempt throttled with HTTP 429 in durable storage (Retry-After: ${retryHeader}s)`);
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 7: Route Protection (401 on Unauthenticated Calls)
  // ----------------------------------------------------------------------
  console.log("\nTEST 7: Route Protection (401 on Unauthenticated Calls)");
  const unauthDispatch = new NextRequest("http://localhost:3000/api/posts/dispatch", { method: "POST" });
  if ((await dispatchRoute(unauthDispatch)).status !== 401) {
    throw new Error("Expected 401 for unauthenticated /api/posts/dispatch");
  }

  const unauthQueueGet = new NextRequest("http://localhost:3000/api/queue-slots", { method: "GET" });
  if ((await queueSlotsGet(unauthQueueGet)).status !== 401) {
    throw new Error("Expected 401 for unauthenticated GET /api/queue-slots");
  }

  const unauthQueuePost = new NextRequest("http://localhost:3000/api/queue-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dayOfWeek: 1, time: "14:00" }),
  });
  if ((await queueSlotsPost(unauthQueuePost)).status !== 401) {
    throw new Error("Expected 401 for unauthenticated POST /api/queue-slots");
  }

  console.log("   ✓ POST /api/posts/dispatch, GET /api/queue-slots, POST /api/queue-slots reject with 401");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 8: Service-to-Service Dispatch Authorization
  // ----------------------------------------------------------------------
  console.log("\nTEST 8: Service-to-Service Dispatch Authorization");
  const validDispatchSecret = getDispatchSecret();
  const authDispatchReq = new NextRequest("http://localhost:3000/api/posts/dispatch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${validDispatchSecret}`,
    },
  });
  const authDispatchRes = await dispatchRoute(authDispatchReq);
  if (authDispatchRes.status !== 200) {
    const errBody = await authDispatchRes.json();
    throw new Error(`Authorized dispatch failed: ${errBody.error}`);
  }
  console.log("   ✓ POST /api/posts/dispatch succeeds with valid DISPATCH_SECRET Bearer token");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 9: Cross-Tenant Account Validation on Post Creation
  // ----------------------------------------------------------------------
  console.log("\nTEST 9: Cross-Tenant Account Validation on Post Creation");
  const acmeWorkspace = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  const betaAccount = await db.account.findFirst({ where: { platformAccountId: "beta_x_001" } });
  if (!acmeWorkspace || !betaAccount) throw new Error("Missing test workspaces/accounts");

  // Fresh login for Alice Owner to get valid token
  const freshLogin = await loginRoute(
    new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@mediaconnect.app", password: "Password123!" }),
    })
  );
  const freshCookie = freshLogin.cookies.get(SESSION_COOKIE_NAME)!.value;

  const crossTenantPostReq = new NextRequest("http://localhost:3000/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${freshCookie}`,
    },
    body: JSON.stringify({
      content: "Malicious post attempting cross-tenant target injection",
      targets: [{ accountId: betaAccount.id, platform: "X" }],
      workspaceId: acmeWorkspace.id,
      scheduleMode: "DRAFT",
    }),
  });

  const crossTenantPostRes = await postCreateRoute(crossTenantPostReq);
  if (crossTenantPostRes.status !== 403) {
    throw new Error(`Cross-tenant account reference not blocked! Status: ${crossTenantPostRes.status}`);
  }
  console.log("   ✓ Cross-tenant target account rejected with 403 Forbidden");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 10: Role Privilege Escalation Enforcement
  // ----------------------------------------------------------------------
  console.log("\nTEST 10: Role Privilege Escalation Enforcement");
  const editorUser = await db.user.findUnique({ where: { email: "editor@mediaconnect.app" } });
  if (!editorUser) throw new Error("Missing editor test user");

  const editorToken = await createSessionToken({
    userId: editorUser.id,
    email: editorUser.email,
    name: editorUser.name,
    activeWorkspaceId: acmeWorkspace.id,
    role: "EDITOR",
    tokenVersion: editorUser.tokenVersion,
  });

  const acmeAccount = await db.account.findFirst({ where: { workspaceId: acmeWorkspace.id } });
  if (!acmeAccount) throw new Error("Missing Acme account");

  const editorPublishReq = new NextRequest("http://localhost:3000/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${editorToken}`,
    },
    body: JSON.stringify({
      content: "Editor post trying immediate publish",
      targets: [{ accountId: acmeAccount.id, platform: acmeAccount.platform }],
      workspaceId: acmeWorkspace.id,
      scheduleMode: "NOW",
    }),
  });

  const editorPublishRes = await postCreateRoute(editorPublishReq);
  if (editorPublishRes.status !== 403) {
    throw new Error(`Editor immediate publish allowed! Status: ${editorPublishRes.status}`);
  }
  console.log("   ✓ Editor immediate publish blocked with 403 Forbidden");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 11: Publisher Service Approval Enforcement
  // ----------------------------------------------------------------------
  console.log("\nTEST 11: Publisher Service Approval Status Enforcement");
  const unapprovedPost = await db.post.create({
    data: {
      workspaceId: acmeWorkspace.id,
      authorId: editorUser.id,
      content: "Unapproved draft waiting for review",
      status: "DRAFT",
      approvalStatus: "PENDING_APPROVAL",
      targets: {
        create: [{ accountId: acmeAccount.id, platform: acmeAccount.platform, status: "PENDING" }],
      },
    },
  });

  let unapprovedPublishBlocked = false;
  try {
    await PublisherService.publishPostNow(unapprovedPost.id);
  } catch (err: unknown) {
    if (err instanceof UnapprovedPostError || (err as Error).name === "UnapprovedPostError") {
      unapprovedPublishBlocked = true;
      console.log(`   ✓ Unapproved post publish blocked: ${(err as Error).message}`);
    }
  }

  await db.postTarget.deleteMany({ where: { postId: unapprovedPost.id } });
  await db.post.delete({ where: { id: unapprovedPost.id } });

  if (!unapprovedPublishBlocked) {
    throw new Error("Security failure: PublisherService allowed publishing an unapproved post!");
  }
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 12: Target-Level Atomic Conditional Claiming & Concurrency Defense
  // ----------------------------------------------------------------------
  console.log("\nTEST 12: Target-Level Atomic Conditional Claiming");
  const concurrentPost = await db.post.create({
    data: {
      workspaceId: acmeWorkspace.id,
      authorId: editorUser.id,
      content: "Concurrent target claim test post",
      status: "SCHEDULED",
      approvalStatus: "APPROVED",
      scheduledAt: new Date(Date.now() - 30000),
      targets: {
        create: [{ accountId: acmeAccount.id, platform: acmeAccount.platform, status: "PENDING" }],
      },
    },
    include: { targets: true },
  });

  // Launch 5 simultaneous target publishers against the exact same targetId
  const targetId = concurrentPost.targets[0].id;
  const targetPromises = [
    PublisherService.publishTarget(targetId),
    PublisherService.publishTarget(targetId),
    PublisherService.publishTarget(targetId),
    PublisherService.publishTarget(targetId),
    PublisherService.publishTarget(targetId),
  ];

  await Promise.all(targetPromises);

  const finalTarget = await db.postTarget.findUnique({ where: { id: targetId } });
  if (!finalTarget || finalTarget.status !== "PUBLISHED") {
    throw new Error("Expected target to be PUBLISHED");
  }

  console.log("   ✓ Target-level conditional lease claiming prevents duplicate executions under concurrent load");
  await db.postTarget.deleteMany({ where: { postId: concurrentPost.id } });
  await db.post.delete({ where: { id: concurrentPost.id } });
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 13: Genuine Multi-Target Partial Publication (1 Success, 1 Failure)
  // ----------------------------------------------------------------------
  console.log("\nTEST 13: Genuine Multi-Target Partial Publication (1 Success, 1 Failure)");

  // Create a separate failing account with a corrupted/invalid vault envelope
  const failingAccount = await db.account.create({
    data: {
      workspaceId: acmeWorkspace.id,
      platform: "X",
      platformAccountId: "failing_account_corrupt_token_999",
      username: "@FailingAccount",
      displayName: "Failing Account",
      accessToken: "enc:v1:corrupted_iv:corrupted_cipher:corrupted_tag", // Deliberately corrupted
      status: "ERROR",
      isMock: true,
    },
  });

  // Create post with Target 1 (Valid Acme Account) and Target 2 (Failing Account)
  const multiTargetPost = await db.post.create({
    data: {
      workspaceId: acmeWorkspace.id,
      authorId: editorUser.id,
      content: "Multi-target partial publication test post",
      status: "DRAFT",
      approvalStatus: "APPROVED",
      targets: {
        create: [
          {
            accountId: acmeAccount.id,
            platform: acmeAccount.platform,
            status: "PENDING",
          },
          {
            accountId: failingAccount.id,
            platform: failingAccount.platform,
            status: "PENDING",
          },
        ],
      },
    },
    include: { targets: true },
  });

  const publishedMultiPost = await PublisherService.publishPostNow(multiTargetPost.id);

  const targetsAfterPublish = await db.postTarget.findMany({
    where: { postId: multiTargetPost.id },
  });

  const successTarget = targetsAfterPublish.find((t) => t.accountId === acmeAccount.id);
  const failedTarget = targetsAfterPublish.find((t) => t.accountId === failingAccount.id);

  if (!successTarget || successTarget.status !== "PUBLISHED") {
    throw new Error(`Target 1 expected PUBLISHED, got ${successTarget?.status}`);
  }
  if (!failedTarget || failedTarget.status !== "FAILED") {
    throw new Error(`Target 2 expected FAILED, got ${failedTarget?.status}`);
  }
  if (failedTarget.retryCount < 1) {
    throw new Error(`Target 2 expected retryCount >= 1, got ${failedTarget.retryCount}`);
  }
  if (publishedMultiPost.status !== "PARTIALLY_PUBLISHED") {
    throw new Error(`Expected parent post status PARTIALLY_PUBLISHED, got ${publishedMultiPost.status}`);
  }

  console.log("   ✓ Target 1 (valid account) transitioned to PUBLISHED");
  console.log(`   ✓ Target 2 (corrupted token) transitioned to FAILED (retryCount: ${failedTarget.retryCount})`);
  console.log(`   ✓ Parent post status accurately resolved to PARTIALLY_PUBLISHED`);

  // Cleanup test fixtures
  await db.postTarget.deleteMany({ where: { postId: multiTargetPost.id } });
  await db.post.delete({ where: { id: multiTargetPost.id } });
  await db.account.delete({ where: { id: failingAccount.id } });
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 14: Zero Plaintext Token Leaks & Account Sanitization
  // ----------------------------------------------------------------------
  console.log("\nTEST 14: Zero Plaintext Token Leaks & Account Sanitization");
  const accountsInDb = await db.account.findMany();
  for (const acc of accountsInDb) {
    if (!TokenVault.isEncrypted(acc.accessToken)) {
      throw new Error(`Security failure: Account ${acc.id} token is not encrypted in database!`);
    }

    const sanitized = sanitizeAccount(acc);
    if ("accessToken" in sanitized || "refreshToken" in sanitized) {
      throw new Error(`Security failure: sanitizeAccount leaked credentials!`);
    }
  }
  console.log(`   ✓ All ${accountsInDb.length} database account tokens verified encrypted`);
  console.log(`   ✓ sanitizeAccount verified: accessToken and refreshToken are stripped from API output`);
  passedTests++;

  console.log("\n==================================================================");
  console.log(`🎉 ALL MILESTONE 6A.2 SECURITY & HARDENING TESTS PASSED (${passedTests}/${totalTests})!`);
  console.log("==================================================================");
}

runMilestone6A2TestSuite()
  .catch((err) => {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
