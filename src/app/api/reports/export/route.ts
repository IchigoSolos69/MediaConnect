import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import { ReportService } from "@/services/report.service";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "14", 10) || 14));
    const format = searchParams.get("format") || "pdf";
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    // Enforce strict workspace authorization and reports:export permission (OWNER / APPROVER)
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "reports:export"
    );

    const { pdfBuffer, metadata } = await ReportService.generateWorkspaceReport(
      membership.workspaceId,
      days
    );

    if (format === "json") {
      return NextResponse.json({
        success: true,
        metadata,
      });
    }

    const filename = `mediaconnect-report-${metadata.workspaceSlug}-${metadata.dateRange.endDate}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "X-Report-Workspace-Id": metadata.workspaceId,
        "X-Report-Data-Source": metadata.dataSource,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
