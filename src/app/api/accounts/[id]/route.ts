import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
  sanitizeAccount,
} from "@/lib/auth/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    const { id } = await params;

    const account = await db.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    // Enforce permission: user must be an OWNER in this account's workspace
    await authorizeWorkspaceAccess(session.userId, account.workspaceId, "channels:connect");

    await db.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Account disconnected" });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const account = await db.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    await authorizeWorkspaceAccess(session.userId, account.workspaceId, "channels:connect");

    const updated = await db.account.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, account: sanitizeAccount(updated) });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
