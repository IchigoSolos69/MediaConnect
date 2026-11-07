import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/services/analytics.service";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "14", 10);
    const platform = searchParams.get("platform") || "ALL";
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    // Enforce workspace authorization
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "analytics:view"
    );

    const [overview, heatmap] = await Promise.all([
      AnalyticsService.getOverview(membership.workspaceId, days),
      AnalyticsService.getAudienceHeatmap(membership.workspaceId, platform),
    ]);

    return NextResponse.json({
      success: true,
      workspaceId: membership.workspaceId,
      overview,
      heatmap,
    });
  } catch (error: unknown) {
    return handleAuthApiError(error);
  }
}

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

    const [overview, heatmap] = await Promise.all([
      AnalyticsService.getOverview(membership.workspaceId, days),
      AnalyticsService.getAudienceHeatmap(membership.workspaceId, "ALL"),
    ]);

    return NextResponse.json({
      success: true,
      sync: syncResult,
      overview,
      heatmap,
    });
  } catch (error: unknown) {
    return handleAuthApiError(error);
  }
}
