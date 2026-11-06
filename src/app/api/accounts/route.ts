import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSocialProvider, SocialPlatform } from "@/providers";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      const defaultWorkspace = await db.workspace.findFirst();
      if (!defaultWorkspace) {
        return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
      }
      workspaceId = defaultWorkspace.id;
    }

    const accounts = await db.account.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: {
            postTargets: true,
            metrics: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, workspaceId: reqWorkspaceId } = body as {
      platform: SocialPlatform;
      workspaceId?: string;
    };

    if (!platform || !["YOUTUBE", "INSTAGRAM", "X"].includes(platform)) {
      return NextResponse.json(
        { success: false, error: "Valid platform (YOUTUBE, INSTAGRAM, X) is required" },
        { status: 400 }
      );
    }

    let workspaceId = reqWorkspaceId;
    if (!workspaceId) {
      const defaultWorkspace = await db.workspace.findFirst();
      if (!defaultWorkspace) {
        return NextResponse.json({ success: false, error: "No workspace found" }, { status: 404 });
      }
      workspaceId = defaultWorkspace.id;
    }

    const provider = getSocialProvider(platform, "mock");
    const mockAuth = await provider.exchangeCode("mock_code");

    // Upsert the account
    const existing = await db.account.findFirst({
      where: {
        workspaceId,
        platform,
      },
    });

    let account;
    if (existing) {
      account = await db.account.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          accessToken: mockAuth.accessToken,
          followersCount: mockAuth.followersCount,
          updatedAt: new Date(),
        },
      });
    } else {
      account = await db.account.create({
        data: {
          workspaceId,
          platform,
          platformAccountId: mockAuth.platformAccountId,
          username: mockAuth.username,
          displayName: mockAuth.displayName,
          avatarUrl: mockAuth.avatarUrl,
          followersCount: mockAuth.followersCount,
          status: "ACTIVE",
          isMock: true,
          accessToken: mockAuth.accessToken,
        },
      });
    }

    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error("Error connecting account:", error);
    return NextResponse.json({ success: false, error: "Failed to connect account" }, { status: 500 });
  }
}
