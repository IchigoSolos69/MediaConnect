import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AnalyticsService } from "@/services/analytics.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "14", 10);
    const platform = searchParams.get("platform") || "ALL";

    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
    }

    const [overview, heatmap] = await Promise.all([
      AnalyticsService.getOverview(workspace.id, days),
      AnalyticsService.getAudienceHeatmap(platform),
    ]);

    return NextResponse.json({
      success: true,
      overview,
      heatmap,
    });
  } catch (error: any) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
