import path from "path";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import {
  StorageService,
  sanitizeStorageSegment,
  StorageSecurityError,
  StorageConfigurationError,
} from "@/services/storage.service";
import { SocialPlatform } from "@/providers/types";

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    const body = await request.json();

    const {
      filename,
      mimeType,
      sizeBytes,
      workspaceId: requestedWorkspaceId,
      targetPlatform,
      format,
      width,
      height,
      durationSeconds,
      expiresInSeconds = 900,
    } = body as {
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
      workspaceId?: string;
      targetPlatform?: SocialPlatform;
      format?: "POST" | "REEL" | "SHORT" | "STORY";
      width?: number;
      height?: number;
      durationSeconds?: number;
      expiresInSeconds?: number;
    };

    const targetWorkspaceId = requestedWorkspaceId || session.activeWorkspaceId;

    // Enforce workspace membership and posts:create permission
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "posts:create"
    );

    if (!filename || !mimeType || typeof sizeBytes !== "number") {
      return NextResponse.json(
        {
          success: false,
          error: "filename, mimeType, and numeric sizeBytes are required to presign an upload.",
        },
        { status: 400 }
      );
    }

    const validation = StorageService.validateMedia({
      filename,
      mimeType,
      sizeBytes,
      targetPlatform,
      format,
      width,
      height,
      durationSeconds,
    });

    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: `Media validation failed: ${validation.errors.join(", ")}`,
          validation,
        },
        { status: 400 }
      );
    }

    const safeWorkspace = sanitizeStorageSegment(membership.workspaceId);
    const rawExt = path.extname(path.basename(filename)).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : ".bin";
    const baseName =
      path
        .basename(filename, rawExt)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64) || "media";
    const uniqueId = crypto.randomBytes(8).toString("hex");

    const providerType = process.env.STORAGE_PROVIDER || "local";
    const storageKey =
      providerType === "s3" || providerType === "r2"
        ? `workspaces/${safeWorkspace}/${baseName}_${uniqueId}${safeExt}`
        : `${safeWorkspace}/${baseName}_${uniqueId}${safeExt}`;

    const provider = StorageService.getProvider();
    const boundedExpires = Math.min(3600, Math.max(60, Number(expiresInSeconds) || 900));
    const uploadUrl = await provider.getPresignedUploadUrl(
      storageKey,
      mimeType,
      membership.workspaceId,
      boundedExpires
    );
    const publicUrl = provider.getPublicUrl(storageKey);

    return NextResponse.json({
      success: true,
      uploadUrl,
      storageKey,
      publicUrl,
      workspaceId: membership.workspaceId,
      expiresInSeconds: boundedExpires,
      validation,
    });
  } catch (error) {
    if (error instanceof StorageSecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    return handleAuthApiError(error);
  }
}
