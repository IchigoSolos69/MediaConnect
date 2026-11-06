import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, authorizeWorkspaceAccess, handleAuthApiError } from "@/lib/auth/server";
import { getSocialProvider, SocialPlatform } from "@/providers";
import { verifyOAuthState, OAuthStateError } from "@/lib/auth/oauth-state";
import { TokenVault } from "@/lib/crypto/vault";
import { auditSecurityEvent } from "@/lib/security/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const normalizedPlatform = provider.toUpperCase() as SocialPlatform;

    if (!["YOUTUBE", "INSTAGRAM", "X"].includes(normalizedPlatform)) {
      return NextResponse.json(
        { success: false, error: `Unsupported platform: ${provider}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");
    const oauthErrorDesc = searchParams.get("error_description");

    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";

    // 1. Handle OAuth provider error / cancellation
    if (oauthError) {
      console.warn(`OAuth authorization rejected by ${provider}: ${oauthError} - ${oauthErrorDesc}`);
      return NextResponse.redirect(
        `${baseUrl}/channels?error=${encodeURIComponent(oauthErrorDesc || oauthError)}`
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { success: false, error: "Missing required 'code' or 'state' parameter" },
        { status: 400 }
      );
    }

    // 2. Cryptographic state verification (Anti-CSRF & session fixation protection)
    let statePayload;
    try {
      statePayload = verifyOAuthState(state);
    } catch (stateErr) {
      const err = stateErr as OAuthStateError;
      auditSecurityEvent({
        type: "SECURITY_AUDIT",
        event: "OAUTH_CSRF_REJECTED",
        details: { provider, error: err.message },
      });
      return NextResponse.redirect(
        `${baseUrl}/channels?error=${encodeURIComponent("OAuth CSRF validation failed: " + err.message)}`
      );
    }

    if (statePayload.platform !== normalizedPlatform) {
      return NextResponse.json(
        { success: false, error: "State platform mismatch" },
        { status: 400 }
      );
    }

    // 3. Authenticate current user session and ensure tenant match
    const session = await authenticateRequest(request);
    if (session.userId !== statePayload.userId) {
      auditSecurityEvent({
        type: "SECURITY_AUDIT",
        event: "CROSS_TENANT_ATTEMPT",
        userId: session.userId,
        workspaceId: statePayload.workspaceId,
        details: { reason: "User session does not match OAuth state initiator" },
      });
      return NextResponse.redirect(
        `${baseUrl}/channels?error=${encodeURIComponent("OAuth session mismatch: Please re-authenticate.")}`
      );
    }

    // 4. Verify workspace authorization
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      statePayload.workspaceId,
      "channels:connect"
    );

    // 5. Exchange code for credentials via social provider adapter
    const socialMode = (process.env.NEXT_PUBLIC_SOCIAL_MODE as "mock" | "live") || "mock";
    const providerInstance = getSocialProvider(normalizedPlatform, socialMode);
    const authResult = await providerInstance.exchangeCode(code);

    // 6. Find or initialize account record
    const existing = await db.account.findFirst({
      where: {
        workspaceId: membership.workspaceId,
        platform: normalizedPlatform,
        platformAccountId: authResult.platformAccountId,
      },
    });

    const accountId =
      existing?.id ||
      `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    // 7. Store credentials in AES-256-GCM Token Vault
    const encryptedAccess = TokenVault.encrypt(authResult.accessToken, accountId, "v1");
    const encryptedRefresh = authResult.refreshToken
      ? TokenVault.encrypt(authResult.refreshToken, accountId, "v1")
      : null;

    if (existing) {
      await db.account.update({
        where: { id: existing.id },
        data: {
          username: authResult.username,
          displayName: authResult.displayName,
          avatarUrl: authResult.avatarUrl,
          followersCount: authResult.followersCount,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenKeyVersion: "v1",
          status: "ACTIVE",
          isMock: socialMode === "mock",
          updatedAt: new Date(),
        },
      });
    } else {
      await db.account.create({
        data: {
          id: accountId,
          workspaceId: membership.workspaceId,
          platform: normalizedPlatform,
          platformAccountId: authResult.platformAccountId,
          username: authResult.username,
          displayName: authResult.displayName,
          avatarUrl: authResult.avatarUrl,
          followersCount: authResult.followersCount,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenKeyVersion: "v1",
          status: "ACTIVE",
          isMock: socialMode === "mock",
        },
      });
    }

    // 8. Audit event
    auditSecurityEvent({
      type: "SECURITY_AUDIT",
      event: "CHANNEL_CONNECTED",
      userId: session.userId,
      workspaceId: membership.workspaceId,
      resourceId: accountId,
      details: {
        platform: normalizedPlatform,
        username: authResult.username,
        isMock: socialMode === "mock",
      },
    });

    const redirectUrl = `${baseUrl}/channels?status=connected&platform=${normalizedPlatform}`;
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return handleAuthApiError(error);
  }
}
