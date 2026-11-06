import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
    }

    const competitors = await db.competitor.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { followersCount: "desc" },
    });

    return NextResponse.json({ success: true, competitors });
  } catch (error: any) {
    console.error("Error fetching competitors:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch competitors" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, username, displayName, followersCount, engagementRate } = body;

    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
    }

    const competitor = await db.competitor.create({
      data: {
        workspaceId: workspace.id,
        platform: platform || "X",
        username,
        displayName: displayName || username,
        followersCount: Number(followersCount) || 50000,
        postsCount: 1200,
        engagementRate: Number(engagementRate) || 2.1,
      },
    });

    return NextResponse.json({ success: true, competitor });
  } catch (error: any) {
    console.error("Error creating competitor:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to add competitor" },
      { status: 500 }
    );
  }
}
