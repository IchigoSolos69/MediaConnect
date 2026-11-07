import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/services/analytics.service";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const requestedWorkspaceId = body.workspaceId || session.activeWorkspaceId;
    const days = Number(body.days) || 14;
    const forceFullSync = Boolean(body.forceFullSync);

    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "analytics:view"
    );

    const syncResult = await AnalyticsService.syncWorkspaceAnalytics(membership.workspaceId, {
      days,
      forceFullSync,
    });

    return NextResponse.json({
      success: true,
      sync: syncResult,
    });
  } catch (error: unknown) {
    return handleAuthApiError(error);
  }
}
