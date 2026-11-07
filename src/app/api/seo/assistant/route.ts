import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import { AiSeoService, UnsupportedAiModelError } from "@/services/ai-seo.service";
import { SocialPlatform } from "@/providers/types";

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const body = await request.json();
    const {
      content,
      topic,
      targetPlatform,
      workspaceId: requestedWorkspaceId,
      allowHeuristicFallback = true,
    } = body as {
      content?: string;
      topic?: string;
      targetPlatform?: SocialPlatform;
      workspaceId?: string;
      allowHeuristicFallback?: boolean;
    };

    const targetWorkspaceId = requestedWorkspaceId || session.activeWorkspaceId;
    await authorizeWorkspaceAccess(session.userId, targetWorkspaceId, "posts:create");

    if (typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Content string is required" },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        {
          success: false,
          error: "Input content exceeds maximum allowed length of 5000 characters.",
        },
        { status: 400 }
      );
    }

    const result = await AiSeoService.generateSuggestions({
      content,
      topic,
      targetPlatform,
      workspaceId: targetWorkspaceId,
      allowHeuristicFallback,
    });

    return NextResponse.json({
      success: true,
      assistant: result,
    });
  } catch (error) {
    if (error instanceof UnsupportedAiModelError) {
      return NextResponse.json(
        { success: false, error: error.message, model: error.model },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.includes("quota exceeded")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429 }
      );
    }
    return handleAuthApiError(error);
  }
}
