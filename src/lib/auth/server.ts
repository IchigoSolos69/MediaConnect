import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  AuthSessionPayload,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "./session";
import { hasPermission, PermissionAction, WorkspaceRole } from "./permissions";
import { SecurityAudit } from "../security/audit";

export class AuthError extends Error {
  public statusCode: number;
  constructor(statusCode = 401, message = "Authentication required") {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  public statusCode: number;
  constructor(message = "Access denied") {
    super(message);
    this.statusCode = 403;
    this.name = "ForbiddenError";
  }
}

/**
 * Extracts and verifies the session from cookie or Authorization Bearer header.
 * Throws AuthError(401) if missing or invalid.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthSessionPayload> {
  let token: string | undefined;

  // 1. Primary: Extract from HttpOnly session cookie
  token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 2. Secondary: Bearer token (for programmatic / internal API access)
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    throw new AuthError(401, "Authentication required. Missing session token.");
  }

  const session = await verifySessionToken(token);
  if (!session) {
    throw new AuthError(401, "Invalid or expired session token. Please sign in again.");
  }

  return session;
}

/**
 * Verifies that the authenticated user is an active member of the target workspace
 * and possesses the required role permission.
 * NEVER trusts client-supplied workspaceId or role.
 */
export async function authorizeWorkspaceAccess(
  userId: string,
  targetWorkspaceId: string,
  requiredAction?: PermissionAction
) {
  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: targetWorkspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    SecurityAudit.log({
      event: "CROSS_TENANT_ATTEMPT",
      userId,
      targetWorkspaceId,
      details: { action: requiredAction },
    });
    throw new ForbiddenError(
      "Cross-tenant access denied: You are not an authorized member of this workspace."
    );
  }

  if (requiredAction && !hasPermission(membership.role, requiredAction)) {
    SecurityAudit.log({
      event: "PRIVILEGE_ESCALATION_ATTEMPT",
      userId,
      workspaceId: targetWorkspaceId,
      details: { role: membership.role, requiredAction },
    });
    throw new ForbiddenError(
      `Permission denied: Your role [${membership.role}] is not authorized to perform [${requiredAction}].`
    );
  }

  return membership;
}

/**
 * Helper to handle auth errors in Route Handlers cleanly.
 */
export function handleAuthApiError(error: any) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode }
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.statusCode }
    );
  }

  console.error("Unhandled API Error:", error?.message || error);
  return NextResponse.json(
    { success: false, error: "An unexpected error occurred." },
    { status: 500 }
  );
}

/**
 * Strips sensitive tokens (accessToken, refreshToken) before returning accounts in API responses.
 */
export function sanitizeAccount<T extends { accessToken?: any; refreshToken?: any }>(
  account: T
): Omit<T, "accessToken" | "refreshToken"> {
  const { accessToken, refreshToken, ...safeAccount } = account;
  return safeAccount;
}
