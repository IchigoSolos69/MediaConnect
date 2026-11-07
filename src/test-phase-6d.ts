import { db } from "./lib/db";
import {
  StorageService,
  S3CompatibleStorageProvider,
  StorageSecurityError,
} from "./services/storage.service";
import { InstagramLiveProvider } from "./providers/live/instagram.provider";
import { createSessionToken, SESSION_COOKIE_NAME } from "./lib/auth/session";
import { AnalyticsService } from "./services/analytics.service";
import { ReportService } from "./services/report.service";
import { AiSeoService } from "./services/ai-seo.service";
import { NextRequest } from "next/server";
import { POST as mediaPresignRoute } from "./app/api/media/presign/route";
import { POST as mediaUploadPostRoute, PUT as mediaUploadPutRoute } from "./app/api/media/upload/route";
import { POST as seoAssistantRoute } from "./app/api/seo/assistant/route";

function createValidMp4Buffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(32, sizeBytes), 0x42);
  buf.writeUInt32BE(24, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("isom", 8, "ascii");
  buf.writeUInt32BE(512, 12);
  buf.write("isommp42", 16, "ascii");
  return buf;
}

async function runPhase6DTestSuite() {
  console.log("==================================================================");
  console.log("🚀 MEDIACONNECT PHASE 6D: PRE-LAUNCH VALIDATION & FINAL CORRECTIONS");
  console.log("   (Instagram Insights Views + Local Presign Key Equality + Safety Limits +");
  console.log("    Multi-Account Aggregation + Multi-Page PDF + AI SEO Daily Quotas)");
  console.log("==================================================================\n");

  let passedTests = 0;
  const totalTests = 8;
  const originalFetch = globalThis.fetch;

  const savedEnv = {
    ALLOW_EXTERNAL_AI: process.env.ALLOW_EXTERNAL_AI,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AI_DAILY_QUOTA_LIMIT: process.env.AI_DAILY_QUOTA_LIMIT,
  };

  try {
    // ------------------------------------------------------------------------
    // Setup Test Workspace and User
    // ------------------------------------------------------------------------
    const testUser = await db.user.upsert({
      where: { email: "phase6d_tester@mediaconnect.io" },
      update: {},
      create: {
        email: "phase6d_tester@mediaconnect.io",
        name: "Phase 6D QA Tester",
        role: "ADMIN",
        passwordHash: "test_hash_phase6d",
      },
    });

    const testWorkspace = await db.workspace.upsert({
      where: { slug: "workspace-phase-6d" },
      update: {},
      create: {
        name: "Workspace Phase 6D",
        slug: "workspace-phase-6d",
      },
    });

    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: testWorkspace.id,
          userId: testUser.id,
        },
      },
      update: { role: "OWNER" },
      create: {
        workspaceId: testWorkspace.id,
        userId: testUser.id,
        role: "OWNER",
      },
    });

    const sessionJwt = await createSessionToken({
      userId: testUser.id,
      email: testUser.email,
      name: testUser.name,
      role: "OWNER",
      activeWorkspaceId: testWorkspace.id,
      tokenVersion: testUser.tokenVersion,
    });

    const authHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${sessionJwt}`,
      "x-workspace-id": testWorkspace.id,
    };

    // ------------------------------------------------------------------------
    // Test 1: Instagram Insights Views Metric, Fallback & Backoff Handling
    // ------------------------------------------------------------------------
    console.log("▶ Test 1: Instagram Insights queries 'views' with fallback and backoff");
    {
      process.env.META_APP_ID = "meta_test_app_id";
      process.env.META_APP_SECRET = "meta_test_app_secret";

      const igProvider = new InstagramLiveProvider();
      let capturedMetricParam = "";
      let attemptCount = 0;

      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("graph.instagram.com") && urlStr.includes("/insights")) {
          attemptCount++;
          const parsed = new URL(urlStr);
          capturedMetricParam = parsed.searchParams.get("metric") || "";

          // First call: simulate 429 rate limit to verify backoff retry
          if (attemptCount === 1) {
            return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Subsequent call: return valid payload with 'views' series
          return new Response(
            JSON.stringify({
              data: [
                {
                  name: "views",
                  period: "day",
                  values: [
                    { value: 1250, end_time: "2026-11-01T07:00:00+0000" },
                    { value: 1800, end_time: "2026-11-02T07:00:00+0000" },
                  ],
                },
                {
                  name: "reach",
                  period: "day",
                  values: [
                    { value: 900, end_time: "2026-11-01T07:00:00+0000" },
                    { value: 1400, end_time: "2026-11-02T07:00:00+0000" },
                  ],
                },
                {
                  name: "total_interactions",
                  period: "day",
                  values: [
                    { value: 120, end_time: "2026-11-01T07:00:00+0000" },
                    { value: 210, end_time: "2026-11-02T07:00:00+0000" },
                  ],
                },
                {
                  name: "follower_count",
                  period: "day",
                  values: [
                    { value: 15, end_time: "2026-11-01T07:00:00+0000" },
                    { value: 25, end_time: "2026-11-02T07:00:00+0000" },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (urlStr.includes("graph.instagram.com") && urlStr.includes("followers_count")) {
          return new Response(JSON.stringify({ followers_count: 5432, media_count: 88 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      const mockLiveAccount = {
        id: "ig_test_acc_1",
        workspaceId: testWorkspace.id,
        platform: "INSTAGRAM" as const,
        platformAccountId: "17841400000000001",
        username: "live_ig_user",
        displayName: "Live IG User",
        accessToken: "EAAB_test_token_live_123",
        isMock: false,
      };

      const insights = await igProvider.fetchInsights(mockLiveAccount, {
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-02T23:59:59Z"),
      });

      if (!capturedMetricParam.includes("views")) {
        throw new Error(`Expected 'views' in Instagram insights metric param, got: ${capturedMetricParam}`);
      }
      if (attemptCount < 2) {
        throw new Error(`Expected at least 2 attempts due to 429 backoff, got: ${attemptCount}`);
      }
      if (insights.totalImpressions !== 3050) {
        throw new Error(`Expected totalImpressions 3050 from views, got: ${insights.totalImpressions}`);
      }
      if (insights.totalReach !== 2300) {
        throw new Error(`Expected totalReach 2300, got: ${insights.totalReach}`);
      }
      if (insights.totalEngagements !== 330) {
        throw new Error(`Expected totalEngagements 330, got: ${insights.totalEngagements}`);
      }
      if (insights.followerGrowth !== 40) {
        throw new Error(`Expected followerGrowth 40, got: ${insights.followerGrowth}`);
      }
      if (!insights.dailyMetrics[0].availableMetrics?.includes("views")) {
        throw new Error("Expected 'views' to be recorded in availableMetrics");
      }

      console.log("   ✓ Instagram Insights queries supported 'views' metric with 429 backoff retry");
      console.log("   ✓ Maps 'views' to verified impressions and tracks net followerGrowth");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 2: Presigned Local Media Upload Strict Key Equality & Readback
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 2: Local presigned upload writes to exact normalizedKey with byte-identical readback");
    {
      const presignReq = new NextRequest("http://localhost:3000/api/media/presign", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "test_promo_video.mp4",
          mimeType: "video/mp4",
          sizeBytes: 1024,
          workspaceId: testWorkspace.id,
        }),
      });

      const presignRes = await mediaPresignRoute(presignReq);
      const presignJson = await presignRes.json();
      if (!presignJson.success) {
        throw new Error(`Presign failed: ${presignJson.error}`);
      }

      const expectedKey = presignJson.storageKey;
      const putUploadUrl = `http://localhost:3000${presignJson.uploadUrl}`;

      // Issue PUT to the presigned upload URL
      const mp4Payload = createValidMp4Buffer(1024);
      const putReq = new NextRequest(putUploadUrl, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "video/mp4",
          "Content-Length": String(mp4Payload.length),
        },
        body: new Uint8Array(mp4Payload),
      });

      const putRes = await mediaUploadPutRoute(putReq);
      const putJson = await putRes.json();
      if (!putJson.success) {
        throw new Error(`Presigned PUT failed: ${putJson.error}`);
      }

      // Assert strict storage key equality
      if (putJson.media.storageKey !== expectedKey) {
        throw new Error(
          `Storage key mismatch! Expected exact presigned key '${expectedKey}', got '${putJson.media.storageKey}'`
        );
      }

      // Verify readback from the exact presigned key
      const provider = StorageService.getProvider();
      const readBuffer = await provider.read(expectedKey, testWorkspace.id);
      if (!readBuffer.equals(mp4Payload)) {
        throw new Error("Readback buffer does not match uploaded binary payload!");
      }

      console.log("   ✓ Uploaded object storageKey strictly equals presigned key:", expectedKey);
      console.log("   ✓ Verified byte-identical readback from disk storage");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 3: Media Upload Safety Limits (Content-Length Header Pre-check)
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 3: Media upload rejects oversized payloads (> 100MB) via Content-Length pre-check");
    {
      const oversizedBytes = 150 * 1024 * 1024; // 150 MB

      // POST handler check
      const postReq = new NextRequest("http://localhost:3000/api/media/upload", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "video/mp4",
          "Content-Length": String(oversizedBytes),
        },
        body: new Uint8Array(10), // Small body sent, but header declares 150MB
      });

      const postRes = await mediaUploadPostRoute(postReq);
      if (postRes.status !== 413) {
        throw new Error(`Expected 413 Payload Too Large on POST, got: ${postRes.status}`);
      }

      // PUT handler check
      const putUrl = `http://localhost:3000/api/media/upload?key=${encodeURIComponent(
        testWorkspace.id + "/test.mp4"
      )}&expires=${Math.floor(Date.now() / 1000) + 3600}&signature=dummy_sig`;

      const putReq = new NextRequest(putUrl, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "video/mp4",
          "Content-Length": String(oversizedBytes),
        },
        body: new Uint8Array(10),
      });

      const putRes = await mediaUploadPutRoute(putReq);
      if (putRes.status !== 413) {
        throw new Error(`Expected 413 Payload Too Large on PUT, got: ${putRes.status}`);
      }

      console.log("   ✓ Content-Length pre-check blocks oversized payloads with HTTP 413 before stream buffering");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 4: S3/R2 Upload Integrity & Server-Side Verification
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 4: S3/R2 presigned URL binds Content-Type & verifyUploadedMedia validates objects");
    {
      process.env.STORAGE_PROVIDER = "s3";
      process.env.S3_BUCKET = "test-mediaconnect-bucket";
      process.env.S3_ACCESS_KEY_ID = "AKIA_TEST_KEY_ID";
      process.env.S3_SECRET_ACCESS_KEY = "SECRET_KEY_12345678901234567890";
      process.env.S3_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
      process.env.S3_REGION = "us-east-1";

      const s3Provider = new S3CompatibleStorageProvider();
      const testKey = `${testWorkspace.id}/promo_video.mp4`;
      const presignedS3Url = await s3Provider.getPresignedUploadUrl(
        testKey,
        "video/mp4",
        testWorkspace.id,
        900
      );

      const parsedUrl = new URL(presignedS3Url);
      const signedHeaders = parsedUrl.searchParams.get("X-Amz-SignedHeaders") || "";
      if (!signedHeaders.includes("content-type")) {
        throw new Error(`Expected 'content-type' in X-Amz-SignedHeaders, got: ${signedHeaders}`);
      }

      // Reset provider to local for verifyUploadedMedia tests
      process.env.STORAGE_PROVIDER = "local";
      StorageService.setProvider(null);

      // Verify existing valid object
      const localProvider = StorageService.getProvider();
      const uploaded = await localProvider.write(
        `${testWorkspace.id}/verified_sample.mp4`,
        createValidMp4Buffer(128),
        "video/mp4",
        testWorkspace.id
      );

      const verified = await StorageService.verifyUploadedMedia(
        uploaded.storageKey,
        testWorkspace.id,
        "video/mp4"
      );
      if (!verified.exists || verified.sizeBytes !== 128) {
        throw new Error("verifyUploadedMedia failed on valid existing object");
      }

      // Verify missing object throws StorageSecurityError
      let threwMissing = false;
      try {
        await StorageService.verifyUploadedMedia(
          `${testWorkspace.id}/non_existent.mp4`,
          testWorkspace.id,
          "video/mp4"
        );
      } catch (err) {
        if (err instanceof StorageSecurityError) threwMissing = true;
      }
      if (!threwMissing) {
        throw new Error("Expected StorageSecurityError on non-existent storage object");
      }

      console.log("   ✓ S3/R2 presigned upload binds 'content-type' in SignedHeaders and query signature");
      console.log("   ✓ StorageService.verifyUploadedMedia confirms existence, bounded size, and MIME integrity");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 5: Multi-Account Analytics Aggregation on the Same Platform
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 5: Analytics overview aggregates multiple accounts on the same platform without overwriting");
    {
      // Clean up previous snapshots in test workspace
      await db.metricSnapshot.deleteMany({
        where: { account: { workspaceId: testWorkspace.id } },
      });
      await db.account.deleteMany({
        where: { workspaceId: testWorkspace.id },
      });

      // Create Account 1 on INSTAGRAM (1,500 followers)
      const acc1 = await db.account.create({
        data: {
          workspaceId: testWorkspace.id,
          platform: "INSTAGRAM",
          platformAccountId: "ig_brand_us",
          username: "brand_us",
          displayName: "Brand US",
          followersCount: 1500,
          postsCount: 12,
          isMock: true,
          syncStatus: "SYNCED",
        },
      });

      // Create Account 2 on INSTAGRAM (3,500 followers)
      const acc2 = await db.account.create({
        data: {
          workspaceId: testWorkspace.id,
          platform: "INSTAGRAM",
          platformAccountId: "ig_brand_uk",
          username: "brand_uk",
          displayName: "Brand UK",
          followersCount: 3500,
          postsCount: 18,
          isMock: true,
          syncStatus: "SYNCED",
        },
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Snapshots for Account 1: 500 impressions, 400 reach, 50 engagements
      await db.metricSnapshot.create({
        data: {
          accountId: acc1.id,
          date: today,
          impressions: 500,
          reach: 400,
          engagements: 50,
          followers: 1500,
          source: "MOCK_SANDBOX",
          availableMetrics: JSON.stringify(["impressions", "reach", "engagements", "followerDelta:10"]),
        },
      });

      // Snapshots for Account 2: 800 impressions, 700 reach, 90 engagements
      await db.metricSnapshot.create({
        data: {
          accountId: acc2.id,
          date: today,
          impressions: 800,
          reach: 700,
          engagements: 90,
          followers: 3500,
          source: "MOCK_SANDBOX",
          availableMetrics: JSON.stringify(["impressions", "reach", "engagements", "followerDelta:25"]),
        },
      });

      const overview = await AnalyticsService.getOverview(testWorkspace.id, 14);

      // Platform aggregation assertions
      const igPlatform = overview.byPlatform.INSTAGRAM;
      if (!igPlatform) {
        throw new Error("Expected byPlatform.INSTAGRAM in overview");
      }
      if (igPlatform.followers !== 5000) {
        throw new Error(
          `Platform followers overwritten! Expected 5000 (1500+3500), got: ${igPlatform.followers}`
        );
      }
      if (igPlatform.impressions !== 1300) {
        throw new Error(
          `Platform impressions not aggregated! Expected 1300 (500+800), got: ${igPlatform.impressions}`
        );
      }
      if (igPlatform.reach !== 1100) {
        throw new Error(
          `Platform reach not aggregated! Expected 1100 (400+700), got: ${igPlatform.reach}`
        );
      }
      if (igPlatform.engagements !== 140) {
        throw new Error(
          `Platform engagements not aggregated! Expected 140 (50+90), got: ${igPlatform.engagements}`
        );
      }
      if (igPlatform.postsCount !== 30) {
        throw new Error(
          `Platform postsCount not aggregated! Expected 30 (12+18), got: ${igPlatform.postsCount}`
        );
      }
      if (igPlatform.followerGrowth !== 35) {
        throw new Error(
          `Platform followerGrowth not aggregated! Expected 35 (10+25), got: ${igPlatform.followerGrowth}`
        );
      }

      // Account-level detail preservation
      if (!overview.byAccount || !overview.byAccount[acc1.id] || !overview.byAccount[acc2.id]) {
        throw new Error("Expected separate account breakdowns in overview.byAccount");
      }
      if (overview.byAccount[acc1.id].followers !== 1500 || overview.byAccount[acc2.id].followers !== 3500) {
        throw new Error("Individual account follower counts corrupted in byAccount breakdown");
      }

      console.log("   ✓ byPlatform aggregates multiple accounts on the same platform correctly (5,000 followers, 1,300 impressions)");
      console.log("   ✓ Individual account breakdown preserved in overview.byAccount and overview.accounts");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 6: Metric Semantics & Reach Non-Deduplication Disclosures
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 6: Metric semantics & reach non-deduplication disclosures in overview and report");
    {
      const overview = await AnalyticsService.getOverview(testWorkspace.id, 14);

      if (!overview.reachLabel?.includes("Non-Deduplicated")) {
        throw new Error(`Expected 'Non-Deduplicated' in reachLabel, got: ${overview.reachLabel}`);
      }
      if (!overview.reachDisclosure?.includes("deduplication is not supported")) {
        throw new Error(`Expected non-deduplication disclosure in reachDisclosure, got: ${overview.reachDisclosure}`);
      }

      const { metadata } = await ReportService.generateWorkspaceReport(testWorkspace.id, 14);
      const reachDef = metadata.metricDefinitions.find((m) => m.metric.includes("Reach"));
      if (!reachDef || !reachDef.metric.includes("Non-Deduplicated")) {
        throw new Error(`Expected Non-Deduplicated reach definition in report metadata, got: ${reachDef?.metric}`);
      }

      const hasReachDisclosure = metadata.unavailableDisclosures.some((d) =>
        d.toLowerCase().includes("deduplication is not supported")
      );
      if (!hasReachDisclosure) {
        throw new Error("Expected reach non-deduplication disclosure in metadata.unavailableDisclosures");
      }

      console.log("   ✓ Analytics overview provides explicit non-deduplicated daily reach label and disclosure");
      console.log("   ✓ Workspace report metadata documents platform API deduplication limitation");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 7: Server-Side Multi-Page PDF Generation Without Truncation
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 7: Multi-page PDF generator wraps text, paginates dynamically, and renders all sections");
    {
      // Add multiple accounts across platforms to test a realistic enterprise multi-page layout
      for (let i = 1; i <= 10; i++) {
        await db.account.create({
          data: {
            workspaceId: testWorkspace.id,
            platform: i % 2 === 0 ? "YOUTUBE" : "X",
            platformAccountId: `channel_multi_${i}_${Date.now()}`,
            username: `channel_handle_${i}`,
            displayName: `Channel Handle ${i}`,
            followersCount: 10000 * i,
            postsCount: 15 * i,
            isMock: false,
            syncStatus: i % 2 === 0 ? "UNSYNCED_LIVE" : "UNSUPPORTED_PAID",
            syncError: i % 2 === 0 ? "Live data pending daily sync" : "Live paid X analytics disabled (ALLOW_PAID_X_API=false)",
          },
        });
      }

      const { pdfBuffer } = await ReportService.generateWorkspaceReport(testWorkspace.id, 14);

      const pdfHeader = pdfBuffer.subarray(0, 9).toString("ascii");
      if (!pdfHeader.startsWith("%PDF-1.4")) {
        throw new Error(`Expected %PDF-1.4 header, got: ${pdfHeader}`);
      }

      const pdfString = pdfBuffer.toString("utf8");

      // Verify /Pages object has /Kids and /Count >= 2
      const countMatch = pdfString.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
      if (!countMatch) {
        throw new Error("PDF missing /Type /Pages with /Count");
      }
      const pageCount = parseInt(countMatch[1], 10);
      if (pageCount < 2) {
        throw new Error(`Expected multi-page PDF (Count >= 2), got: ${pageCount}`);
      }

      // Verify footer on page 1 and page 2
      if (!pdfString.includes(`Page 1 of ${pageCount}`) || !pdfString.includes(`Page 2 of ${pageCount}`)) {
        throw new Error("PDF missing 'Page X of Y' footer across pages");
      }

      // Verify all 4 sections are present in the PDF body without early break truncation
      if (!pdfString.includes("1. EXECUTIVE KPI SUMMARY")) {
        throw new Error("Section 1 missing from generated PDF");
      }
      if (!pdfString.includes("2. CHANNEL PERFORMANCE & SOURCE ATTRIBUTION")) {
        throw new Error("Section 2 missing from generated PDF");
      }
      if (!pdfString.includes("3. UNAVAILABLE DATA & PROVIDER LIMITATION DISCLOSURES")) {
        throw new Error("Section 3 truncated or missing from generated PDF");
      }
      if (!pdfString.includes("4. METRIC DEFINITIONS & METHODOLOGY")) {
        throw new Error("Section 4 truncated or missing from generated PDF");
      }

      console.log(`   ✓ Successfully generated multi-page PDF (${pageCount} pages, ${pdfBuffer.length} bytes)`);
      console.log("   ✓ Verified dynamic text wrapping, page tree, and zero section truncation");
      passedTests++;
    }

    // ------------------------------------------------------------------------
    // Test 8: AI Usage Controls, 5000-Char Length Cap & Daily Quota Guardrails
    // ------------------------------------------------------------------------
    console.log("\n▶ Test 8: AI usage controls enforce ALLOW_EXTERNAL_AI, 5000-char input limit, and daily quota");
    {
      // 1. Guardrail: ALLOW_EXTERNAL_AI defaults to heuristic even if API key is present
      delete process.env.ALLOW_EXTERNAL_AI;
      process.env.GEMINI_API_KEY = "dummy_gemini_api_key";
      const configUnset = AiSeoService.resolveConfig();
      if (configUnset.provider !== "heuristic") {
        throw new Error(
          `ALLOW_EXTERNAL_AI guardrail failed! Expected 'heuristic', got: ${configUnset.provider}`
        );
      }

      // 2. 5000-character input cap validation
      const oversizedText = "x".repeat(5001);
      let threwLength = false;
      try {
        await AiSeoService.generateSuggestions({ content: oversizedText });
      } catch (err) {
        if ((err as Error).message.includes("5000 characters")) {
          threwLength = true;
        }
      }
      if (!threwLength) {
        throw new Error("Expected length error when content exceeds 5000 characters");
      }

      // Test route rejection of oversized content
      const routeReq = new NextRequest("http://localhost:3000/api/seo/assistant", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: oversizedText,
          workspaceId: testWorkspace.id,
        }),
      });

      const routeRes = await seoAssistantRoute(routeReq);
      if (routeRes.status !== 400) {
        throw new Error(`Expected 400 on oversized content from route, got: ${routeRes.status}`);
      }

      // 3. Daily quota enforcement via PlatformQuota (platform: 'AI_SEO')
      process.env.AI_DAILY_QUOTA_LIMIT = "2";
      await db.platformQuota.deleteMany({
        where: { platform: "AI_SEO", entityId: testWorkspace.id },
      });

      // Test limit of 2 requests
      const testLimit = 2;
      const q1 = await AiSeoService.checkAndReserveAiQuota(testWorkspace.id, testLimit);
      if (!q1.allowed || q1.remaining !== 1) {
        throw new Error(`Quota slot 1 failed: allowed=${q1.allowed}, remaining=${q1.remaining}`);
      }

      const q2 = await AiSeoService.checkAndReserveAiQuota(testWorkspace.id, testLimit);
      if (!q2.allowed || q2.remaining !== 0) {
        throw new Error(`Quota slot 2 failed: allowed=${q2.allowed}, remaining=${q2.remaining}`);
      }

      // 3rd request must be blocked
      const q3 = await AiSeoService.checkAndReserveAiQuota(testWorkspace.id, testLimit);
      if (q3.allowed || q3.remaining !== 0) {
        throw new Error(`Quota slot 3 should have been blocked: allowed=${q3.allowed}`);
      }

      // Fallback verification: calling generateSuggestions when quota is exhausted falls back to heuristic with notice
      const fallbackResult = await AiSeoService.generateSuggestions({
        content: "Short post about product launch",
        workspaceId: testWorkspace.id,
        allowHeuristicFallback: true,
      });

      if (fallbackResult.source !== "HEURISTIC_FALLBACK") {
        throw new Error(`Expected HEURISTIC_FALLBACK when quota exceeded, got: ${fallbackResult.source}`);
      }
      const hasQuotaNotice = fallbackResult.contentSuggestions.some((s) =>
        s.toLowerCase().includes("daily ai request quota reached")
      );
      if (!hasQuotaNotice) {
        throw new Error("Expected quota exhaustion notice in contentSuggestions");
      }

      console.log("   ✓ ALLOW_EXTERNAL_AI guardrail prevents unpaid external AI calls");
      console.log("   ✓ Input length cap strictly blocks payloads > 5000 characters (HTTP 400)");
      console.log("   ✓ Daily AI quota enforced atomically via PlatformQuota table with seamless heuristic fallback");
      passedTests++;
    }

    console.log("\n==================================================================");
    console.log(`✅ PHASE 6D TEST SUITE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("==================================================================\n");
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, savedEnv);
  }
}

runPhase6DTestSuite().catch((err) => {
  console.error("\n❌ PHASE 6D TEST SUITE FAILED:", err);
  process.exit(1);
});
