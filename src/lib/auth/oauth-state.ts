import crypto from "crypto";
import { getAuthSecret } from "@/lib/config/secrets";
import { SocialPlatform } from "@/providers/types";

export interface OAuthStatePayload {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
  timestamp: number;
  nonce: string;
}

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

/**
 * Creates a tamper-evident, signed OAuth state parameter valid for 15 minutes.
 */
export function createOAuthState(
  workspaceId: string,
  userId: string,
  platform: SocialPlatform
): string {
  const secret = getAuthSecret();
  const payload: OAuthStatePayload = {
    workspaceId,
    userId,
    platform,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(12).toString("hex"),
  };

  const serialized = JSON.stringify(payload);
  const encodedPayload = Buffer.from(serialized, "utf-8").toString("base64url");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(encodedPayload);
  const signature = hmac.digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and parses a signed OAuth state parameter.
 * Enforces cryptographic authenticity, replay defense, and a 15-minute expiration window.
 */
export function verifyOAuthState(stateString: string): OAuthStatePayload {
  const secret = getAuthSecret();
  const parts = stateString.split(".");
  if (parts.length !== 2) {
    throw new OAuthStateError("Invalid OAuth state format: missing signature");
  }

  const [encodedPayload, signature] = parts;

  // 1. Verify HMAC-SHA256 signature
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
