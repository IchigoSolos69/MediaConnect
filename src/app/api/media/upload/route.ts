import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  authorizeWorkspaceAccess,
  handleAuthApiError,
} from "@/lib/auth/server";
import {
  StorageService,
  MediaValidationError,
  StorageSecurityError,
  StorageConfigurationError,
  assertTenantStorageScope,
  verifyFileSignature,
} from "@/services/storage.service";
import { SocialPlatform } from "@/providers/types";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // 100 MB limit

async function readBoundedBuffer(
  req: NextRequest,
  maxBytes = MAX_MEDIA_BYTES,
  timeoutMs = 30_000
): Promise<Buffer> {
  if (!req.body) {
    return Buffer.alloc(0);
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  let timerId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Upload stream timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);
  });

  const readStream = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new StorageSecurityError(
              `Upload stream exceeded maximum allowed limit of ${maxBytes} bytes.`
            );
          }
          chunks.push(value);
        }
      }
      return Buffer.concat(chunks);
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  return await Promise.race([readStream(), timeoutPromise]);
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const declaredBytes = parseInt(contentLength, 10);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_MEDIA_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Payload too large. Declared size (${declaredBytes} bytes) exceeds maximum limit (${MAX_MEDIA_BYTES} bytes).`,
          },
          { status: 413 }
        );
      }
    }

    const session = await authenticateRequest(request);
    const contentType = request.headers.get("content-type") || "";

    let buffer: Buffer;
    let filename = "upload.bin";
    let mimeType = "application/octet-stream";
    let requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId") || undefined;
    let targetPlatform: SocialPlatform | undefined;
    let format: "POST" | "REEL" | "SHORT" | "STORY" | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let durationSeconds: number | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Multipart form-data must include a 'file' field." },
          { status: 400 }
        );
      }

      if (file.size > MAX_MEDIA_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `File size (${file.size} bytes) exceeds maximum allowed limit (${MAX_MEDIA_BYTES} bytes).`,
          },
          { status: 413 }
        );
      }

      const arrayBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      filename = (file as File).name || String(formData.get("filename") || "upload.bin");
      mimeType = file.type || String(formData.get("mimeType") || "application/octet-stream");

      if (formData.get("workspaceId")) {
        requestedWorkspaceId = String(formData.get("workspaceId"));
      }
      if (formData.get("targetPlatform")) {
        targetPlatform = String(formData.get("targetPlatform")).toUpperCase() as SocialPlatform;
      }
      if (formData.get("format")) {
        format = String(formData.get("format")).toUpperCase() as "POST" | "REEL" | "SHORT" | "STORY";
      }
      if (formData.get("width")) width = Number(formData.get("width"));
      if (formData.get("height")) height = Number(formData.get("height"));
      if (formData.get("durationSeconds")) durationSeconds = Number(formData.get("durationSeconds"));
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body.base64Data || !body.filename || !body.mimeType) {
        return NextResponse.json(
          {
            success: false,
            error: "JSON media upload requires filename, mimeType, and base64Data.",
          },
          { status: 400 }
        );
      }
      buffer = Buffer.from(String(body.base64Data), "base64");
      if (buffer.length > MAX_MEDIA_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Decoded base64 data (${buffer.length} bytes) exceeds maximum allowed limit (${MAX_MEDIA_BYTES} bytes).`,
          },
          { status: 413 }
        );
      }
      filename = String(body.filename);
      mimeType = String(body.mimeType);
      requestedWorkspaceId = body.workspaceId || requestedWorkspaceId;
      targetPlatform = body.targetPlatform;
      format = body.format;
      width = body.width;
      height = body.height;
      durationSeconds = body.durationSeconds;
    } else {
      buffer = await readBoundedBuffer(request, MAX_MEDIA_BYTES);
      filename = request.headers.get("x-filename") || "upload.bin";
      mimeType = contentType.split(";")[0].trim() || "application/octet-stream";
    }

    const targetWorkspaceId = requestedWorkspaceId || session.activeWorkspaceId;

    // Enforce workspace membership and posts:create permission
    const membership = await authorizeWorkspaceAccess(
      session.userId,
      targetWorkspaceId,
      "posts:create"
    );

    const uploadResult = await StorageService.uploadMedia(
      buffer,
      filename,
      mimeType,
      membership.workspaceId,
      {
        targetPlatform,
        format,
        width,
        height,
        durationSeconds,
      }
    );

    return NextResponse.json({
      success: true,
      media: uploadResult,
      workspaceId: membership.workspaceId,
    });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, errors: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof StorageSecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    return handleAuthApiError(error);
  }
}

/**
 * Handles presigned PUT uploads for local storage URLs (/api/media/upload?key=...&expires=...&signature=...).
 */
export async function PUT(request: NextRequest) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const declaredBytes = parseInt(contentLength, 10);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_MEDIA_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Payload too large. Declared size (${declaredBytes} bytes) exceeds maximum limit (${MAX_MEDIA_BYTES} bytes).`,
          },
          { status: 413 }
        );
      }
    }

    const session = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key") || "";
    const expiresStr = searchParams.get("expires") || "";
    const signature = searchParams.get("signature") || "";
    const requestedWorkspaceId = searchParams.get("workspaceId") || session.activeWorkspaceId;

    const membership = await authorizeWorkspaceAccess(
      session.userId,
      requestedWorkspaceId,
      "posts:create"
    );

    if (!key || !expiresStr || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing presigned upload parameters (key, expires, signature)." },
        { status: 400 }
      );
    }

    // Verify key belongs to the authorized workspace
    const normalizedKey = assertTenantStorageScope(key, membership.workspaceId);

    const expires = parseInt(expiresStr, 10);
    if (!Number.isFinite(expires) || Math.floor(Date.now() / 1000) > expires) {
      return NextResponse.json(
        { success: false, error: "Presigned upload URL has expired." },
        { status: 403 }
      );
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.AUTH_SECRET || "local_storage_secret")
      .update(`${normalizedKey}:${expires}`)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json(
        { success: false, error: "Invalid presigned upload signature." },
        { status: 403 }
      );
    }

    const buffer = await readBoundedBuffer(request, MAX_MEDIA_BYTES);
    const mimeType =
      request.headers.get("content-type")?.split(";")[0].trim() || "video/mp4";

    const sigCheck = verifyFileSignature(buffer, mimeType);
    if (!sigCheck.valid) {
      return NextResponse.json(
        { success: false, error: sigCheck.reason || "Binary file signature verification failed." },
        { status: 400 }
      );
    }

    const uploadResult = await StorageService.writeMedia(
      normalizedKey,
      buffer,
      mimeType,
      membership.workspaceId
    );

    return NextResponse.json({
      success: true,
      media: uploadResult,
      workspaceId: membership.workspaceId,
    });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, errors: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof StorageSecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return handleAuthApiError(error);
  }
}
