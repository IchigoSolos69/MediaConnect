import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, authorizeWorkspaceAccess, handleAuthApiError } from "@/lib/auth/server";
import { getSocialProvider, SocialPlatform, ProviderConfigurationError } from "@/providers";
import { consumeOAuthState, OAuthStateError } from "@/lib/auth/oauth-state";
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

    // 2. Authenticate current user session first
    const session = await authenticateRequest(request);

    // 3. Atomically verify and consume single-use OAuth state + retrieve PKCE verifier
    let consumedState;
    try {
      consumedState = await consumeOAuthState(state, normalizedPlatform, session.userId);
    } catch (stateErr) {
      const err = stateErr as OAuthStateError;
      const isSessionMismatch = err.message.includes("session mismatch");
      auditSecurityEvent({
        event: isSessionMismatch ? "CROSS_TENANT_ATTEMPT" : "OAUTH_CSRF_REJECTED",
        userId: session.userId,
        details: { provider: normalizedPlatform, error: err.message },
      });
      return NextResponse.redirect(
        `${baseUrl}/channels?error=${encodeURIComponent(err.message)}`
      );
    }

    // 4. Verify workspace authorization
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      consumedState.workspaceId,
      "channels:connect"
    );

    // 5. Enforce provider mode bound to OAuth state — NEVER trust callback query parameters to select mode
    const callbackModeParam = searchParams.get("mode");
    if (
      callbackModeParam &&
      (callbackModeParam === "mock" || callbackModeParam === "live") &&
      callbackModeParam !== consumedState.mode
    ) {
      auditSecurityEvent({
        event: "OAUTH_CSRF_REJECTED",
        userId: session.userId,
        workspaceId: membership.workspaceId,
        details: {
          provider: normalizedPlatform,
          reason: `OAuth callback mode tampering rejected: query mode '${callbackModeParam}' conflicts with state mode '${consumedState.mode}'`,
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: `OAuth mode tampering detected: callback query parameter mode='${callbackModeParam}' conflicts with state-bound mode='${consumedState.mode}'.`,
        },
        { status: 400 }
      );
    }

    const socialMode: "mock" | "live" = consumedState.mode;

    // 6. Exchange code (and PKCE code_verifier) for credentials via social provider adapter
    const providerInstance = getSocialProvider(normalizedPlatform, socialMode);
    const authResult = await providerInstance.exchangeCode(
      code,
      consumedState.codeVerifier || undefined
    );

    const tokenExpiresAt = new Date(Date.now() + authResult.expiresInSeconds * 1000);

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

    // 7. Store credentials in AES-256-GCM Token Vault bound to accountId AAD
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
          tokenExpiresAt,
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
          tokenExpiresAt,
          status: "ACTIVE",
          isMock: socialMode === "mock",
        },
      });
    }

    // 8. Audit event
    auditSecurityEvent({
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

    return NextResponse.redirect(
      `${baseUrl}/channels?status=connected&platform=${normalizedPlatform}`
    );
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      return NextResponse.json(
        { success: false, error: error.message, platform: error.platform },
        { status: 503 }
      );
    }
    return handleAuthApiError(error);
  }
}
