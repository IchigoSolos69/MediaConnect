import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft disconnect: update status to DISCONNECTED or remove
    await db.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Account disconnected" });
  } catch (error) {
    console.error("Error disconnecting account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to disconnect account" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const account = await db.account.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update account" },
      { status: 500 }
    );
  }
}
