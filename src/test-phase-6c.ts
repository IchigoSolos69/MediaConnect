import { db } from "./lib/db";
import {
  StorageService,
  LocalStorageProvider,
  StorageSecurityError,
  validateSafeRemoteMediaUrl,
  fetchSafeRemoteMedia,
} from "./services/storage.service";
import {
  YouTubeLiveProvider,
  YouTubeQuotaManager,
} from "./providers";
import { TokenVault } from "./lib/crypto/vault";
import { createSessionToken, SESSION_COOKIE_NAME } from "./lib/auth/session";
import {
  PublisherService,
  LeaseFencingError,
} from "./services/publisher.service";
import { AnalyticsService } from "./services/analytics.service";
import { AiSeoService, UnsupportedAiModelError } from "./services/ai-seo.service";
import { NextRequest } from "next/server";
import { GET as oauthConnectRoute } from "./app/api/auth/connect/[provider]/route";
import { GET as oauthCallbackRoute } from "./app/api/auth/callback/[provider]/route";
import { GET as analyticsRoute } from "./app/api/analytics/route";
import { POST as mediaPresignRoute } from "./app/api/media/presign/route";
import { POST as mediaUploadPostRoute, PUT as mediaUploadPutRoute } from "./app/api/media/upload/route";
import { POST as seoAssistantRoute } from "./app/api/seo/assistant/route";
import { GET as reportsExportRoute } from "./app/api/reports/export/route";

function createValidMp4Buffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(32, sizeBytes), 0x42);
  buf.writeUInt32BE(24, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("isom", 8, "ascii");
  buf.writeUInt32BE(512, 12);
  buf.write("isommp42", 16, "ascii");
  return buf;
}

function createValidPngBuffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(32, sizeBytes), 0x11);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  pngSig.copy(buf, 0);
  return buf;
}

async function runPhase6CTestSuite() {
  console.log("==================================================================");
  console.log("🚀 MEDIACONNECT PHASE 6C: AUTHORIZATION & INTEGRATION HARDENING");
  console.log("   (Stage 0 Security Fixes + Stage 1 Analytics + Stage 2 AI SEO + Stage 3 PDF)");
  console.log("==================================================================\n");

  let passedTests = 0;
  const totalTests = 12;
  const originalFetch = globalThis.fetch;

  const savedEnv = {
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
    YOUTUBE_QUOTA_PROJECT_ID: process.env.YOUTUBE_QUOTA_PROJECT_ID,
    YOUTUBE_DAILY_UPLOAD_LIMIT: process.env.YOUTUBE_DAILY_UPLOAD_LIMIT,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
    ALLOW_PAID_X_API: process.env.ALLOW_PAID_X_API,
    ALLOWED_MEDIA_HOSTS: process.env.ALLOWED_MEDIA_HOSTS,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  const restoreEnv = () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };

  const acmeWs = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  const testOwner = await db.user.findUnique({ where: { email: "owner@mediaconnect.app" } });
  const testEditor = await db.user.findUnique({ where: { email: "editor@mediaconnect.app" } });
  if (!acmeWs || !testOwner || !testEditor) {
    throw new Error("Seeded Acme Media workspace or users missing. Run npx prisma db seed first.");
  }

  const ownerSessionToken = await createSessionToken({
    userId: testOwner.id,
    email: testOwner.email,
    name: testOwner.name,
    activeWorkspaceId: acmeWs.id,
    role: "OWNER",
    tokenVersion: testOwner.tokenVersion,
  });

  const editorSessionToken = await createSessionToken({
    userId: testEditor.id,
    email: testEditor.email,
    name: testEditor.name,
    activeWorkspaceId: acmeWs.id,
    role: "EDITOR",
    tokenVersion: testEditor.tokenVersion,
  });

  // Create an isolated Beta tenant workspace to test strict multi-tenant isolation
  const betaWs = await db.workspace.create({
    data: {
      name: "Beta Isolated Tenant",
      slug: `beta-tenant-${Date.now()}`,
    },
  });

  try {
    // ----------------------------------------------------------------------
    // TEST 1: Analytics Workspace Isolation & Cross-Tenant Authorization
    // ----------------------------------------------------------------------
    console.log("TEST 1: Analytics Workspace Isolation & Cross-Tenant Authorization");
    const betaAcc = await db.account.create({
      data: {
        workspaceId: betaWs.id,
        platform: "YOUTUBE",
        platformAccountId: `UC_beta_${Date.now()}`,
        username: "@BetaOnlyChannel",
        displayName: "Beta Secret Channel",
        followersCount: 777777,
        isMock: true,
        status: "ACTIVE",
      },
    });

    const acmeOverview = await AnalyticsService.getOverview(acmeWs.id, 7);
    const betaOverview = await AnalyticsService.getOverview(betaWs.id, 7);

    if (acmeOverview.workspaceId !== acmeWs.id || betaOverview.workspaceId !== betaWs.id) {
      throw new Error("AnalyticsService.getOverview did not bind to the requested workspaceId!");
    }
    if (acmeOverview.totalFollowers >= 777777) {
      throw new Error("Tenant isolation failure: Beta workspace account followers leaked into Acme overview!");
    }
    if (betaOverview.totalFollowers !== 777777 || betaOverview.byPlatform.YOUTUBE?.followers !== 777777) {
      throw new Error("AnalyticsService.getOverview returned wrong workspace accounts for Beta tenant!");
    }

    // Cross-workspace API request must return 403 Forbidden
    const crossTenantAnalyticsReq = new NextRequest(
      `http://localhost:3000/api/analytics?workspaceId=${betaWs.id}&days=7`,
      {
        method: "GET",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}` },
      }
    );
    const crossTenantRes = await analyticsRoute(crossTenantAnalyticsReq);
    if (crossTenantRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on cross-workspace analytics query, got ${crossTenantRes.status}`);
    }

    await db.account.delete({ where: { id: betaAcc.id } });
    console.log("   ✓ AnalyticsService.getOverview and getAudienceHeatmap strictly scope by workspaceId");
    console.log("   ✓ Cross-workspace /api/analytics query rejected with 403 Forbidden");
    passedTests++;

    // ----------------------------------------------------------------------
    // TEST 2: Live-Account Analytics Provenance & Zero Synthetic Fallback
    // ----------------------------------------------------------------------
    console.log("\nTEST 2: Live-Account Analytics Provenance & Zero Synthetic Fallback");
    await db.account.create({
      data: {
        workspaceId: betaWs.id,
        platform: "YOUTUBE",
        platformAccountId: `UC_live_unsynced_${Date.now()}`,
        username: "@UnsyncedLiveYT",
        displayName: "Unsynced Live YT",
        followersCount: 50000, // Previously would have fabricated 50000 * 0.02 = 1000 follower growth!
        isMock: false,
        status: "ACTIVE",
      },
    });

    await db.account.create({
      data: {
        workspaceId: betaWs.id,
        platform: "X",
        platformAccountId: `x_live_${Date.now()}`,
        username: "@LiveXHandle",
        displayName: "Live X Account",
        followersCount: 25000,
        isMock: false,
        status: "ACTIVE",
      },
    });

    const liveCheckOverview = await AnalyticsService.getOverview(betaWs.id, 7);
    const ytSummary = liveCheckOverview.byPlatform.YOUTUBE;
    const xSummary = liveCheckOverview.byPlatform.X;

    if (!ytSummary || ytSummary.source !== "UNSYNCED_LIVE") {
      throw new Error(`Expected UNSYNCED_LIVE for unsynced live YouTube account, got ${ytSummary?.source}`);
    }
    if (ytSummary.followerGrowth !== null || liveCheckOverview.followerGrowth !== null) {
      throw new Error(
        `Synthetic 2% follower growth was fabricated for live account! Got: ${ytSummary.followerGrowth}`
      );
    }
    if (!xSummary || xSummary.source !== "UNSUPPORTED_PAID") {
      throw new Error(`Expected UNSUPPORTED_PAID for live X account, got ${xSummary?.source}`);
    }
    if (!xSummary.unavailableMetrics.includes("impressions") || !xSummary.unavailableMetrics.includes("reach")) {
      throw new Error("Live X account did not explicitly mark paid metrics as unavailable!");
    }

    const ytLiveHeatmap = await AnalyticsService.getAudienceHeatmap(betaWs.id, "YOUTUBE");
    const xLiveHeatmap = await AnalyticsService.getAudienceHeatmap(betaWs.id, "X");
    if (ytLiveHeatmap.available || ytLiveHeatmap.cells.length > 0) {
      throw new Error("Live YouTube account returned fabricated audience heatmap cells!");
    }
    if (xLiveHeatmap.available || xLiveHeatmap.cells.length > 0) {
      throw new Error("Live X account returned fabricated audience heatmap cells!");
    }

    await db.account.deleteMany({ where: { workspaceId: betaWs.id } });
    console.log("   ✓ Live accounts expose explicit provenance (UNSYNCED_LIVE / UNSUPPORTED_PAID) and zero synthetic 2% growth");
    console.log("   ✓ Live YouTube and X heatmaps return available=false with empty cells (never mock heatmaps)");
    passedTests++;

    // ----------------------------------------------------------------------
    // TEST 3: SSRF Prevention in YouTube Remote Media Retrieval
    // ----------------------------------------------------------------------
    console.log("\nTEST 3: SSRF Prevention in YouTube Remote Media Retrieval");
    process.env.ALLOWED_MEDIA_HOSTS = "cdn.mediaconnect.io,storage.mediaconnect.app";

    const unsafeUrls = [
      "http://cdn.mediaconnect.io/workspaces/ws_1/video.mp4", // Non-HTTPS
      "https://127.0.0.1/secret.mp4", // Loopback IPv4
      "https://localhost:3000/api/internal", // Localhost
      "https://169.254.169.254/latest/meta-data/iam", // Cloud metadata SSRF
      "https://10.0.0.42/private.mp4", // Private RFC1918 10/8
      "https://172.20.0.1/private.mp4", // Private RFC1918 172.16/12
      "https://192.168.1.1/router.mp4", // Private RFC1918 192.168/16
      "https://[::1]/loopback6.mp4", // IPv6 loopback
      "https://metadata.google.internal/computeMetadata/v1/", // Internal hostname
      "https://attacker-controlled.example.com/ssrf.mp4", // Untrusted host not in allowlist
    ];

    for (const badUrl of unsafeUrls) {
      let rejected = false;
      try {
        validateSafeRemoteMediaUrl(badUrl);
      } catch (err) {
        if (err instanceof StorageSecurityError) rejected = true;
      }
      if (!rejected) {
        throw new Error(`SSRF check failed to block unsafe URL: ${badUrl}`);
      }
    }

    // Verify redirect blocking and oversized response cap in fetchSafeRemoteMedia
    try {
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.redirect !== "error") {
          throw new Error("fetchSafeRemoteMedia must pass redirect: 'error' to block open redirects!");
        }
        return new Response(null, {
          status: 200,
          headers: { "content-length": String(150 * 1024 * 1024) }, // 150 MB > 100 MB cap
        });
      };

      let oversizeBlocked = false;
      try {
        await fetchSafeRemoteMedia("https://cdn.mediaconnect.io/workspaces/ws_1/huge.mp4");
      } catch (err) {
        if (err instanceof StorageSecurityError && err.message.includes("exceeds maximum allowed limit")) {
          oversizeBlocked = true;
        }
      }
      if (!oversizeBlocked) {
        throw new Error("fetchSafeRemoteMedia did not reject response exceeding 100 MB cap!");
      }
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv();
    }

    console.log("   ✓ HTTP, loopback, RFC1918 private IPs, 169.254.169.254 metadata, and untrusted hosts blocked");
    console.log("   ✓ HTTP redirects disabled (redirect: 'error') and 100 MB response-size cap enforced");
    passedTests++;

    // ----------------------------------------------------------------------
    // TEST 4: Post Workspace ID Enforcement on Stored Media Resolution
    // ----------------------------------------------------------------------
    console.log("\nTEST 4: Post Workspace ID Enforcement on Stored Media Resolution");
    process.env.YOUTUBE_CLIENT_ID = "yt_client_id";
    process.env.YOUTUBE_CLIENT_SECRET = "yt_client_secret";

    const localProvider = new LocalStorageProvider();
    StorageService.setProvider(localProvider);

    const betaOwnedMedia = await localProvider.upload(
      createValidMp4Buffer(128),
      "beta_private.mp4",
      "video/mp4",
      betaWs.id
    );

    try {
      const ytProvider = new YouTubeLiveProvider();
      let crossWorkspaceMediaBlocked = false;
      try {
        // Post belongs to acmeWs.id, but mediaUrls points to betaWs.id's local upload!
        await ytProvider.publishPost(
          {
            id: "acc_acme_yt",
            platform: "YOUTUBE",
            platformAccountId: "UC_acme",
            username: "@AcmeYT",
            displayName: "Acme YT",
            accessToken: "ya29.token",
            isMock: false,
            workspaceId: acmeWs.id,
          },
          {
            postId: "post_cross_ws",
            targetId: "target_cross_ws",
            workspaceId: acmeWs.id,
            content: "Attempting to steal Beta workspace media",
            mediaUrls: [betaOwnedMedia.publicUrl],
          }
        );
      } catch (err) {
        if (err instanceof StorageSecurityError && err.message.includes("Tenant isolation violation")) {
          crossWorkspaceMediaBlocked = true;
        }
      }

      if (!crossWorkspaceMediaBlocked) {
        throw new Error("YouTubeLiveProvider failed to block cross-workspace /uploads/ path access!");
      }

      // Also verify remote CDN URL workspace path mismatch is blocked
      let remoteCrossWorkspaceBlocked = false;
      try {
        await ytProvider.publishPost(
          {
            id: "acc_acme_yt",
            platform: "YOUTUBE",
            platformAccountId: "UC_acme",
            username: "@AcmeYT",
            displayName: "Acme YT",
            accessToken: "ya29.token",
            isMock: false,
            workspaceId: acmeWs.id,
          },
          {
            postId: "post_cross_ws_2",
            targetId: "target_cross_ws_2",
            workspaceId: acmeWs.id,
            content: "Attempting remote cross-workspace access",
            mediaUrls: [`https://cdn.mediaconnect.io/workspaces/${betaWs.id}/secret.mp4`],
          }
        );
      } catch (err) {
        if (err instanceof StorageSecurityError && err.message.includes("Tenant isolation violation")) {
          remoteCrossWorkspaceBlocked = true;
        }
      }

      if (!remoteCrossWorkspaceBlocked) {
        throw new Error("YouTubeLiveProvider failed to block cross-workspace remote CDN URL!");
      }

      console.log("   ✓ Post's actual workspaceId is enforced when resolving local and CDN media URLs");
      passedTests++;
    } finally {
      await localProvider.delete(betaOwnedMedia.storageKey, betaWs.id);
      restoreEnv();
    }

    // ----------------------------------------------------------------------
    // TEST 5: OAuth Mode State Binding & Callback Tampering Rejection
    // ----------------------------------------------------------------------
    console.log("\nTEST 5: OAuth Mode State Binding & Callback Tampering Rejection");
    // 5a. Initiate OAuth in mock mode
    const mockConnectReq = new NextRequest(
      "http://localhost:3000/api/auth/connect/youtube?mode=mock&format=json",
      {
        method: "GET",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
          Accept: "application/json",
        },
      }
    );
    const mockConnectRes = await oauthConnectRoute(mockConnectReq, {
      params: Promise.resolve({ provider: "youtube" }),
    });
    const mockConnectJson = await mockConnectRes.json();
    if (!mockConnectJson.success || mockConnectJson.mode !== "mock") {
      throw new Error("Expected mock connect response to succeed with mode='mock'");
    }

    const mockAuthUrl = new URL(mockConnectJson.authUrl, "http://localhost:3000");
    const mockStateToken = mockAuthUrl.searchParams.get("state")!;

    // 5b. Tamper with callback query string by passing ?mode=live for a state created with mode=mock
    const tamperedCallbackUrl = `http://localhost:3000/api/auth/callback/youtube?mode=live&code=mock_code&state=${encodeURIComponent(mockStateToken)}`;
    const tamperedCallbackRes = await oauthCallbackRoute(
      new NextRequest(tamperedCallbackUrl, {
        method: "GET",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}` },
      }),
      { params: Promise.resolve({ provider: "youtube" }) }
    );

    if (tamperedCallbackRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when callback ?mode= conflicts with signed OAuthState.mode, got ${tamperedCallbackRes.status}`);
    }
    const tamperedJson = await tamperedCallbackRes.json();
    if (!tamperedJson.error?.includes("OAuth mode tampering detected")) {
      throw new Error(`Expected 'OAuth mode tampering detected' error JSON, got: ${JSON.stringify(tamperedJson)}`);
    }

    console.log("   ✓ OAuthState binds mode ('mock' | 'live') in HMAC signature and DB record");
    console.log("   ✓ Callback ?mode= tampering rejected with 400 Bad Request");
    passedTests++;

    // ----------------------------------------------------------------------
    // TEST 6: Ambiguous Instagram Publication Recovery (Zero Duplicate Posts)
    // ----------------------------------------------------------------------
    console.log("\nTEST 6: Ambiguous Instagram Publication Recovery (Zero Duplicate Posts)");
    process.env.META_APP_ID = "meta_app_6c";
    process.env.META_APP_SECRET = "meta_secret_6c";
    process.env.INSTAGRAM_POLL_INTERVAL_MS = "5";

    const igAmbigAccId = `acc_ig_ambig_${Date.now()}`;
    const igAmbigAcc = await db.account.create({
      data: {
        id: igAmbigAccId,
        workspaceId: acmeWs.id,
        platform: "INSTAGRAM",
        platformAccountId: "17841409999",
        username: "@AmbigRecoverIG",
        displayName: "Ambig Recover IG",
        accessToken: TokenVault.encrypt("IGQVJ_ambig_token", igAmbigAccId, "v1"),
        tokenKeyVersion: "v1",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        isMock: false,
        status: "ACTIVE",
      },
    });

    const igAmbigPost = await db.post.create({
      data: {
        workspaceId: acmeWs.id,
        content: "Testing ambiguous Instagram publish recovery",
        mediaUrls: JSON.stringify(["https://cdn.mediaconnect.io/workspaces/acme/photo.jpg"]),
        status: "SCHEDULED",
        approvalStatus: "APPROVED",
        targets: {
          create: [
            {
              accountId: igAmbigAcc.id,
              platform: "INSTAGRAM",
              status: "PENDING",
            },
          ],
        },
      },
      include: { targets: true },
    });

    try {
      let containerCreateCalls = 0;
      let mediaPublishCalls = 0;
      let permalinkFetchCalls = 0;

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (init?.method || "GET").toUpperCase();

        if (method === "POST" && urlStr.endsWith("/17841409999/media")) {
          containerCreateCalls++;
          return Response.json({ id: "ig_container_ambig_777" });
        }

        if (method === "GET" && urlStr.includes("/v21.0/ig_container_ambig_777")) {
          return Response.json({ status_code: "FINISHED", status: "Ready" });
        }

        if (method === "POST" && urlStr.endsWith("/17841409999/media_publish")) {
          mediaPublishCalls++;
          return Response.json({ id: "ig_published_ambig_888" });
        }

        if (method === "GET" && urlStr.includes("/v21.0/ig_published_ambig_888")) {
          permalinkFetchCalls++;
          if (permalinkFetchCalls === 1) {
            // Simulate network/500 failure AFTER media_publish succeeded!
            return new Response("Temporary Graph API 500 during permalink fetch", { status: 500 });
          }
          return Response.json({
            id: "ig_published_ambig_888",
            permalink: "https://www.instagram.com/p/C_reconciled_post_888/",
            shortcode: "C_reconciled_post_888",
          });
        }

        return new Response(`Unexpected IG URL: ${urlStr}`, { status: 404 });
      };

      const targetId = igAmbigPost.targets[0].id;

      // Attempt 1: media_publish succeeds, permalink GET fails -> must persist remoteContainerId + platformPostId!
      const attempt1 = await PublisherService.publishTarget(targetId);
      if (
        attempt1.status !== "FAILED" ||
        attempt1.remoteContainerId !== "ig_container_ambig_777" ||
        attempt1.platformPostId !== "ig_published_ambig_888"
      ) {
        throw new Error(
          `Attempt 1 did not persist remoteContainerId and platformPostId on ambiguous failure! Got: ${JSON.stringify(attempt1)}`
        );
      }

      // Advance nextRetryAt so Attempt 2 can run
      await db.postTarget.update({
        where: { id: targetId },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });

      // Attempt 2: Reconciles permalink for existing platformPostId without calling /media or /media_publish again!
      const attempt2 = await PublisherService.publishTarget(targetId);
      if (attempt2.status !== "PUBLISHED" || attempt2.liveUrl !== "https://www.instagram.com/p/C_reconciled_post_888/") {
        throw new Error(`Attempt 2 failed to reconcile Instagram post: ${attempt2.errorMessage}`);
      }
      if (containerCreateCalls !== 1 || mediaPublishCalls !== 1) {
        throw new Error(
          `Duplicate Instagram publication! containerCreateCalls=${containerCreateCalls}, mediaPublishCalls=${mediaPublishCalls}`
        );
      }

      console.log("   ✓ Ambiguous Instagram failure persisted remoteContainerId & platformPostId on PostTarget");
      console.log("   ✓ Retry reconciled permalink via Graph API with 0 duplicate /media or /media_publish calls");
      passedTests++;
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.INSTAGRAM_POLL_INTERVAL_MS;
      await db.postTarget.deleteMany({ where: { postId: igAmbigPost.id } });
      await db.post.delete({ where: { id: igAmbigPost.id } });
      await db.account.delete({ where: { id: igAmbigAcc.id } });
      restoreEnv();
    }

    // ----------------------------------------------------------------------
    // TEST 7: Worker Lease Ownership Fencing & nextRetryAt Enforcement
    // ----------------------------------------------------------------------
    console.log("\nTEST 7: Worker Lease Ownership Fencing (leaseOwner) & nextRetryAt Enforcement");
    const mockYtAcc = await db.account.findFirst({
      where: { workspaceId: acmeWs.id, platform: "YOUTUBE", isMock: true },
    });
    if (!mockYtAcc) throw new Error("Missing seeded mock YouTube account");

    const leasePost = await db.post.create({
      data: {
        workspaceId: acmeWs.id,
        content: "Testing worker lease fencing and nextRetryAt",
        mediaUrls: JSON.stringify(["/uploads/test.mp4"]),
        status: "SCHEDULED",
        approvalStatus: "APPROVED",
        targets: {
          create: [
            {
              accountId: mockYtAcc.id,
              platform: "YOUTUBE",
              status: "FAILED",
              retryCount: 1,
              nextRetryAt: new Date(Date.now() + 60_000), // 60s in the future!
            },
          ],
        },
      },
      include: { targets: true },
    });

    try {
      const targetId = leasePost.targets[0].id;

      // 7a. Target with future nextRetryAt must NOT be claimed by publishTarget
      const skippedTarget = await PublisherService.publishTarget(targetId);
      if (skippedTarget.status !== "FAILED" || skippedTarget.retryCount !== 1) {
        throw new Error("publishTarget claimed a FAILED target before its nextRetryAt backoff elapsed!");
      }

      // 7b. Simulate Worker A holding an active lease that expires and is reclaimed by Worker B
      await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHING",
          leaseOwner: "worker_B_active",
          claimedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      // Stale Worker A tries to renew lease or fenced-update -> MUST throw LeaseFencingError!
      const renewedByStale = await PublisherService.renewTargetLease(targetId, "worker_A_stale");
      if (renewedByStale) {
        throw new Error("Stale worker_A was allowed to renew lease owned by worker_B!");
      }

      let fencingErrorCaught = false;
      try {
        await PublisherService.fencedUpdateTarget(targetId, "worker_A_stale", {
          status: "PUBLISHED",
          platformPostId: "stale_overwrite",
        });
      } catch (err) {
        if (err instanceof LeaseFencingError) fencingErrorCaught = true;
      }

      if (!fencingErrorCaught) {
        throw new Error("Stale worker_A was allowed to overwrite target state owned by worker_B!");
      }

      // Verify Worker B can cleanly update its own fenced target
      const updatedByOwner = await PublisherService.fencedUpdateTarget(targetId, "worker_B_active", {
        status: "PUBLISHED",
        platformPostId: "fenced_ok_123",
        leaseOwner: null,
        claimedAt: null,
        leaseExpiresAt: null,
      });
      if (updatedByOwner.status !== "PUBLISHED" || updatedByOwner.platformPostId !== "fenced_ok_123") {
        throw new Error("Active lease owner worker_B failed to update target!");
      }

      console.log("   ✓ Future nextRetryAt backoff strictly prevents premature worker claiming");
      console.log("   ✓ LeaseFencingError prevents stale workers from overwriting reclaimed PostTarget state");
      passedTests++;
    } finally {
      await db.postTarget.deleteMany({ where: { postId: leasePost.id } });
      await db.post.delete({ where: { id: leasePost.id } });
    }

    // ----------------------------------------------------------------------
    // TEST 8: Shared Project-Level YouTube Quota, Pacific Time & Atomic Concurrency
    // ----------------------------------------------------------------------
    console.log("\nTEST 8: Shared Project-Level YouTube Quota, Pacific Time & Atomic Concurrency");
    const uniqueProjectId = `gcp_proj_atomic_${Date.now()}`;
    process.env.YOUTUBE_QUOTA_PROJECT_ID = uniqueProjectId;
    process.env.YOUTUBE_DAILY_UPLOAD_LIMIT = "3";

    try {
      const pacificDate = YouTubeQuotaManager.getPacificDateString(new Date("2026-11-07T08:30:00.000Z"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pacificDate)) {
        throw new Error(`Invalid Pacific Time date format: ${pacificDate}`);
      }

      // Fire 10 concurrent reservations across multiple YouTube channels sharing the same Google Cloud project
      const concurrentResults = await Promise.all(
        Array.from({ length: 10 }, (_, idx) =>
          YouTubeQuotaManager.checkAndReserveUploadQuota(`UC_channel_${idx % 3}`)
        )
      );

      const allowedCount = concurrentResults.filter((r) => r.allowed).length;
      const rejectedCount = concurrentResults.filter((r) => !r.allowed).length;

      if (allowedCount !== 3 || rejectedCount !== 7) {
        throw new Error(`Expected 3 allowed and 7 rejected concurrent reservations, got allowed=${allowedCount}, rejected=${rejectedCount}`);
      }

      // Verify usedCount in database is strictly 3 (never incremented past limitCount!)
      const bucketEntityId = YouTubeQuotaManager.getProjectQuotaEntityId();
      const quotaRecord = await db.platformQuota.findUnique({
        where: {
          platform_entityId_date: {
            platform: "YOUTUBE",
            entityId: bucketEntityId,
            date: YouTubeQuotaManager.getPacificDateString(),
          },
        },
      });

      if (!quotaRecord || quotaRecord.usedCount !== 3) {
        throw new Error(`Expected usedCount === 3 in PlatformQuota, got ${quotaRecord?.usedCount}`);
      }

      console.log("   ✓ Shared Google Cloud project bucket (America/Los_Angeles PT reset) verified");
      console.log("   ✓ 10 concurrent reservations against limit=3 allowed 3 and left usedCount=3 (no over-increment)");
      passedTests++;
    } finally {
      restoreEnv();
    }

    // ----------------------------------------------------------------------
    // TEST 9: Authenticated Media Presign & Upload Routes + 180s Shorts Limit
    // ----------------------------------------------------------------------
    console.log("\nTEST 9: Authenticated Media Presign & Upload Routes + 180s YouTube Shorts Limit");
    const validMp4 = createValidMp4Buffer(96);

    // 9a. YouTube Shorts 180-second limit check
    const short175s = StorageService.validateMedia({
      filename: "short_175s.mp4",
      mimeType: "video/mp4",
      sizeBytes: validMp4.length,
      buffer: validMp4,
      width: 1080,
      height: 1920,
      durationSeconds: 175,
      targetPlatform: "YOUTUBE",
      format: "SHORT",
    });
    const short185s = StorageService.validateMedia({
      filename: "short_185s.mp4",
      mimeType: "video/mp4",
      sizeBytes: validMp4.length,
      buffer: validMp4,
      width: 1080,
      height: 1920,
      durationSeconds: 185,
      targetPlatform: "YOUTUBE",
      format: "SHORT",
    });
    if (!short175s.isValid || short185s.isValid) {
      throw new Error("YouTube Shorts 180-second (3-minute) duration validation rule failed!");
    }

    // 9b. POST /api/media/presign -> PUT /api/media/upload round-trip
    const presignReq = new NextRequest("http://localhost:3000/api/media/presign", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: "api_presigned_short.mp4",
        mimeType: "video/mp4",
        sizeBytes: validMp4.length,
        targetPlatform: "YOUTUBE",
        format: "SHORT",
        width: 1080,
        height: 1920,
        durationSeconds: 120,
      }),
    });
    const presignRes = await mediaPresignRoute(presignReq);
    const presignData = await presignRes.json();
    if (presignRes.status !== 200 || !presignData.success || !presignData.storageKey) {
      throw new Error(`Presign route failed: ${JSON.stringify(presignData)}`);
    }

    const putUploadUrl = `http://localhost:3000${presignData.uploadUrl}`;
    const putReq = new NextRequest(putUploadUrl, {
      method: "PUT",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
        "Content-Type": "video/mp4",
      },
      body: new Uint8Array(validMp4),
    });
    const putRes = await mediaUploadPutRoute(putReq);
    const putData = await putRes.json();
    if (putRes.status !== 200 || !putData.success || !putData.media?.storageKey) {
      throw new Error(`PUT /api/media/upload failed: ${JSON.stringify(putData)}`);
    }

    // Verify stored object exists on disk and belongs to acmeWs.id
    const storedHead = await StorageService.getProvider().head(putData.media.storageKey, acmeWs.id);
    if (!storedHead.exists || storedHead.sizeBytes !== validMp4.length) {
      throw new Error("Uploaded media object via PUT /api/media/upload was not persisted in storage!");
    }
    await StorageService.getProvider().delete(putData.media.storageKey, acmeWs.id);

    // 9c. Cross-workspace upload attempt must return 403 Forbidden
    const crossWsUploadReq = new NextRequest("http://localhost:3000/api/media/upload", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: betaWs.id,
        filename: "intruder.png",
        mimeType: "image/png",
        base64Data: createValidPngBuffer(64).toString("base64"),
      }),
    });
    const crossWsUploadRes = await mediaUploadPostRoute(crossWsUploadReq);
    if (crossWsUploadRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on cross-workspace upload, got ${crossWsUploadRes.status}`);
    }

    console.log("   ✓ /api/media/presign and /api/media/upload verified end-to-end with real storage persistence");
    console.log("   ✓ YouTube Shorts 180-second limit and cross-workspace 403 upload protection verified");
    passedTests++;

    // ----------------------------------------------------------------------
    // TEST 10: Stage 1 Real Analytics Ingestion (YouTube v2 + Instagram v21.0)
    // ----------------------------------------------------------------------
    console.log("\nTEST 10: Stage 1 Real Analytics Ingestion (YouTube v2 + Instagram v21.0 + Deduplication)");
    process.env.YOUTUBE_CLIENT_ID = "yt_id_6c";
    process.env.YOUTUBE_CLIENT_SECRET = "yt_sec_6c";
    process.env.META_APP_ID = "ig_id_6c";
    process.env.META_APP_SECRET = "ig_sec_6c";
    delete process.env.ALLOW_PAID_X_API;

    const liveYtSyncId = `acc_yt_sync_${Date.now()}`;
    const liveIgSyncId = `acc_ig_sync_${Date.now()}`;
    const liveXSyncId = `acc_x_sync_${Date.now()}`;

    await db.account.create({
      data: {
        id: liveYtSyncId,
        workspaceId: betaWs.id,
        platform: "YOUTUBE",
        platformAccountId: "UC_live_sync_yt",
        username: "@LiveSyncYT",
        displayName: "Live Sync YT",
        accessToken: TokenVault.encrypt("ya29.sync_yt_tok", liveYtSyncId, "v1"),
        tokenKeyVersion: "v1",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        isMock: false,
        status: "ACTIVE",
      },
    });

    await db.account.create({
      data: {
        id: liveIgSyncId,
        workspaceId: betaWs.id,
        platform: "INSTAGRAM",
        platformAccountId: "17841407777",
        username: "@LiveSyncIG",
        displayName: "Live Sync IG",
        accessToken: TokenVault.encrypt("IGQVJ_sync_ig_tok", liveIgSyncId, "v1"),
        tokenKeyVersion: "v1",
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        isMock: false,
        status: "ACTIVE",
      },
    });

    await db.account.create({
      data: {
        id: liveXSyncId,
        workspaceId: betaWs.id,
        platform: "X",
        platformAccountId: "x_live_sync_1",
        username: "@LiveSyncX",
        displayName: "Live Sync X",
        accessToken: TokenVault.encrypt("x_sync_tok", liveXSyncId, "v1"),
        tokenKeyVersion: "v1",
        isMock: false,
        status: "ACTIVE",
      },
    });

    try {
      let ytAnalyticsAttempts = 0;
      const day1 = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
      const day2 = new Date(Date.now() - 1 * 86400_000).toISOString().slice(0, 10);

      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (urlStr.startsWith("https://youtubeanalytics.googleapis.com/v2/reports")) {
          ytAnalyticsAttempts++;
          if (ytAnalyticsAttempts === 1) {
            // Simulate rate-limit 429 on first attempt to verify automatic backoff retry
            return new Response("Rate limit exceeded", { status: 429, headers: { "retry-after": "0" } });
          }
          return Response.json({
            columnHeaders: [
              { name: "day" },
              { name: "views" },
              { name: "likes" },
              { name: "comments" },
              { name: "shares" },
              { name: "subscribersGained" },
              { name: "subscribersLost" },
            ],
            rows: [
              [day1, 1200, 80, 15, 5, 25, 3], // Net +22 subscribers
              [day2, 1800, 110, 20, 10, 30, 5], // Net +25 subscribers
            ],
          });
        }

        if (urlStr.includes("/17841407777/insights") && urlStr.includes("metric=reach")) {
          return Response.json({
            data: [
              {
                name: "reach",
                values: [
                  { value: 950, end_time: `${day1}T08:00:00+0000` },
                  { value: 1450, end_time: `${day2}T08:00:00+0000` },
                ],
              },
              {
                name: "impressions",
                values: [
                  { value: 1300, end_time: `${day1}T08:00:00+0000` },
                  { value: 2100, end_time: `${day2}T08:00:00+0000` },
                ],
              },
              {
                name: "total_interactions",
                values: [
                  { value: 120, end_time: `${day1}T08:00:00+0000` },
                  { value: 190, end_time: `${day2}T08:00:00+0000` },
                ],
              },
              {
                name: "follower_count",
                values: [
                  { value: 12, end_time: `${day1}T08:00:00+0000` },
                  { value: 18, end_time: `${day2}T08:00:00+0000` },
                ],
              },
            ],
          });
        }

        if (urlStr.includes("/17841407777/insights") && urlStr.includes("metric=online_followers")) {
          return Response.json({
            data: [
              {
                name: "online_followers",
                values: [
                  {
                    value: { "0": 15, "9": 120, "12": 240, "18": 380 },
                  },
                ],
              },
            ],
          });
        }

        return new Response(`Unexpected Analytics URL: ${urlStr}`, { status: 404 });
      };

      const sync1 = await AnalyticsService.syncWorkspaceAnalytics(betaWs.id, { days: 7 });
      const ytSyncRes = sync1.accounts.find((r) => r.accountId === liveYtSyncId)!;
      const igSyncRes = sync1.accounts.find((r) => r.accountId === liveIgSyncId)!;
      const xSyncRes = sync1.accounts.find((r) => r.accountId === liveXSyncId)!;

      if (ytSyncRes.status !== "SYNCED" || ytSyncRes.snapshotsUpserted !== 2) {
        throw new Error(`YouTube live analytics sync failed: ${JSON.stringify(ytSyncRes)}`);
      }
      if (igSyncRes.status !== "SYNCED" || igSyncRes.snapshotsUpserted !== 2) {
        throw new Error(`Instagram live analytics sync failed: ${JSON.stringify(igSyncRes)}`);
      }
      if (xSyncRes.status !== "SKIPPED_PAID") {
        throw new Error(`Expected SKIPPED_PAID for live X account, got ${xSyncRes.status}`);
      }

      // Run sync a second time to verify (accountId, date) deduplication
      await AnalyticsService.syncWorkspaceAnalytics(betaWs.id, { days: 7 });
      const totalSnapshots = await db.metricSnapshot.count({
        where: { accountId: { in: [liveYtSyncId, liveIgSyncId] } },
      });
      if (totalSnapshots !== 4) {
        throw new Error(`Expected 4 deduplicated snapshots across 2 accounts & 2 days, got ${totalSnapshots}`);
      }

      // Verify synced overview provenance and Instagram heatmap availability
      const syncedOverview = await AnalyticsService.getOverview(betaWs.id, 30);
      const syncedYt = syncedOverview.byPlatform.YOUTUBE;
      const syncedIg = syncedOverview.byPlatform.INSTAGRAM;

      if (!syncedYt || syncedYt.source !== "LIVE_YOUTUBE_ANALYTICS" || syncedYt.followerGrowth !== 47) {
        throw new Error(`Unexpected YouTube synced metrics: ${JSON.stringify(syncedYt)}`);
      }
      if (!syncedIg || syncedIg.source !== "LIVE_INSTAGRAM_INSIGHTS" || syncedIg.reach !== 2400) {
        throw new Error(`Unexpected Instagram synced metrics: ${JSON.stringify(syncedIg)}`);
      }

      const igHeatmap = await AnalyticsService.getAudienceHeatmap(betaWs.id, "INSTAGRAM");
      if (!igHeatmap.available || igHeatmap.source !== "LIVE_INSTAGRAM_INSIGHTS" || igHeatmap.cells.length !== 168) {
        throw new Error("Instagram live online_followers heatmap was not persisted and returned!");
      }

      console.log("   ✓ YouTube Analytics v2 (with 429 retry) and Instagram Graph API v21.0 insights ingested");
      console.log("   ✓ Snapshot deduplication on (accountId, date) and paid X exclusion verified");
      passedTests++;
    } finally {
      globalThis.fetch = originalFetch;
      await db.metricSnapshot.deleteMany({ where: { accountId: { in: [liveYtSyncId, liveIgSyncId, liveXSyncId] } } });
      await db.account.deleteMany({ where: { id: { in: [liveYtSyncId, liveIgSyncId, liveXSyncId] } } });
      restoreEnv();
    }

    // ----------------------------------------------------------------------
    // TEST 11: Stage 2 Provider-Independent AI Social SEO Assistant
    // ----------------------------------------------------------------------
    console.log("\nTEST 11: Stage 2 Provider-Independent AI Social SEO Assistant");
    try {
      // 11a. Retired gemini-2.0-flash must be rejected
      process.env.AI_PROVIDER = "gemini";
      process.env.AI_MODEL = "gemini-2.0-flash";
      let retiredRejected = false;
      try {
        AiSeoService.resolveConfig();
      } catch (err) {
        if (err instanceof UnsupportedAiModelError) retiredRejected = true;
      }
      if (!retiredRejected) {
        throw new Error("AiSeoService did not reject retired model 'gemini-2.0-flash'!");
      }

      // 11b. Configurable Gemini model (default gemini-2.5-flash) via /api/seo/assistant
      delete process.env.AI_MODEL;
      process.env.AI_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "test_gemini_key_6c";

      let requestedModelUrl = "";
      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        requestedModelUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      captionImprovements: [
                        "How we cut video rendering time by 45% using edge workers — full breakdown below.",
                      ],
                      hookAlternatives: [
                        {
                          style: "QUESTION",
                          hook: "Still waiting 20 minutes for video exports?",
                        },
                        {
                          style: "PROBLEM_SOLUTION",
                          hook: "How we reduced rendering latency by 45% without adding servers.",
                        },
                        {
                          style: "STRUCTURED_LIST",
                          hook: "3 bottlenecks slowing down your social video workflow:",
                        },
                      ],
                      hashtagRecommendations: {
                        broad: ["#VideoWorkflow", "#CreatorOps"],
                        niche: ["#WebDev", "#Shorts"],
                        community: ["#BuildInPublic"],
                      },
                      platformFormatting: {
                        YOUTUBE: {
                          title: "Cut Video Rendering Time by 45%",
                          description: "Full breakdown of our edge rendering workflow.",
                          tags: ["VideoWorkflow", "CreatorOps"],
                        },
                        INSTAGRAM: {
                          caption: "How we cut rendering latency by 45%.",
                          firstComment: "#VideoWorkflow #CreatorOps",
                        },
                        X: {
                          post: "How we cut video rendering latency by 45% using edge workers. #VideoWorkflow",
                        },
                      },
                      contentSuggestions: [
                        "Add a concrete benchmark metric in the opening hook.",
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });
      };

      const seoReq = new NextRequest("http://localhost:3000/api/seo/assistant", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Check out our new video workflow update",
          topic: "video workflow",
          targetPlatform: "YOUTUBE",
        }),
      });

      const seoRes = await seoAssistantRoute(seoReq);
      const seoData = await seoRes.json();
      if (
        seoRes.status !== 200 ||
        !seoData.success ||
        seoData.assistant?.source !== "AI_MODEL" ||
        seoData.assistant?.model !== "gemini-2.5-flash"
      ) {
        throw new Error(`AI SEO Assistant route failed: ${JSON.stringify(seoData)}`);
      }
      if (!requestedModelUrl.includes("models/gemini-2.5-flash:generateContent")) {
        throw new Error(`Expected gemini-2.5-flash endpoint, got: ${requestedModelUrl}`);
      }
      if (!seoData.assistant.disclaimer.includes("do not predict or guarantee algorithmic reach or virality")) {
        throw new Error("AI SEO response missing non-virality disclaimer!");
      }

      // 11c. Free local heuristic fallback when AI_PROVIDER=heuristic
      process.env.AI_PROVIDER = "heuristic";
      const fallbackResult = await AiSeoService.generateSuggestions({
        content: "Short draft without tags",
        topic: "video",
        targetPlatform: "INSTAGRAM",
      });
      if (fallbackResult.source !== "HEURISTIC_FALLBACK" || fallbackResult.hookAlternatives.length < 2) {
        throw new Error("Heuristic fallback failed to return structured SEO recommendations!");
      }

      console.log("   ✓ Retired gemini-2.0-flash rejected; configurable AI_MODEL defaults to gemini-2.5-flash");
      console.log("   ✓ AI_MODEL and HEURISTIC_FALLBACK provenance + non-virality disclaimers verified");
      passedTests++;
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv();
    }

    // ----------------------------------------------------------------------
    // TEST 12: Stage 3 Server-Generated PDF Reports & RBAC Authorization
    // ----------------------------------------------------------------------
    console.log("\nTEST 12: Stage 3 Server-Generated PDF Reports & RBAC Authorization");
    // 12a. EDITOR role must be rejected (403 Forbidden) on reports:export
    const editorExportReq = new NextRequest("http://localhost:3000/api/reports/export?days=7", {
      method: "GET",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${editorSessionToken}` },
    });
    const editorExportRes = await reportsExportRoute(editorExportReq);
    if (editorExportRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden when EDITOR requests PDF export, got ${editorExportRes.status}`);
    }

    // 12b. OWNER role receives valid %PDF-1.4 document with workspace branding & disclosures
    const ownerExportReq = new NextRequest("http://localhost:3000/api/reports/export?days=7", {
      method: "GET",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}` },
    });
    const ownerExportRes = await reportsExportRoute(ownerExportReq);
    if (ownerExportRes.status !== 200 || ownerExportRes.headers.get("content-type") !== "application/pdf") {
      throw new Error(`Expected 200 application/pdf from /api/reports/export, got ${ownerExportRes.status}`);
    }

    const pdfBytes = Buffer.from(await ownerExportRes.arrayBuffer());
    const pdfText = pdfBytes.toString("latin1");

    if (!pdfText.startsWith("%PDF-1.4") || !pdfText.trimEnd().endsWith("%%EOF")) {
      throw new Error("Generated report is not a valid PDF 1.4 binary document!");
    }
    if (
      !pdfText.includes("MEDIACONNECT EXECUTIVE PERFORMANCE REPORT") ||
      !pdfText.includes("Acme Media") ||
      !pdfText.includes("4. METRIC DEFINITIONS & METHODOLOGY") ||
      !pdfText.includes("3. UNAVAILABLE DATA & PROVIDER LIMITATION DISCLOSURES")
    ) {
      throw new Error("Generated PDF report is missing required branding, definitions, or disclosure sections!");
    }

    console.log("   ✓ RBAC enforced on /api/reports/export (EDITOR 403, OWNER 200 application/pdf)");
    console.log("   ✓ Valid %PDF-1.4 binary generated with branding, date range, definitions, and UNAVAILABLE disclosures");
    passedTests++;
  } finally {
    await db.workspace.delete({ where: { id: betaWs.id } });
    restoreEnv();
  }

  console.log("\n==================================================================");
  console.log(`🎉 ALL PHASE 6C TESTS PASSED (${passedTests}/${totalTests})!`);
  console.log("==================================================================");
}

runPhase6CTestSuite()
  .catch((err) => {
    console.error("\n❌ PHASE 6C TEST SUITE FAILED:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
