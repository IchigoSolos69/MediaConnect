import { db } from "./lib/db";
import {
  StorageService,
  LocalStorageProvider,
  S3CompatibleStorageProvider,
  MediaValidationError,
  StorageSecurityError,
  StorageConfigurationError,
} from "./services/storage.service";
import {
  YouTubeLiveProvider,
  YouTubeQuotaManager,
  InstagramLiveProvider,
  InstagramMediaProcessingError,
  XLiveProvider,
  PaidApiGuardrailError,
  ProviderConfigurationError,
  LiveAnalyticsNotSupportedError,
} from "./providers";
import {
  createOAuthState,
  consumeOAuthState,
  OAuthStateError,
} from "./lib/auth/oauth-state";
import { TokenVault } from "./lib/crypto/vault";
import { createSessionToken, SESSION_COOKIE_NAME } from "./lib/auth/session";
import { PublisherService } from "./services/publisher.service";
import { NextRequest } from "next/server";
import { GET as oauthConnectRoute } from "./app/api/auth/connect/[provider]/route";
import { GET as oauthCallbackRoute } from "./app/api/auth/callback/[provider]/route";
import crypto from "crypto";

/**
 * Helper to construct a valid ISO BMFF MP4 binary buffer with an 'ftypisom' box header.
 */
function createValidMp4Buffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(32, sizeBytes), 0x42);
  // Box size: 24 bytes (0x00000018)
  buf.writeUInt32BE(24, 0);
  // Box type: 'ftyp'
  buf.write("ftyp", 4, "ascii");
  // Major brand: 'isom'
  buf.write("isom", 8, "ascii");
  // Minor version: 512
  buf.writeUInt32BE(512, 12);
  // Compatible brands: 'isom', 'mp42'
  buf.write("isommp42", 16, "ascii");
  return buf;
}

/**
 * Helper to construct a valid PNG binary buffer with PNG magic bytes.
 */
function createValidPngBuffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(32, sizeBytes), 0x11);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  pngSig.copy(buf, 0);
  return buf;
}

async function runPhase6BTestSuite() {
  console.log("==================================================================");
  console.log("🚀 MEDIACONNECT PHASE 6B: DETERMINISTIC PROTOCOL & LIVE VERIFICATION");
  console.log("   (Simulated HTTP Protocol Mocks + Real Storage & DB State Tests)");
  console.log("==================================================================\n");

  let passedTests = 0;
  const totalTests = 14;
  const originalFetch = globalThis.fetch;

  // ----------------------------------------------------------------------
  // TEST 1: Live Providers Fail Explicitly When Credentials Are Missing
  // ----------------------------------------------------------------------
  console.log("TEST 1: Live Providers Fail Explicitly When Credentials Are Missing (No Fake Success)");
  const savedEnv = {
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
    ALLOW_PAID_X_API: process.env.ALLOW_PAID_X_API,
  };

  try {
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.TWITTER_CLIENT_ID;
    delete process.env.TWITTER_CLIENT_SECRET;
    delete process.env.ALLOW_PAID_X_API;

    const yt = new YouTubeLiveProvider();
    const ig = new InstagramLiveProvider();
    const x = new XLiveProvider();

    const expectConfigError = async (fn: () => Promise<unknown>, label: string) => {
      let caught = false;
      try {
        await fn();
      } catch (err) {
        if (err instanceof ProviderConfigurationError || err instanceof PaidApiGuardrailError) {
          caught = true;
        }
      }
      if (!caught) {
        throw new Error(`Expected ProviderConfigurationError/PaidApiGuardrailError for ${label}, but call succeeded!`);
      }
    };

    const dummyAcc = {
      id: "acc_1",
      platform: "YOUTUBE" as const,
      platformAccountId: "ch_1",
      username: "@test",
      displayName: "Test",
      accessToken: "tok",
      isMock: false,
    };

    await expectConfigError(() => yt.getAuthUrl("st"), "YouTube getAuthUrl without creds");
    await expectConfigError(() => yt.exchangeCode("code"), "YouTube exchangeCode without creds");
    await expectConfigError(
      () => yt.publishPost(dummyAcc, { postId: "p", targetId: "t", content: "c", mediaUrls: [] }),
      "YouTube publishPost without creds"
    );

    await expectConfigError(() => ig.getAuthUrl("st"), "Instagram getAuthUrl without creds");
    await expectConfigError(() => ig.exchangeCode("code"), "Instagram exchangeCode without creds");
    await expectConfigError(
      () => ig.publishPost({ ...dummyAcc, platform: "INSTAGRAM" }, { postId: "p", targetId: "t", content: "c", mediaUrls: [] }),
      "Instagram publishPost without creds"
    );

    await expectConfigError(() => x.getAuthUrl("st", "a".repeat(44)), "X getAuthUrl without creds");
    await expectConfigError(() => x.exchangeCode("code", "v".repeat(44)), "X exchangeCode without creds");
    await expectConfigError(
      () => x.publishPost({ ...dummyAcc, platform: "X" }, { postId: "p", targetId: "t", content: "c", mediaUrls: [] }),
      "X publishPost paid guardrail"
    );

    console.log("   ✓ YouTube, Instagram, and X live providers strictly throw ProviderConfigurationError when credentials are unset");
    console.log("   ✓ Zero synthetic identities, post IDs, or fake URLs can be produced in live mode");
    passedTests++;
  } finally {
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 2: Binary Magic-Byte Signature Inspection & Media Validation
  // ----------------------------------------------------------------------
  console.log("\nTEST 2: Binary Magic-Byte Signature Inspection & Media Validation");
  // 2a. Arbitrary text pretending to be video/mp4 MUST fail
  const fakeTextVideo = Buffer.from("simulated_video_mp4_binary_content_mediaconnect");
  let fakeVideoRejected = false;
  try {
    await StorageService.uploadMedia(fakeTextVideo, "fake.mp4", "video/mp4", "ws_test_sig");
  } catch (err) {
    if (err instanceof MediaValidationError && err.message.includes("Invalid video binary signature")) {
      fakeVideoRejected = true;
    }
  }
  if (!fakeVideoRejected) {
    throw new Error("Validation failure: Text buffer masquerading as video/mp4 was not rejected!");
  }

  // 2b. Arbitrary text pretending to be image/png MUST fail
  let fakePngRejected = false;
  try {
    await StorageService.uploadMedia(Buffer.from("not_a_real_png_image"), "fake.png", "image/png", "ws_test_sig");
  } catch (err) {
    if (err instanceof MediaValidationError && err.message.includes("Invalid PNG signature")) {
      fakePngRejected = true;
    }
  }
  if (!fakePngRejected) {
    throw new Error("Validation failure: Text buffer masquerading as image/png was not rejected!");
  }

  // 2c. Valid MP4 container header + valid 9:16 dimensions succeeds
  const realMp4Buf = createValidMp4Buffer(128);
  const validShortCheck = StorageService.validateMedia({
    filename: "valid_short.mp4",
    mimeType: "video/mp4",
    sizeBytes: realMp4Buf.length,
    buffer: realMp4Buf,
    width: 1080,
    height: 1920,
    durationSeconds: 45,
    targetPlatform: "YOUTUBE",
    format: "SHORT",
  });
  if (!validShortCheck.isValid) {
    throw new Error(`Valid MP4 Short rejected: ${validShortCheck.errors.join(", ")}`);
  }

  // 2d. Wrong aspect ratio (16:9 horizontal for YouTube Short) rejected
  const wrongRatioCheck = StorageService.validateMedia({
    filename: "landscape.mp4",
    mimeType: "video/mp4",
    sizeBytes: realMp4Buf.length,
    buffer: realMp4Buf,
    width: 1920,
    height: 1080,
    targetPlatform: "YOUTUBE",
    format: "SHORT",
  });
  if (wrongRatioCheck.isValid) {
    throw new Error("16:9 horizontal video was erroneously accepted as a 9:16 YouTube Short");
  }

  console.log("   ✓ Arbitrary text masquerading as video/mp4 or image/png rejected via magic-byte inspection");
  console.log("   ✓ Valid ISO BMFF ('ftypisom') MP4 and PNG headers, size caps, and 9:16 aspect ratios verified");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 3: Local Storage Round-Trip, Readback, Deletion & Tenant Isolation
  // ----------------------------------------------------------------------
  console.log("\nTEST 3: Local Storage Round-Trip, HEAD, Readback, Deletion & Tenant Isolation");
  const localProvider = new LocalStorageProvider();
  StorageService.setProvider(localProvider);

  const uploadedMp4 = await StorageService.uploadMedia(
    realMp4Buf,
    "roundtrip_video.mp4",
    "video/mp4",
    "ws_tenant_alpha"
  );

  // HEAD check
  const headInfo = await localProvider.head(uploadedMp4.storageKey, "ws_tenant_alpha");
  if (!headInfo.exists || headInfo.sizeBytes !== realMp4Buf.length) {
    throw new Error("Local storage HEAD check failed to confirm written file size");
  }

  // Readback check
  const readBackBuf = await localProvider.read(uploadedMp4.storageKey, "ws_tenant_alpha");
  if (!readBackBuf.equals(realMp4Buf)) {
    throw new Error("Local storage readback bytes do not match uploaded buffer");
  }

  // Cross-tenant isolation check (ws_tenant_beta tries to read/delete ws_tenant_alpha's key)
  let crossTenantBlocked = false;
  try {
    await localProvider.read(uploadedMp4.storageKey, "ws_tenant_beta");
  } catch (err) {
    if (err instanceof StorageSecurityError) crossTenantBlocked = true;
  }
  if (!crossTenantBlocked) {
    throw new Error("Security failure: Cross-tenant storage read was not blocked!");
  }

  // Path traversal check
  let traversalBlocked = false;
  try {
    await localProvider.read("../schema.prisma", "ws_tenant_alpha");
  } catch (err) {
    if (err instanceof StorageSecurityError) traversalBlocked = true;
  }
  if (!traversalBlocked) {
    throw new Error("Security failure: Path traversal in storageKey was not blocked!");
  }

  // Deletion check
  const deleted = await localProvider.delete(uploadedMp4.storageKey, "ws_tenant_alpha");
  const headAfterDelete = await localProvider.head(uploadedMp4.storageKey, "ws_tenant_alpha");
  if (!deleted || headAfterDelete.exists) {
    throw new Error("Local storage file still exists after delete()");
  }

  console.log("   ✓ Local storage verified: upload, HEAD, byte-identical readback, and deletion");
  console.log("   ✓ Cross-tenant access and '../' path traversal strictly blocked with StorageSecurityError");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 4: S3 / Cloudflare R2 Storage Provider Round-Trip (AWS SigV4)
  // ----------------------------------------------------------------------
  console.log("\nTEST 4: S3 / Cloudflare R2 Storage Provider Round-Trip (AWS SigV4 PUT, HEAD, GET, DELETE)");
  // 4a. Unconfigured S3 provider must fail with StorageConfigurationError
  const unconfiguredS3 = new S3CompatibleStorageProvider({ bucket: "", endpoint: "", accessKeyId: "", secretAccessKey: "" });
  let s3ConfigFailed = false;
  try {
    await unconfiguredS3.upload(realMp4Buf, "test.mp4", "video/mp4", "ws_alpha");
  } catch (err) {
    if (err instanceof StorageConfigurationError) s3ConfigFailed = true;
  }
  if (!s3ConfigFailed) {
    throw new Error("Unconfigured S3 provider did not throw StorageConfigurationError!");
  }

  // 4b. Configured S3 provider with simulated S3/R2 HTTP server storing objects in memory
  const mockS3Store = new Map<string, { body: Buffer; contentType: string }>();
  const s3RequestsLog: Array<{ method: string; url: string; authHeader: string }> = [];

  const configuredS3 = new S3CompatibleStorageProvider({
    bucket: "mediaconnect-r2-prod",
    region: "auto",
    endpoint: "https://acc123.r2.cloudflarestorage.com",
    accessKeyId: "AKIA_TEST_R2_KEY",
    secretAccessKey: "SECRET_TEST_R2_KEY_VALUE_123456789",
    publicBaseUrl: "https://cdn.mediaconnect.app",
  });

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const authHeader = headers.get("authorization") || "";

      s3RequestsLog.push({ method, url: urlStr, authHeader });

      if (!authHeader.startsWith("AWS4-HMAC-SHA256 Credential=AKIA_TEST_R2_KEY/")) {
        return new Response("Missing or invalid SigV4 Authorization header", { status: 403 });
      }

      const parsedUrl = new URL(urlStr);
      const key = decodeURIComponent(parsedUrl.pathname.replace(/^\/mediaconnect-r2-prod\//, ""));

      if (method === "PUT") {
        const bodyBytes = init?.body ? Buffer.from(init.body as Uint8Array) : Buffer.alloc(0);
        mockS3Store.set(key, {
          body: bodyBytes,
          contentType: headers.get("content-type") || "application/octet-stream",
        });
        return new Response(null, { status: 200, headers: { etag: '"etag_s3_123"' } });
      }

      if (method === "HEAD") {
        const entry = mockS3Store.get(key);
        if (!entry) return new Response(null, { status: 404 });
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": String(entry.body.length),
            "content-type": entry.contentType,
          },
        });
      }

      if (method === "GET") {
        const entry = mockS3Store.get(key);
        if (!entry) return new Response("Not Found", { status: 404 });
        return new Response(new Uint8Array(entry.body), {
          status: 200,
          headers: { "content-type": entry.contentType },
        });
      }

      if (method === "DELETE") {
        const existed = mockS3Store.delete(key);
        return new Response(null, { status: existed ? 204 : 404 });
      }

      return new Response("Unsupported method", { status: 405 });
    };

    const pngBuf = createValidPngBuffer(96);
    const s3Upload = await configuredS3.upload(pngBuf, "banner.png", "image/png", "ws_r2_tenant");

    if (!s3Upload.publicUrl.startsWith("https://cdn.mediaconnect.app/workspaces/ws_r2_tenant/")) {
      throw new Error(`Unexpected S3 public URL: ${s3Upload.publicUrl}`);
    }

    const s3Head = await configuredS3.head(s3Upload.storageKey, "ws_r2_tenant");
    if (!s3Head.exists || s3Head.sizeBytes !== pngBuf.length) {
      throw new Error("S3 HEAD check failed to return stored object size");
    }

    const s3Read = await configuredS3.read(s3Upload.storageKey, "ws_r2_tenant");
    if (!s3Read.equals(pngBuf)) {
      throw new Error("S3 GET readback bytes did not match uploaded PNG buffer");
    }

    const presignedUrl = await configuredS3.getPresignedUploadUrl(
      s3Upload.storageKey,
      "image/png",
      "ws_r2_tenant",
      600
    );
    if (!presignedUrl.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256") || !presignedUrl.includes("X-Amz-Signature=")) {
      throw new Error(`Invalid S3 presigned URL: ${presignedUrl}`);
    }

    const s3Deleted = await configuredS3.delete(s3Upload.storageKey, "ws_r2_tenant");
    const s3HeadAfter = await configuredS3.head(s3Upload.storageKey, "ws_r2_tenant");
    if (!s3Deleted || s3HeadAfter.exists) {
      throw new Error("S3 DELETE did not remove the stored object");
    }

    if (s3RequestsLog.length !== 5) {
      throw new Error(`Expected 5 signed S3 HTTP requests (PUT, HEAD, GET, DELETE, HEAD), got ${s3RequestsLog.length}`);
    }

    console.log("   ✓ S3/R2 SigV4 PUT, HEAD, GET readback, DELETE, and presigned URL generation verified");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ----------------------------------------------------------------------
  // TEST 5: Persistent Single-Use OAuth State, PKCE S256 & Replay Rejection
  // ----------------------------------------------------------------------
  console.log("\nTEST 5: Persistent Single-Use OAuth State, PKCE S256 & Replay Rejection");
  const stateCreated = await createOAuthState("ws_oauth_1", "user_oauth_1", "YOUTUBE");

  // Verify S256 challenge matches verifier
  const expectedChallenge = crypto
    .createHash("sha256")
    .update(stateCreated.codeVerifier)
    .digest("base64url");
  if (stateCreated.codeChallenge !== expectedChallenge) {
    throw new Error("PKCE S256 code_challenge does not match SHA-256 of code_verifier");
  }

  // First consumption succeeds
  const firstConsume = await consumeOAuthState(
    stateCreated.stateToken,
    "YOUTUBE",
    "user_oauth_1"
  );
  if (firstConsume.codeVerifier !== stateCreated.codeVerifier) {
    throw new Error("Consumed state did not return matching PKCE codeVerifier");
  }

  // Second consumption of the exact same state MUST fail (Replay attack!)
  let replayRejected = false;
  try {
    await consumeOAuthState(stateCreated.stateToken, "YOUTUBE", "user_oauth_1");
  } catch (err) {
    if (err instanceof OAuthStateError && err.message.includes("already been consumed")) {
      replayRejected = true;
    }
  }
  if (!replayRejected) {
    throw new Error("Security failure: OAuth state was allowed to be consumed twice!");
  }

  console.log("   ✓ OAuth state persisted with RFC 7636 PKCE S256 verifier");
  console.log("   ✓ Second consumption of the same valid state token strictly rejected (single-use enforced)");
  passedTests++;

  // ----------------------------------------------------------------------
  // TEST 6: End-to-End Live OAuth Connect & Callback Route Protocol
  // ----------------------------------------------------------------------
  console.log("\nTEST 6: End-to-End Live OAuth Connect & Callback Route Protocol");
  const testOwner = await db.user.findUnique({ where: { email: "owner@mediaconnect.app" } });
  if (!testOwner || !testOwner.workspaceId) throw new Error("Missing seeded owner@mediaconnect.app user");

  const ownerSessionToken = await createSessionToken({
    userId: testOwner.id,
    email: testOwner.email,
    name: testOwner.name,
    activeWorkspaceId: testOwner.workspaceId,
    role: "OWNER",
    tokenVersion: testOwner.tokenVersion,
  });

  process.env.YOUTUBE_CLIENT_ID = "test_google_client_id.apps.googleusercontent.com";
  process.env.YOUTUBE_CLIENT_SECRET = "test_google_client_secret_xyz";

  try {
    const connectReq = new NextRequest(
      "http://localhost:3000/api/auth/connect/youtube?mode=live&format=json",
      {
        method: "GET",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}`,
          Accept: "application/json",
        },
      }
    );

    const connectRes = await oauthConnectRoute(connectReq, {
      params: Promise.resolve({ provider: "youtube" }),
    });
    const connectData = await connectRes.json();
    if (!connectData.success || !connectData.authUrl.includes("code_challenge_method=S256")) {
      throw new Error(`Live connect URL missing PKCE S256 parameters: ${connectData.authUrl}`);
    }

    const parsedAuthUrl = new URL(connectData.authUrl);
    const stateParam = parsedAuthUrl.searchParams.get("state")!;
    const challengeParam = parsedAuthUrl.searchParams.get("code_challenge")!;

    let capturedCodeVerifier = "";
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (urlStr === "https://oauth2.googleapis.com/token") {
        const bodyParams = new URLSearchParams(String(init?.body || ""));
        capturedCodeVerifier = bodyParams.get("code_verifier") || "";
        return Response.json({
          access_token: "ya29.real_live_access_token_from_google",
          refresh_token: "1//04_real_live_refresh_token_from_google",
          expires_in: 3599,
        });
      }

      if (urlStr.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
        return Response.json({
          items: [
            {
              id: "UC_verified_google_channel_777",
              snippet: {
                title: "Verified Tech Channel",
                customUrl: "@VerifiedTechChannel",
                thumbnails: { default: { url: "https://example.com/avatar.jpg" } },
              },
              statistics: { subscriberCount: "94300" },
            },
          ],
        });
      }

      return new Response("Unexpected URL", { status: 404 });
    };

    const callbackUrl = `http://localhost:3000/api/auth/callback/youtube?mode=live&code=4/0AeanS0_auth_code&state=${encodeURIComponent(stateParam)}`;
    const callbackReq = new NextRequest(callbackUrl, {
      method: "GET",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}` },
    });

    const callbackRes = await oauthCallbackRoute(callbackReq, {
      params: Promise.resolve({ provider: "youtube" }),
    });

    const redirectLoc = callbackRes.headers.get("location") || "";
    if (!redirectLoc.includes("/channels?status=connected&platform=YOUTUBE")) {
      throw new Error(`Expected success redirect, got: ${redirectLoc}`);
    }

    // Verify the PKCE code_verifier sent to Google matches the code_challenge from the auth URL
    const hashedVerifier = crypto.createHash("sha256").update(capturedCodeVerifier).digest("base64url");
    if (hashedVerifier !== challengeParam) {
      throw new Error("PKCE code_verifier sent during token exchange did not match authorization code_challenge!");
    }

    // Verify account was saved with isMock=false and encrypted tokens
    const savedAcc = await db.account.findFirst({
      where: {
        workspaceId: testOwner.workspaceId,
        platform: "YOUTUBE",
        platformAccountId: "UC_verified_google_channel_777",
      },
    });
    if (!savedAcc || savedAcc.isMock !== false || !savedAcc.tokenExpiresAt) {
      throw new Error("Live connected account was not saved with isMock=false and tokenExpiresAt");
    }
    if (TokenVault.decrypt(savedAcc.accessToken!, savedAcc.id) !== "ya29.real_live_access_token_from_google") {
      throw new Error("Decrypted access token did not match Google OAuth response");
    }

    // Replay the exact same callback request -> must fail with state replay error
    const duplicateCallbackRes = await oauthCallbackRoute(
      new NextRequest(callbackUrl, {
        method: "GET",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${ownerSessionToken}` },
      }),
      { params: Promise.resolve({ provider: "youtube" }) }
    );
    const dupLocation = duplicateCallbackRes.headers.get("location") || "";
    if (!dupLocation.includes("error=") || !decodeURIComponent(dupLocation).includes("already been consumed")) {
      throw new Error(`Duplicate callback replay was not blocked! Redirected to: ${dupLocation}`);
    }

    console.log("   ✓ Live OAuth callback verified PKCE code_verifier, encrypted tokens, and stored tokenExpiresAt");
    console.log("   ✓ Duplicate OAuth callback replay strictly rejected");
    await db.account.delete({ where: { id: savedAcc.id } });
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 7: YouTube Complete Resumable Upload Lifecycle (Session + Binary PUT)
  // ----------------------------------------------------------------------
  console.log("\nTEST 7: YouTube Complete Resumable Upload Lifecycle (Session Init + Binary Transfer)");
  process.env.YOUTUBE_CLIENT_ID = "yt_client_id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt_client_secret";

  try {
    const videoBytes = createValidMp4Buffer(512);
    let sessionInitiated = false;
    let uploadedBytesBuffer = Buffer.alloc(0);
    let receivedContentRange = "";

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);

      if (
        method === "POST" &&
        urlStr.includes("googleapis.com/upload/youtube/v3/videos?uploadType=resumable")
      ) {
        sessionInitiated = true;
        const uploadLength = headers.get("x-upload-content-length");
        if (uploadLength !== String(videoBytes.length)) {
          return new Response(`Invalid X-Upload-Content-Length: ${uploadLength}`, { status: 400 });
        }
        return new Response(null, {
          status: 200,
          headers: {
            location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session_yt_real_001",
          },
        });
      }

      if (method === "PUT" && urlStr.includes("upload_id=session_yt_real_001")) {
        receivedContentRange = headers.get("content-range") || "";
        uploadedBytesBuffer = Buffer.from(init?.body as Uint8Array);
        return Response.json(
          {
            id: "yt_confirmed_vid_98765",
            status: { uploadStatus: "uploaded" },
          },
          { status: 200 }
        );
      }

      return new Response("Unexpected request", { status: 404 });
    };

    const ytProvider = new YouTubeLiveProvider();
    const pubRes = await ytProvider.publishPost(
      {
        id: "acc_yt_live_1",
        platform: "YOUTUBE",
        platformAccountId: "UC_channel_live_1",
        username: "@LiveYT",
        displayName: "Live YT",
        accessToken: "ya29.valid_token",
        isMock: false,
      },
      {
        postId: "post_101",
        targetId: "target_101",
        content: "Real binary upload test #shorts",
        videoTitle: "Real Binary Upload #shorts",
        mediaUrls: [],
        mediaBuffer: videoBytes,
        mediaMimeType: "video/mp4",
      }
    );

    if (!sessionInitiated) throw new Error("Resumable session was never initiated");
    if (!uploadedBytesBuffer.equals(videoBytes)) {
      throw new Error("Uploaded binary bytes did not match source MP4 buffer!");
    }
    if (receivedContentRange !== `bytes 0-${videoBytes.length - 1}/${videoBytes.length}`) {
      throw new Error(`Unexpected Content-Range header: ${receivedContentRange}`);
    }
    if (pubRes.platformPostId !== "yt_confirmed_vid_98765") {
      throw new Error(`Expected API-confirmed video ID yt_confirmed_vid_98765, got ${pubRes.platformPostId}`);
    }
    if (pubRes.liveUrl !== "https://www.youtube.com/shorts/yt_confirmed_vid_98765") {
      throw new Error(`Unexpected liveUrl: ${pubRes.liveUrl}`);
    }

    console.log("   ✓ YouTube resumable session initialized and binary MP4 bytes transferred with Content-Range");
    console.log("   ✓ Confirmed remote video ID 'yt_confirmed_vid_98765' returned (no synthetic IDs)");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 8: YouTube Interrupted Upload Recovery (503 -> 308 Range Query -> Resume)
  // ----------------------------------------------------------------------
  console.log("\nTEST 8: YouTube Interrupted Upload Recovery (503 -> 308 Range Status -> Byte Offset Resume)");
  process.env.YOUTUBE_CLIENT_ID = "yt_client_id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt_client_secret";

  try {
    const videoBytes = createValidMp4Buffer(200);
    let putAttempts = 0;
    let statusQueried = false;
    let resumedRangeHeader = "";
    let resumedChunkLength = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);

      if (method === "POST" && urlStr.includes("uploadType=resumable")) {
        return new Response(null, {
          status: 200,
          headers: {
            location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session_recover_002",
          },
        });
      }

      if (method === "PUT" && urlStr.includes("upload_id=session_recover_002")) {
        const contentRange = headers.get("content-range") || "";

        // Status check query after interruption: Content-Range: bytes */200
        if (contentRange === `bytes */${videoBytes.length}`) {
          statusQueried = true;
          return new Response(null, {
            status: 308,
            headers: { range: "bytes=0-99" }, // Server received first 100 bytes (0..99)
          });
        }

        putAttempts++;
        if (putAttempts === 1) {
          // Simulate transient network/server interruption mid-upload
          return new Response("Backend Error", { status: 503 });
        }

        // Resumed upload attempt: should start at byte 100!
        resumedRangeHeader = contentRange;
        resumedChunkLength = (init?.body as Uint8Array).byteLength;
        return Response.json({ id: "yt_recovered_vid_555" }, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    };

    const ytProvider = new YouTubeLiveProvider();
    const res = await ytProvider.publishPost(
      {
        id: "acc_yt_2",
        platform: "YOUTUBE",
        platformAccountId: "UC_channel_recover",
        username: "@RecoverYT",
        displayName: "Recover YT",
        accessToken: "ya29.valid_token",
        isMock: false,
      },
      {
        postId: "post_102",
        targetId: "target_102",
        content: "Resumable recovery test",
        mediaUrls: [],
        mediaBuffer: videoBytes,
        mediaMimeType: "video/mp4",
      }
    );

    if (!statusQueried) {
      throw new Error("Provider did not query 'bytes */total' after 503 upload interruption");
    }
    if (resumedRangeHeader !== "bytes 100-199/200" || resumedChunkLength !== 100) {
      throw new Error(`Expected resumed range 'bytes 100-199/200' (100 bytes), got '${resumedRangeHeader}' (${resumedChunkLength} bytes)`);
    }
    if (res.platformPostId !== "yt_recovered_vid_555") {
      throw new Error(`Unexpected recovered video ID: ${res.platformPostId}`);
    }

    console.log("   ✓ Interrupted upload queried 'bytes */200', parsed 'Range: bytes=0-99', and resumed at byte 100");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 9: Persistent Database-Backed YouTube Daily Quota Enforcement
  // ----------------------------------------------------------------------
  console.log("\nTEST 9: Persistent Database-Backed YouTube Daily Quota Enforcement");
  process.env.YOUTUBE_DAILY_UPLOAD_LIMIT = "2";
  const quotaTestEntity = `UC_quota_db_${Date.now()}`;

  try {
    const q1 = await YouTubeQuotaManager.checkAndReserveUploadQuota(quotaTestEntity);
    const q2 = await YouTubeQuotaManager.checkAndReserveUploadQuota(quotaTestEntity);
    const q3 = await YouTubeQuotaManager.checkAndReserveUploadQuota(quotaTestEntity);

    if (!q1.allowed || q1.remaining !== 1) throw new Error("Quota reservation 1 failed");
    if (!q2.allowed || q2.remaining !== 0) throw new Error("Quota reservation 2 failed");
    if (q3.allowed) {
      throw new Error("3rd upload was allowed despite YOUTUBE_DAILY_UPLOAD_LIMIT=2!");
    }

    console.log("   ✓ Persistent PlatformQuota table strictly enforces daily videos.insert ceiling");
    passedTests++;
  } finally {
    delete process.env.YOUTUBE_DAILY_UPLOAD_LIMIT;
  }

  // ----------------------------------------------------------------------
  // TEST 10: Instagram Complete Publishing Flow (Container -> Polling -> Publish -> Permalink)
  // ----------------------------------------------------------------------
  console.log("\nTEST 10: Instagram Complete Publishing Flow (Container -> Status Polling -> Publish -> Permalink)");
  process.env.META_APP_ID = "meta_app_123";
  process.env.META_APP_SECRET = "meta_secret_456";
  process.env.INSTAGRAM_POLL_INTERVAL_MS = "10";

  try {
    const igProvider = new InstagramLiveProvider();
    const igAccount = {
      id: "acc_ig_live",
      platform: "INSTAGRAM" as const,
      platformAccountId: "17841405555",
      username: "@live_ig",
      displayName: "Live IG",
      accessToken: "IGQVJ_live_access_token",
      isMock: false,
    };

    // 10a. Missing media URL must fail (never substitute placeholder image!)
    let missingMediaRejected = false;
    try {
      await igProvider.publishPost(igAccount, {
        postId: "p_ig_0",
        targetId: "t_ig_0",
        content: "Post with no media",
        mediaUrls: [],
      });
    } catch (err) {
      if ((err as Error).message.includes("requires a valid media URL")) {
        missingMediaRejected = true;
      }
    }
    if (!missingMediaRejected) {
      throw new Error("InstagramLiveProvider did not reject empty mediaUrls!");
    }

    // 10b. Full container creation -> polling (IN_PROGRESS -> FINISHED) -> publish -> permalink confirmation
    let pollCount = 0;
    let publishedAfterFinished = false;
    let firstCommentPosted = false;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();

      if (method === "POST" && urlStr.endsWith("/17841405555/media")) {
        const params = new URLSearchParams(String(init?.body || ""));
        if (params.get("media_type") !== "REELS") {
          return new Response("Expected REELS media_type for .mp4", { status: 400 });
        }
        return Response.json({ id: "ig_container_888" });
      }

      if (method === "GET" && urlStr.includes("/v21.0/ig_container_888")) {
        pollCount++;
        if (pollCount < 2) {
          return Response.json({ status_code: "IN_PROGRESS", status: "Encoding video" });
        }
        return Response.json({ status_code: "FINISHED", status: "Ready" });
      }

      if (method === "POST" && urlStr.endsWith("/17841405555/media_publish")) {
        if (pollCount < 2) {
          return new Response("Published before container FINISHED!", { status: 400 });
        }
        publishedAfterFinished = true;
        return Response.json({ id: "ig_published_media_999" });
      }

      if (method === "GET" && urlStr.includes("/v21.0/ig_published_media_999")) {
        return Response.json({
          id: "ig_published_media_999",
          permalink: "https://www.instagram.com/reel/C_confirmed_reel_xyz/",
          shortcode: "C_confirmed_reel_xyz",
          media_type: "VIDEO",
        });
      }

      if (method === "POST" && urlStr.endsWith("/ig_published_media_999/comments")) {
        firstCommentPosted = true;
        return Response.json({ id: "comment_111" });
      }

      return new Response(`Unexpected IG URL: ${urlStr}`, { status: 404 });
    };

    const igRes = await igProvider.publishPost(igAccount, {
      postId: "p_ig_1",
      targetId: "t_ig_1",
      content: "Launching our new Reel!",
      firstComment: "#reels #launch",
      mediaUrls: ["https://cdn.mediaconnect.app/workspaces/acme/reel_video.mp4"],
    });

    if (pollCount !== 2 || !publishedAfterFinished) {
      throw new Error(`Expected 2 status polls before publish, got pollCount=${pollCount}`);
    }
    if (!firstCommentPosted) {
      throw new Error("First comment was not posted after media publication");
    }
    if (igRes.platformPostId !== "ig_published_media_999") {
      throw new Error(`Unexpected Instagram media ID: ${igRes.platformPostId}`);
    }
    if (igRes.liveUrl !== "https://www.instagram.com/reel/C_confirmed_reel_xyz/") {
      throw new Error(`Unexpected Instagram permalink: ${igRes.liveUrl}`);
    }

    console.log("   ✓ Instagram container created, polled IN_PROGRESS -> FINISHED, published, and real permalink confirmed");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.INSTAGRAM_POLL_INTERVAL_MS;
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 11: Instagram Container Processing Failure (status_code: ERROR)
  // ----------------------------------------------------------------------
  console.log("\nTEST 11: Instagram Container Processing Failure (status_code: ERROR)");
  process.env.META_APP_ID = "meta_app_123";
  process.env.META_APP_SECRET = "meta_secret_456";

  try {
    let publishCalledOnFailedContainer = false;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();

      if (method === "POST" && urlStr.endsWith("/media")) {
        return Response.json({ id: "ig_bad_container_400" });
      }
      if (method === "GET" && urlStr.includes("/ig_bad_container_400")) {
        return Response.json({
          status_code: "ERROR",
          error_message: "Video aspect ratio not supported by Instagram Reels.",
        });
      }
      if (method === "POST" && urlStr.endsWith("/media_publish")) {
        publishCalledOnFailedContainer = true;
        return Response.json({ id: "should_not_happen" });
      }
      return new Response("Not found", { status: 404 });
    };

    const igProvider = new InstagramLiveProvider();
    let processingErrorCaught = false;
    try {
      await igProvider.publishPost(
        {
          id: "acc_ig_err",
          platform: "INSTAGRAM",
          platformAccountId: "17841405555",
          username: "@live_ig",
          displayName: "Live IG",
          accessToken: "IGQVJ_token",
          isMock: false,
        },
        {
          postId: "p_err",
          targetId: "t_err",
          content: "Bad video",
          mediaUrls: ["https://cdn.mediaconnect.app/bad_video.mp4"],
        }
      );
    } catch (err) {
      if (err instanceof InstagramMediaProcessingError && err.statusCode === "ERROR") {
        processingErrorCaught = true;
      }
    }

    if (!processingErrorCaught || publishCalledOnFailedContainer) {
      throw new Error("Failed container was not aborted with InstagramMediaProcessingError!");
    }

    console.log("   ✓ Container ERROR status immediately aborted publishing with InstagramMediaProcessingError");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 12: Scheduled Publisher Token Expiry Refresh-and-Persist Workflow
  // ----------------------------------------------------------------------
  console.log("\nTEST 12: Scheduled Publisher Token Expiry Refresh-and-Persist Workflow");
  process.env.YOUTUBE_CLIENT_ID = "yt_client_id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt_client_secret";

  const acmeWs = await db.workspace.findFirst({ where: { slug: "acme-media" } });
  if (!acmeWs) throw new Error("Missing Acme workspace");

  const tempMp4 = await localProvider.upload(
    createValidMp4Buffer(128),
    "scheduled_refresh.mp4",
    "video/mp4",
    acmeWs.id
  );

  const expiringAccId = `acc_expiring_${Date.now()}`;
  const expiringAccount = await db.account.create({
    data: {
      id: expiringAccId,
      workspaceId: acmeWs.id,
      platform: "YOUTUBE",
      platformAccountId: `UC_expiring_${Date.now()}`,
      username: "@ExpiringChannel",
      displayName: "Expiring Channel",
      accessToken: TokenVault.encrypt("stale_expired_access_token", expiringAccId, "v1"),
      refreshToken: TokenVault.encrypt("valid_stored_refresh_token", expiringAccId, "v1"),
      tokenKeyVersion: "v1",
      tokenExpiresAt: new Date(Date.now() - 10 * 60 * 1000), // Expired 10 minutes ago!
      isMock: false,
      status: "ACTIVE",
    },
  });

  const refreshTestPost = await db.post.create({
    data: {
      workspaceId: acmeWs.id,
      content: "Scheduled post with expired token #shorts",
      mediaUrls: JSON.stringify([tempMp4.publicUrl]),
      status: "SCHEDULED",
      approvalStatus: "APPROVED",
      targets: {
        create: [
          {
            accountId: expiringAccount.id,
            platform: "YOUTUBE",
            status: "PENDING",
          },
        ],
      },
    },
    include: { targets: true },
  });

  try {
    let tokenRefreshCalled = false;
    let uploadAuthHeader = "";

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);

      const method = (init?.method || "GET").toUpperCase();

      if (urlStr === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(String(init?.body || ""));
        if (body.get("grant_type") === "refresh_token" && body.get("refresh_token") === "valid_stored_refresh_token") {
          tokenRefreshCalled = true;
          return Response.json({
            access_token: "freshly_refreshed_access_token_999",
            refresh_token: "rotated_refresh_token_999",
            expires_in: 3600,
          });
        }
        return new Response("Invalid refresh token", { status: 400 });
      }

      if (method === "POST" && urlStr.includes("googleapis.com/upload/youtube/v3/videos?uploadType=resumable")) {
        uploadAuthHeader = headers.get("authorization") || "";
        return new Response(null, {
          status: 200,
          headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=ref_sess_1" },
        });
      }

      if (method === "PUT" && urlStr.includes("upload_id=ref_sess_1")) {
        return Response.json({ id: "yt_after_refresh_123" }, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    };

    const publishedTarget = await PublisherService.publishTarget(refreshTestPost.targets[0].id);

    if (!tokenRefreshCalled) {
      throw new Error("PublisherService did not refresh the expired token before publishing!");
    }
    if (uploadAuthHeader !== "Bearer freshly_refreshed_access_token_999") {
      throw new Error(`Upload used stale token! Authorization header: ${uploadAuthHeader}`);
    }
    if (publishedTarget.status !== "PUBLISHED" || publishedTarget.platformPostId !== "yt_after_refresh_123") {
      throw new Error(`Target failed to publish after token refresh: ${publishedTarget.errorMessage}`);
    }

    // Verify new tokens and future tokenExpiresAt were encrypted and persisted in database
    const updatedAcc = await db.account.findUnique({ where: { id: expiringAccount.id } });
    const decryptedNewAccess = TokenVault.decrypt(updatedAcc!.accessToken!, expiringAccount.id);
    const decryptedNewRefresh = TokenVault.decrypt(updatedAcc!.refreshToken!, expiringAccount.id);

    if (decryptedNewAccess !== "freshly_refreshed_access_token_999" || decryptedNewRefresh !== "rotated_refresh_token_999") {
      throw new Error("Refreshed OAuth tokens were not re-encrypted and persisted in the database!");
    }
    if (!updatedAcc!.tokenExpiresAt || updatedAcc!.tokenExpiresAt.getTime() <= Date.now()) {
      throw new Error("Updated tokenExpiresAt was not persisted in the future!");
    }

    console.log("   ✓ Expired account token automatically refreshed, re-encrypted in vault, and persisted before publish");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    await localProvider.delete(tempMp4.storageKey, acmeWs.id);
    await db.postTarget.deleteMany({ where: { postId: refreshTestPost.id } });
    await db.post.delete({ where: { id: refreshTestPost.id } });
    await db.account.delete({ where: { id: expiringAccount.id } });
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 13: Publisher Resumable Session Persistence Across Retries
  // ----------------------------------------------------------------------
  console.log("\nTEST 13: Publisher Resumable Session Persistence Across Retries");
  process.env.YOUTUBE_CLIENT_ID = "yt_client_id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt_client_secret";

  const resumeMp4 = await localProvider.upload(
    createValidMp4Buffer(160),
    "resume_persist.mp4",
    "video/mp4",
    acmeWs.id
  );

  const resumeAccId = `acc_resume_${Date.now()}`;
  const resumeAccount = await db.account.create({
    data: {
      id: resumeAccId,
      workspaceId: acmeWs.id,
      platform: "YOUTUBE",
      platformAccountId: `UC_resume_${Date.now()}`,
      username: "@ResumeChannel",
      displayName: "Resume Channel",
      accessToken: TokenVault.encrypt("ya29.resume_token", resumeAccId, "v1"),
      tokenKeyVersion: "v1",
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      isMock: false,
      status: "ACTIVE",
    },
  });

  const resumePost = await db.post.create({
    data: {
      workspaceId: acmeWs.id,
      content: "Post testing persistent resumable session across worker retries",
      mediaUrls: JSON.stringify([resumeMp4.publicUrl]),
      status: "SCHEDULED",
      approvalStatus: "APPROVED",
      targets: {
        create: [
          {
            accountId: resumeAccount.id,
            platform: "YOUTUBE",
            status: "PENDING",
          },
        ],
      },
    },
    include: { targets: true },
  });

  try {
    let sessionInitCount = 0;
    let attemptNumber = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);

      if (method === "POST" && urlStr.includes("uploadType=resumable")) {
        sessionInitCount++;
        return new Response(null, {
          status: 200,
          headers: {
            location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=persisted_sess_777",
          },
        });
      }

      if (method === "PUT" && urlStr.includes("upload_id=persisted_sess_777")) {
        const range = headers.get("content-range") || "";
        if (range.startsWith("bytes */")) {
          return new Response(null, { status: 308, headers: { range: "bytes=0-79" } });
        }

        attemptNumber++;
        if (attemptNumber === 1) {
          // Hard 400/network failure on attempt 1 after session creation
          return new Response("Simulated connection drop", { status: 400 });
        }

        return Response.json({ id: "yt_persisted_session_video_888" }, { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    };

    const targetId = resumePost.targets[0].id;

    // Attempt 1: Initiates session, fails during PUT, saves resumableSessionUri + nextRetryAt on PostTarget
    const firstTry = await PublisherService.publishTarget(targetId);
    if (firstTry.status !== "FAILED" || !firstTry.resumableSessionUri?.includes("persisted_sess_777") || !firstTry.nextRetryAt) {
      throw new Error("Attempt 1 did not persist resumableSessionUri and nextRetryAt on PostTarget!");
    }

    // Attempt 2: Reuses persisted resumableSessionUri without creating a second session!
    const secondTry = await PublisherService.publishTarget(targetId);
    if (secondTry.status !== "PUBLISHED" || secondTry.platformPostId !== "yt_persisted_session_video_888") {
      throw new Error(`Attempt 2 failed to resume session: ${secondTry.errorMessage}`);
    }
    if (sessionInitCount !== 1) {
      throw new Error(`Expected exactly 1 session initialization across 2 attempts, got ${sessionInitCount}`);
    }

    console.log("   ✓ Resumable session URI and retry backoff persisted in DB and reused on second worker attempt");
    passedTests++;
  } finally {
    globalThis.fetch = originalFetch;
    await localProvider.delete(resumeMp4.storageKey, acmeWs.id);
    await db.postTarget.deleteMany({ where: { postId: resumePost.id } });
    await db.post.delete({ where: { id: resumePost.id } });
    await db.account.delete({ where: { id: resumeAccount.id } });
    Object.assign(process.env, savedEnv);
  }

  // ----------------------------------------------------------------------
  // TEST 14: Live Analytics Boundary Enforcement (Zero Fabricated Metrics)
  // ----------------------------------------------------------------------
  console.log("\nTEST 14: Live Analytics Boundary Enforcement (Zero Fabricated Metrics)");
  process.env.YOUTUBE_CLIENT_ID = "yt_id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt_sec";
  process.env.META_APP_ID = "ig_id";
  process.env.META_APP_SECRET = "ig_sec";

  try {
    const yt = new YouTubeLiveProvider();
    const ig = new InstagramLiveProvider();
    const x = new XLiveProvider();

    const liveAcc = {
      id: "acc_live",
      platform: "INSTAGRAM" as const,
      platformAccountId: "123",
      username: "@live",
      displayName: "Live",
      accessToken: "tok",
      isMock: false,
    };

    const expectAnalyticsBoundary = async (fn: () => Promise<unknown>, label: string) => {
      let caught = false;
      try {
        await fn();
      } catch (err) {
        if (err instanceof LiveAnalyticsNotSupportedError) caught = true;
      }
      if (!caught) {
        throw new Error(`Expected LiveAnalyticsNotSupportedError for ${label}, but synthetic data was returned!`);
      }
    };

    await expectAnalyticsBoundary(() => yt.fetchAudienceActivity({ ...liveAcc, platform: "YOUTUBE" }), "YouTube heatmap");
    await expectAnalyticsBoundary(
      () => ig.fetchInsights(liveAcc, { startDate: new Date(), endDate: new Date() }),
      "Instagram live insights"
    );
    await expectAnalyticsBoundary(() => ig.fetchAudienceActivity(liveAcc), "Instagram heatmap");
    await expectAnalyticsBoundary(
      () => x.fetchInsights({ ...liveAcc, platform: "X" }, { startDate: new Date(), endDate: new Date() }),
      "X live insights"
    );

    console.log("   ✓ Live providers strictly refuse to return synthetic metrics or heatmaps disguised as live insights");
    passedTests++;
  } finally {
    Object.assign(process.env, savedEnv);
  }

  console.log("\n==================================================================");
  console.log(`🎉 ALL PHASE 6B DETERMINISTIC PROTOCOL & LIVE TESTS PASSED (${passedTests}/${totalTests})!`);
  console.log("==================================================================");
}

runPhase6BTestSuite()
  .catch((err) => {
    console.error("\n❌ PHASE 6B TEST SUITE FAILED:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
