import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { WorkspaceRole } from "@/lib/auth/permissions";
import { LoginSchema } from "@/lib/validation/schemas";
import { loginRateLimiter, getSafeClientIp } from "@/lib/security/rate-limiter";
import { SecurityAudit } from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  const ip = getSafeClientIp(request);

  try {
    const rawBody = await request.json();
    const parseResult = LoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues[0]?.message || "Invalid input." },
        { status: 400 }
      );
    }

    const { email, password, workspaceId: requestedWorkspaceId } = parseResult.data;
    const rateLimitKey = `${ip}:${email.toLowerCase()}`;

    // 1. Check durable rate limit across instances
    const limitCheck = await loginRateLimiter.check(rateLimitKey);
    if (!limitCheck.allowed) {
      SecurityAudit.log({
        event: "AUTH_RATE_LIMITED",
        email,
        ip,
        details: { retryAfterSeconds: limitCheck.retryAfterSeconds },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Too many login attempts. Please try again in ${limitCheck.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limitCheck.retryAfterSeconds),
          },
        }
      );
    }

    // 2. Lookup user and verify password
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      await loginRateLimiter.recordFailure(rateLimitKey);
      SecurityAudit.log({
        event: "AUTH_FAILURE",
        email,
        ip,
        details: { reason: "User not found or no password configured" },
      });

      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await loginRateLimiter.recordFailure(rateLimitKey);
      SecurityAudit.log({
        event: "AUTH_FAILURE",
        email,
        userId: user.id,
        ip,
        details: { reason: "Password mismatch" },
      });

      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.memberships.length === 0) {
      return NextResponse.json(
        { success: false, error: "User is not assigned to any workspace." },
        { status: 403 }
      );
    }

    // Reset durable rate limit on successful authentication
    await loginRateLimiter.reset(rateLimitKey);

    // 3. Determine active workspace
    let activeMembership = user.memberships[0];
    if (requestedWorkspaceId) {
      const match = user.memberships.find((m) => m.workspaceId === requestedWorkspaceId);
      if (match) activeMembership = match;
    }

    const sessionPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      activeWorkspaceId: activeMembership.workspaceId,
      role: activeMembership.role as WorkspaceRole,
      tokenVersion: user.tokenVersion,
    };

    const token = await createSessionToken(sessionPayload);

    SecurityAudit.log({
      event: "AUTH_SUCCESS",
      userId: user.id,
      email: user.email,
      workspaceId: activeMembership.workspaceId,
      ip,
    });

    // 4. Return strictly HttpOnly cookie session — NEVER return token in JSON response
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        activeWorkspace: {
          id: activeMembership.workspace.id,
          name: activeMembership.workspace.name,
          slug: activeMembership.workspace.slug,
          role: activeMembership.role,
        },
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
        })),
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Login API error:", err?.message || err);
    return NextResponse.json(
      { success: false, error: "Authentication failed. Please try again." },
      { status: 500 }
    );
  }
}
