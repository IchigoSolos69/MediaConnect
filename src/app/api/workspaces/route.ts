import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, handleAuthApiError } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

    // Only return workspaces the authenticated user is an explicit member of
    const memberships = await db.workspaceMember.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                accounts: true,
                posts: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      userRole: m.role,
    }));

    return NextResponse.json({ success: true, workspaces });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
