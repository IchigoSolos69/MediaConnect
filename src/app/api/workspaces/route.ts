import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const workspaces = await db.workspace.findMany({
      include: {
        _count: {
          select: {
            accounts: true,
            posts: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, workspaces });
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}
