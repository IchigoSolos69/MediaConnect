import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ success: false, error: "Workspace not found" }, { status: 404 });
    }

    const slots = await db.queueSlot.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
    });

    return NextResponse.json({ success: true, slots });
  } catch (error) {
    console.error("Error fetching queue slots:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch queue slots" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dayOfWeek, time } = body;

    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      return NextResponse.json({ success: false, error: "Workspace not found" }, { status: 404 });
    }

    const slot = await db.queueSlot.create({
      data: {
        workspaceId: workspace.id,
        dayOfWeek: Number(dayOfWeek),
        time,
      },
    });

    return NextResponse.json({ success: true, slot });
  } catch (error) {
    console.error("Error creating queue slot:", error);
    return NextResponse.json({ success: false, error: "Failed to create queue slot" }, { status: 500 });
  }
}
