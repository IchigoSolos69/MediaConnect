import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PublisherService } from "@/services/publisher.service";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    const { id } = await params;

    const post = await db.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Enforce permission: user must have posts:publish_now right in this post's workspace
    await authorizeWorkspaceAccess(session.userId, post.workspaceId, "posts:publish_now");

    const published = await PublisherService.publishPostNow(id);
    return NextResponse.json({ success: true, post: published });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
