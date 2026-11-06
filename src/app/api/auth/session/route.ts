import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, handleAuthApiError } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, revokeSessionToken } from "@/lib/auth/session";
import { SecurityAudit } from "@/lib/security/audit";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const activeMembership = user.memberships.find(
      (m) => m.workspaceId === session.activeWorkspaceId
    ) || user.memberships[0];

    return NextResponse.json({
      success: true,
      session: {
        userId: user.id,
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
  } catch (err) {
    return handleAuthApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Invalidate session token on the server side
    const session = await authenticateRequest(request).catch(() => null);
    if (session?.jti) {
      await revokeSessionToken(session.jti, session.userId, session.exp);
      SecurityAudit.log({
        event: "SESSION_REVOKED",
        userId: session.userId,
        details: { jti: session.jti },
      });
    }

    // 2. Clear client cookie
    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (err) {
    return handleAuthApiError(err);
  }
}
