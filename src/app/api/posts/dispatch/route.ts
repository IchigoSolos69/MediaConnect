import { NextRequest, NextResponse } from "next/server";
import { PublisherService } from "@/services/publisher.service";
import { getDispatchSecret } from "@/lib/config/secrets";
import { authenticateRequest, authorizeWorkspaceAccess } from "@/lib/auth/server";
import { SecurityAudit } from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    let isServiceAuthorized = false;
    let authorizedWorkspaceId: string | undefined;

    // 1. Service-to-service authorization via DISPATCH_SECRET
    if (authHeader?.startsWith("Bearer ")) {
      const providedSecret = authHeader.substring(7).trim();
      const expectedSecret = getDispatchSecret();

      if (providedSecret === expectedSecret) {
        isServiceAuthorized = true;
      }
    }

    // 2. Or user-initiated manual dispatch by an authorized OWNER
    if (!isServiceAuthorized) {
      try {
        const session = await authenticateRequest(request);
        const { searchParams } = new URL(request.url);
        const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

        // Requires workspace OWNER permission
        await authorizeWorkspaceAccess(session.userId, requestedWorkspaceId, "workspace:manage");
        authorizedWorkspaceId = requestedWorkspaceId;
      } catch (_authErr) {
        SecurityAudit.log({
          event: "DISPATCH_UNAUTHORIZED",
          ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
          details: { error: "Missing or invalid dispatch authorization" },
        });

        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized: Internal dispatch requires valid service credentials or an authenticated OWNER session.",
          },
          { status: 401 }
        );
      }
    }

    SecurityAudit.log({
      event: "DISPATCH_TRIGGERED",
      workspaceId: authorizedWorkspaceId || "ALL_WORKSPACES",
      details: { isServiceAuthorized },
    });

    // 3. Run atomic publisher dispatcher (scoped to workspace if user-triggered)
    const result = await PublisherService.dispatchDuePosts(authorizedWorkspaceId);

    return NextResponse.json({
      success: true,
      message: `Dispatched ${result.dispatchedCount} due posts.`,
      dispatchedCount: result.dispatchedCount,
      posts: result.posts,
    });
  } catch (error: any) {
    console.error("Error running publisher dispatcher:", error);
    return NextResponse.json(
      { success: false, error: "Failed to dispatch due posts" },
      { status: 500 }
    );
  }
}
