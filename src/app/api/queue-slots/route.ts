import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import { CreateQueueSlotSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "posts:create"
    );

    const slots = await db.queueSlot.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
    });

    return NextResponse.json({ success: true, slots });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const rawBody = await request.json();

    const parseResult = CreateQueueSlotSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues[0]?.message || "Invalid input." },
        { status: 400 }
      );
    }

    const { dayOfWeek, time, workspaceId: requestedWorkspaceId } = parseResult.data;
    const targetWorkspaceId = requestedWorkspaceId || session.activeWorkspaceId;

    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "workspace:manage"
    );

    const slot = await db.queueSlot.create({
      data: {
        workspaceId: membership.workspaceId,
        dayOfWeek,
        time,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, slot });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
