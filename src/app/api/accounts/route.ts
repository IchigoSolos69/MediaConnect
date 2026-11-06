import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSocialProvider, SocialPlatform } from "@/providers";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
  sanitizeAccount,
} from "@/lib/auth/server";
import { TokenVault } from "@/lib/crypto/vault";

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

    const { searchParams } = new URL(request.url);
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    // Enforce workspace membership authorization
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "analytics:view"
    );

    const accounts = await db.account.findMany({
      where: { workspaceId: membership.workspaceId },
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

    // Zero-token leak: sanitize all returned account records
    const safeAccounts = accounts.map(sanitizeAccount);

    return NextResponse.json({ success: true, accounts: safeAccounts });
  } catch (error) {
    return handleAuthApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);

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

    const targetWorkspaceId = reqWorkspaceId || session.activeWorkspaceId;

    // Enforce permission: only OWNER can connect/manage social accounts
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "channels:connect"
    );

    const provider = getSocialProvider(platform, "mock");
    const mockAuth = await provider.exchangeCode("mock_code");

    // Upsert the account
    const existing = await db.account.findFirst({
      where: {
        workspaceId: membership.workspaceId,
        platform,
      },
    });

    let account;
    if (existing) {
      // Encrypt token before saving to vault
      const encryptedAccess = TokenVault.encrypt(mockAuth.accessToken, existing.id, "v1");
      const encryptedRefresh = mockAuth.refreshToken
        ? TokenVault.encrypt(mockAuth.refreshToken, existing.id, "v1")
        : null;

      account = await db.account.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenKeyVersion: "v1",
          followersCount: mockAuth.followersCount,
          updatedAt: new Date(),
        },
      });
    } else {
      // Generate account ID first to bind AAD cryptographically
      const newAccountId = `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const encryptedAccess = TokenVault.encrypt(mockAuth.accessToken, newAccountId, "v1");
      const encryptedRefresh = mockAuth.refreshToken
        ? TokenVault.encrypt(mockAuth.refreshToken, newAccountId, "v1")
        : null;

      account = await db.account.create({
        data: {
          id: newAccountId,
          workspaceId: membership.workspaceId,
          platform,
          platformAccountId: mockAuth.platformAccountId,
          username: mockAuth.username,
          displayName: mockAuth.displayName,
          avatarUrl: mockAuth.avatarUrl,
          followersCount: mockAuth.followersCount,
          status: "ACTIVE",
          isMock: true,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenKeyVersion: "v1",
        },
      });
    }

    return NextResponse.json({ success: true, account: sanitizeAccount(account) });
  } catch (error) {
    return handleAuthApiError(error);
  }
}
