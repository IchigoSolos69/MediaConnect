import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { WorkspaceRole } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, workspaceId: requestedWorkspaceId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
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

    // Determine active workspace
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
    };

    const token = await createSessionToken(sessionPayload);

    const response = NextResponse.json({
      success: true,
      token, // Also return for Bearer token authorization in API tests
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

    // Set secure HTTPOnly session cookie
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
  } catch (error: any) {
    console.error("Login API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to authenticate" },
      { status: 500 }
    );
  }
}
