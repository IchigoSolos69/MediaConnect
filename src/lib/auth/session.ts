import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { WorkspaceRole } from "./permissions";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev_secret_mediaconnect_auth_vault_key_2026_super_secure_32bytes"
);

export const SESSION_COOKIE_NAME = "mc_session";

export interface AuthSessionPayload {
  userId: string;
  email: string;
  name: string;
  activeWorkspaceId: string;
  role: WorkspaceRole;
}

/**
 * Creates a signed, encrypted JWT session token valid for 7 days.
 */
export async function createSessionToken(payload: AuthSessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SESSION_SECRET);
}

/**
 * Verifies and decodes a signed JWT session token.
 * Returns null if token is expired, altered, or invalid.
 */
export async function verifySessionToken(token: string): Promise<AuthSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return payload as unknown as AuthSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the current session from incoming request cookies (Server Component / Route Handler).
 */
export async function getServerSession(): Promise<AuthSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}
