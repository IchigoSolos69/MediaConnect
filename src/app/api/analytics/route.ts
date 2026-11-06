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
      AnalyticsService.getAudienceHeatmap(platform),
    ]);

    return NextResponse.json({
      success: true,
      overview,
      heatmap,
    });
  } catch (error: any) {
    return handleAuthApiError(error);
  }
}
