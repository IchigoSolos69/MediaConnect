import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PublisherService } from "@/services/publisher.service";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;
    const status = searchParams.get("status");

    // Enforce workspace membership
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "analytics:view"
    );

    const where: any = { workspaceId: membership.workspaceId };
    if (status) where.status = status;

    const posts = await db.post.findMany({
      where,
      include: {
        targets: {
          include: {
            account: {
              select: {
                id: true,
                platform: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                followersCount: true,
                status: true,
                isMock: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

    const body = await request.json();
    const {
      title,
      content,
      mediaUrls,
      scheduleMode, // "NOW" | "SCHEDULE" | "QUEUE" | "DRAFT"
      scheduledDate,
      targets,
      seoScore,
      hookScore,
      workspaceId: reqWorkspaceId,
    } = body;

    if (!content || !targets || targets.length === 0) {
      return NextResponse.json(
        { success: false, error: "Content and at least one target channel are required" },
        { status: 400 }
      );
    }

    const targetWorkspaceId = reqWorkspaceId || session.activeWorkspaceId;

    // Verify workspace membership and basic post creation right
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "posts:create"
    );

    // Enforce Role Permissions for Scheduling vs Drafting
    const canPublish = hasPermission(membership.role, "posts:publish_now");
    const canApprove = hasPermission(membership.role, "posts:approve");

    if (scheduleMode === "NOW" && !canPublish) {
      return NextResponse.json(
        {
          success: false,
          error: `Permission denied: Role [${membership.role}] cannot immediately publish posts. Submit for approval instead.`,
        },
        { status: 403 }
      );
    }

    let finalScheduledAt: Date | null = null;
    let initialStatus = "DRAFT";
    let approvalStatus = "APPROVED";

    if (!canApprove && (scheduleMode === "SCHEDULE" || scheduleMode === "QUEUE")) {
      // Editor submitted scheduled post -> requires approval
      approvalStatus = "PENDING_APPROVAL";
      initialStatus = "DRAFT";
      finalScheduledAt = scheduledDate ? new Date(scheduledDate) : null;
    } else if (scheduleMode === "NOW") {
      finalScheduledAt = new Date();
      initialStatus = "SCHEDULED";
      approvalStatus = "APPROVED";
    } else if (scheduleMode === "SCHEDULE") {
      finalScheduledAt = scheduledDate ? new Date(scheduledDate) : new Date();
      initialStatus = "SCHEDULED";
      approvalStatus = "APPROVED";
    } else if (scheduleMode === "QUEUE") {
      finalScheduledAt = await PublisherService.getNextQueueSlot(membership.workspaceId);
      initialStatus = "SCHEDULED";
      approvalStatus = "APPROVED";
    }

    const post = await db.post.create({
      data: {
        workspaceId: membership.workspaceId,
        authorId: session.userId,
        title,
        content,
        mediaUrls: JSON.stringify(mediaUrls || []),
        status: initialStatus,
        approvalStatus,
        scheduledAt: finalScheduledAt,
        seoScore: seoScore || 0,
        hookScore: hookScore || 0,
        targets: {
          create: targets.map((t: any) => ({
            accountId: t.accountId,
            platform: t.platform,
            status: "PENDING",
            customContent: t.customContent || null,
            firstComment: t.firstComment || null,
            videoTitle: t.videoTitle || null,
            videoTags: t.videoTags || null,
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    if (scheduleMode === "NOW" && canPublish) {
      const published = await PublisherService.publishPostNow(post.id);
      return NextResponse.json({ success: true, post: published });
    }

    return NextResponse.json({ success: true, post });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
