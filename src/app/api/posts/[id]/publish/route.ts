import { NextRequest, NextResponse } from "next/server";
import { PublisherService } from "@/services/publisher.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const published = await PublisherService.publishPostNow(id);
    return NextResponse.json({ success: true, post: published });
  } catch (error: any) {
    console.error("Error publishing post immediately:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to publish post" },
      { status: 500 }
    );
  }
}
