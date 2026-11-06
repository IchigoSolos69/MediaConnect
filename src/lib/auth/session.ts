import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { WorkspaceRole } from "./permissions";
import { getAuthSecret } from "../config/secrets";

export const SESSION_COOKIE_NAME = "mc_session";

export interface AuthSessionPayload {
  jti: string; // Unique JWT identifier for server-side revocation
  userId: string;
  email: string;
  name: string;
  activeWorkspaceId: string;
  role: WorkspaceRole;
  tokenVersion?: number; // User token version for global device revocation
  iat?: number;
  exp?: number;
}

/**
 * Creates a signed JWT session token valid for 7 days.
 * Includes unique jti and tokenVersion for server-side revocation and replay protection.
 */
export async function createSessionToken(
  payload: Omit<AuthSessionPayload, "jti" | "iat" | "exp">
): Promise<string> {
  const secret = getAuthSecret();
  const jti = crypto.randomUUID();

  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * Verifies and decodes a signed JWT session token.
 * Validates cryptographic signature and checks server-side revocation in database.
 * Returns null if token is expired, altered, or revoked.
 */
export async function verifySessionToken(
  token: string,
  checkRevocation = true
): Promise<AuthSessionPayload | null> {
  try {
    const secret = getAuthSecret();
    const { payload } = await jwtVerify(token, secret);
    const sessionPayload = payload as unknown as AuthSessionPayload;

    if (!sessionPayload.jti || !sessionPayload.userId) {
      return null;
    }

    if (checkRevocation) {
      // 1. Check if specific jti was revoked (logout replay defense)
      const isRevoked = await db.revokedSession.findUnique({
        where: { jti: sessionPayload.jti },
      });
      if (isRevoked) {
        return null;
      }

      // 2. Check if user's tokenVersion was incremented (global revocation on password reset)
      if (sessionPayload.tokenVersion !== undefined) {
        const user = await db.user.findUnique({
          where: { id: sessionPayload.userId },
          select: { tokenVersion: true },
        });
        if (!user || user.tokenVersion > sessionPayload.tokenVersion) {
          return null;
        }
      }
    }

    return sessionPayload;
  } catch {
    return null;
  }
}

/**
 * Revokes an individual session token on the server (called upon logout).
 */
export async function revokeSessionToken(jti: string, userId: string, exp?: number): Promise<void> {
  const expiresAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  try {
    await db.revokedSession.upsert({
      where: { jti },
      update: {},
      create: {
        jti,
        userId,
        expiresAt,
      },
    });
  } catch {
    // Ignore duplicate or concurrent revocation
  }
}

/**
 * Invalidates ALL active sessions for a user (called upon password change or account deactivation).
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
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
