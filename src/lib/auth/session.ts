import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { WorkspaceRole } from "./permissions";
import { getAuthSecret } from "../config/secrets";

export const SESSION_COOKIE_NAME = "mc_session";

export interface AuthSessionPayload {
  userId: string;
  email: string;
  name: string;
  activeWorkspaceId: string;
  role: WorkspaceRole;
  iat?: number;
  exp?: number;
}

/**
 * Creates a signed JWT session token valid for 7 days.
 * Strictly uses getAuthSecret() which enforces production strength and fails closed.
 */
export async function createSessionToken(payload: Omit<AuthSessionPayload, "iat" | "exp">): Promise<string> {
  const secret = getAuthSecret();
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * Verifies and decodes a signed JWT session token.
 * Returns null if token is expired, altered, or invalid.
 */
export async function verifySessionToken(token: string): Promise<AuthSessionPayload | null> {
  try {
    const secret = getAuthSecret();
    const { payload } = await jwtVerify(token, secret);
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
