import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "analytics:view"
    );

    const competitors = await db.competitor.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { followersCount: "desc" },
    });

    return NextResponse.json({ success: true, competitors });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const body = await request.json();
    const { platform, username, displayName, followersCount, engagementRate, workspaceId: reqWorkspaceId } = body;

    const targetWorkspaceId = reqWorkspaceId || session.activeWorkspaceId;
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "workspace:manage"
    );

    const competitor = await db.competitor.create({
      data: {
        workspaceId: membership.workspaceId,
        platform: platform || "X",
        username,
        displayName: displayName || username,
        followersCount: Number(followersCount) || 50000,
        postsCount: 1200,
        engagementRate: Number(engagementRate) || 2.1,
      },
    });

    return NextResponse.json({ success: true, competitor });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}
