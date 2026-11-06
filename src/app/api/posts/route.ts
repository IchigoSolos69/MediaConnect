import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PublisherService } from "@/services/publisher.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const defaultWorkspace = await db.workspace.findFirst();
    if (!defaultWorkspace) {
      return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
    }

    const where: any = { workspaceId: defaultWorkspace.id };
    if (status) where.status = status;

    const posts = await db.post.findMany({
      where,
      include: {
        targets: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      content,
      mediaUrls,
      scheduleMode, // "NOW" | "SCHEDULE" | "QUEUE" | "DRAFT"
      scheduledDate, // ISO string or timestamp
      targets, // Array of { accountId, platform, customContent, firstComment, videoTitle, videoTags }
      seoScore,
      hookScore,
    } = body;

    if (!content || !targets || targets.length === 0) {
      return NextResponse.json(
        { success: false, error: "Content and at least one target channel are required" },
        { status: 400 }
      );
    }

    const defaultWorkspace = await db.workspace.findFirst();
    if (!defaultWorkspace) {
      return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
    }

    let finalScheduledAt: Date | null = null;
    let initialStatus = "DRAFT";

    if (scheduleMode === "NOW") {
      finalScheduledAt = new Date();
      initialStatus = "SCHEDULED";
    } else if (scheduleMode === "SCHEDULE") {
      finalScheduledAt = scheduledDate ? new Date(scheduledDate) : new Date();
      initialStatus = "SCHEDULED";
    } else if (scheduleMode === "QUEUE") {
      finalScheduledAt = await PublisherService.getNextQueueSlot(defaultWorkspace.id);
      initialStatus = "SCHEDULED";
    } else {
      initialStatus = "DRAFT";
    }

    const post = await db.post.create({
      data: {
        workspaceId: defaultWorkspace.id,
        title,
        content,
        mediaUrls: JSON.stringify(mediaUrls || []),
        status: initialStatus,
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

    // If scheduleMode === "NOW", immediately publish
    if (scheduleMode === "NOW") {
      const published = await PublisherService.publishPostNow(post.id);
      return NextResponse.json({ success: true, post: published });
    }

    return NextResponse.json({ success: true, post });
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json({ success: false, error: "Failed to create post" }, { status: 500 });
  }
}
