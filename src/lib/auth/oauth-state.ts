import crypto from "crypto";
import { db } from "@/lib/db";
import { getAuthSecret } from "@/lib/config/secrets";
import { SocialPlatform } from "@/providers/types";

export interface OAuthStatePayload {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
  timestamp: number;
  nonce: string;
}

export interface CreatedOAuthState {
  stateToken: string;
  codeVerifier: string;
  codeChallenge: string;
}

export interface ConsumedOAuthState {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
  codeVerifier: string | null;
}

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

/**
 * Generates RFC 7636 compliant PKCE code_verifier and S256 code_challenge.
 */
export function generatePKCEPair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Verifies the HMAC-SHA256 cryptographic signature and 15-minute timestamp of a state string.
 */
export function verifyOAuthStateSignature(stateString: string): OAuthStatePayload {
  const secret = getAuthSecret();
  const parts = stateString.split(".");
  if (parts.length !== 2) {
    throw new OAuthStateError("Invalid OAuth state format: missing signature");
  }

  const [encodedPayload, signature] = parts;

  // 1. Verify HMAC-SHA256 signature using constant-time comparison
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(encodedPayload);
  const expectedSig = hmac.digest("base64url");

  const sigBuffer = Buffer.from(signature, "utf-8");
  const expectedSigBuffer = Buffer.from(expectedSig, "utf-8");

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    throw new OAuthStateError("OAuth state signature verification failed: state was tampered with");
  }

  // 2. Decode payload
  let payload: OAuthStatePayload;
  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    payload = JSON.parse(raw);
  } catch {
    throw new OAuthStateError("Failed to parse OAuth state payload");
  }

  // 3. Expiration check (15 minutes)
  const MAX_AGE_MS = 15 * 60 * 1000;
  const now = Date.now();
  if (now - payload.timestamp > MAX_AGE_MS || payload.timestamp > now + 30000) {
    throw new OAuthStateError("OAuth state has expired. Please initiate connection again.");
  }

  return payload;
}

/**
 * Creates a persistent, single-use, tamper-evident OAuth state with PKCE verifier.
 * Persists the nonce and PKCE code_verifier to database storage bound to the initiating session.
 */
export async function createOAuthState(
  workspaceId: string,
  userId: string,
  platform: SocialPlatform
): Promise<CreatedOAuthState> {
  const secret = getAuthSecret();
  const { codeVerifier, codeChallenge } = generatePKCEPair();
  const now = Date.now();

  const payload: OAuthStatePayload = {
    workspaceId,
    userId,
    platform,
    timestamp: now,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const serialized = JSON.stringify(payload);
  const encodedPayload = Buffer.from(serialized, "utf-8").toString("base64url");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(encodedPayload);
  const signature = hmac.digest("base64url");

  const stateToken = `${encodedPayload}.${signature}`;
  const expiresAt = new Date(now + 15 * 60 * 1000);

  await db.oAuthState.create({
    data: {
      stateToken,
      workspaceId,
      userId,
      platform,
      codeVerifier,
      isConsumed: false,
      expiresAt,
    },
  });

  return { stateToken, codeVerifier, codeChallenge };
}

/**
 * Atomically verifies and consumes a single-use OAuth state parameter.
 * Prevents state replay, CSRF, session fixation, and cross-tenant hijacking.
 */
export async function consumeOAuthState(
  stateToken: string,
  expectedPlatform: SocialPlatform,
  sessionUserId: string
): Promise<ConsumedOAuthState> {
  // 1. Cryptographic signature & timestamp verification
  const decoded = verifyOAuthStateSignature(stateToken);

  if (decoded.platform !== expectedPlatform) {
    throw new OAuthStateError(
      `OAuth state platform mismatch: expected ${expectedPlatform}, got ${decoded.platform}`
    );
  }

  if (decoded.userId !== sessionUserId) {
    throw new OAuthStateError("OAuth session mismatch: State does not belong to active user.");
  }

  // 2. Database lookup for persistent nonce record
  const record = await db.oAuthState.findUnique({
    where: { stateToken },
  });

  if (!record) {
    throw new OAuthStateError("OAuth state not found in persistent store.");
  }

  if (record.isConsumed) {
    throw new OAuthStateError("OAuth state has already been consumed. Replay attempt rejected.");
  }

  if (record.expiresAt < new Date()) {
    throw new OAuthStateError("OAuth state has expired. Please initiate connection again.");
  }

  if (record.userId !== sessionUserId) {
    throw new OAuthStateError("OAuth session mismatch: Persistent state record belongs to another user.");
  }

  // 3. Atomic single-use consumption
  const consumed = await db.oAuthState.updateMany({
    where: {
      id: record.id,
      isConsumed: false,
    },
    data: {
      isConsumed: true,
    },
  });

  if (consumed.count === 0) {
    throw new OAuthStateError("OAuth state replay detected: concurrent consumption rejected.");
  }

  return {
    workspaceId: record.workspaceId,
    userId: record.userId,
    platform: record.platform as SocialPlatform,
    codeVerifier: record.codeVerifier,
  };
}
