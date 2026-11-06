import { NextResponse } from "next/server";
import { PublisherService } from "@/services/publisher.service";

export async function POST() {
  try {
    const result = await PublisherService.dispatchDuePosts();
    return NextResponse.json({
      success: true,
      message: `Dispatched ${result.dispatchedCount} due posts.`,
      dispatchedCount: result.dispatchedCount,
      posts: result.posts,
    });
  } catch (error: any) {
    console.error("Error running publisher dispatcher:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dispatch due posts" },
      { status: 500 }
    );
  }
}
