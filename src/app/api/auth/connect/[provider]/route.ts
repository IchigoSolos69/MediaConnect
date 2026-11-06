import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeWorkspaceAccess, handleAuthApiError } from "@/lib/auth/server";
import { getSocialProvider, SocialPlatform } from "@/providers";
import { createOAuthState } from "@/lib/auth/oauth-state";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    const { provider } = await params;
    const normalizedPlatform = provider.toUpperCase() as SocialPlatform;

    if (!["YOUTUBE", "INSTAGRAM", "X"].includes(normalizedPlatform)) {
      return NextResponse.json(
        { success: false, error: `Unsupported platform: ${provider}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    // Enforce role permission: only OWNER can connect/manage channels
    await authorizeWorkspaceAccess(session.userId, targetWorkspaceId, "channels:connect");

    // Generate tamper-evident signed CSRF state tied to active user and workspace
    const state = createOAuthState(targetWorkspaceId, session.userId, normalizedPlatform);

    const socialMode = (process.env.NEXT_PUBLIC_SOCIAL_MODE as "mock" | "live") || "mock";
    const providerInstance = getSocialProvider(normalizedPlatform, socialMode);
    const authUrl = await providerInstance.getAuthUrl(state);

    const format = searchParams.get("format");
    if (format === "json" || request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json({ success: true, authUrl });
    }

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return handleAuthApiError(error);
  }
}
