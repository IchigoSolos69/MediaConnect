import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SocialPlatform } from "@/providers/types";

export interface MediaValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
  width?: number;
  height?: number;
  durationSeconds?: number;
  targetPlatform?: SocialPlatform;
  format?: "POST" | "REEL" | "SHORT" | "STORY";
}

export interface MediaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedType: "image" | "video" | "unknown";
  aspectRatio?: number;
  recommendedPlatforms: SocialPlatform[];
}

export class MediaValidationError extends Error {
  public errors: string[];
  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "MediaValidationError";
    this.errors = errors;
  }
}

export class StorageSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSecurityError";
  }
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

export interface StorageUploadResult {
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
  mimeType: string;
  etag?: string;
  createdAt: Date;
}

export interface StorageHeadResult {
  exists: boolean;
  sizeBytes: number;
  contentType?: string;
}

export interface IStorageProvider {
  upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    workspaceId: string
  ): Promise<StorageUploadResult>;
  read(storageKey: string, workspaceId: string): Promise<Buffer>;
  head(storageKey: string, workspaceId: string): Promise<StorageHeadResult>;
  delete(storageKey: string, workspaceId: string): Promise<boolean>;
  getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    workspaceId: string,
    expiresInSeconds?: number
  ): Promise<string>;
  getPublicUrl(storageKey: string): string;
}

/**
 * Sanitizes untrusted workspace IDs or path segments.
 */
export function sanitizeStorageSegment(input: string): string {
  if (!input || typeof input !== "string") {
    throw new StorageSecurityError("Invalid or empty storage identifier");
  }
  if (input.includes("..") || input.includes("/") || input.includes("\\") || input.includes("\0")) {
    throw new StorageSecurityError(`Path traversal attempt rejected in identifier: ${input}`);
  }
  const cleaned = input.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned) {
    throw new StorageSecurityError("Storage identifier contains no valid characters");
  }
  return cleaned;
}

/**
 * Verifies that a storageKey belongs to the authorized workspace and contains no traversal segments.
 */
export function assertTenantStorageScope(storageKey: string, workspaceId: string): string {
  const safeWorkspace = sanitizeStorageSegment(workspaceId);
  if (!storageKey || storageKey.includes("..") || storageKey.includes("\\") || storageKey.includes("\0")) {
    throw new StorageSecurityError(`Invalid storage key rejected: ${storageKey}`);
  }
  const normalized = storageKey.replace(/^\/+/, "");
  const expectedPrefix1 = `${safeWorkspace}/`;
  const expectedPrefix2 = `workspaces/${safeWorkspace}/`;

  if (!normalized.startsWith(expectedPrefix1) && !normalized.startsWith(expectedPrefix2)) {
    throw new StorageSecurityError(
      `Tenant isolation violation: Storage key '${storageKey}' does not belong to workspace '${safeWorkspace}'`
    );
  }
  return normalized;
}

/**
 * Checks whether an IPv4 or IPv6 literal or hostname resolves to a private, loopback, link-local, or cloud metadata address.
 */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!lower) return true;

  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "metadata.google.internal" ||
    lower === "instance-data" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc00:") ||
    lower.startsWith("fd00:") ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.") ||
    lower.startsWith("::ffff:169.254.")
  ) {
    return true;
  }

  // Check IPv4 numeric ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map((x) => parseInt(x, 10));
    if (octets.some((o) => o < 0 || o > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
    if (a === 192 && b === 168) return true; // RFC 1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return true; // Disallow raw IP literals for remote media URLs; require verified DNS hostnames
  }

  // Disallow raw IPv6 literals
  if (lower.includes(":")) {
    return true;
  }

  return false;
}

/**
 * Returns the set of allowed remote HTTPS media hostnames configured for this deployment.
 */
export function getAllowedMediaHosts(): Set<string> {
  const allowed = new Set<string>([
    "cdn.mediaconnect.io",
    "media.mediaconnect.io",
    "images.unsplash.com",
  ]);

  const envUrls = [process.env.STORAGE_PUBLIC_BASE_URL, process.env.S3_ENDPOINT];
  for (const rawUrl of envUrls) {
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname && !isPrivateOrInternalHost(parsed.hostname)) {
          allowed.add(parsed.hostname.toLowerCase());
        }
      } catch {
        // Ignore invalid URL in env
      }
    }
  }

  if (process.env.ALLOWED_MEDIA_HOSTS) {
    for (const host of process.env.ALLOWED_MEDIA_HOSTS.split(",")) {
      const cleaned = host.trim().toLowerCase();
      if (cleaned && !isPrivateOrInternalHost(cleaned)) {
        allowed.add(cleaned);
      }
    }
  }

  return allowed;
}

/**
 * Validates that a remote media URL is safe from SSRF, uses HTTPS, belongs to the allowed media hosts,
 * and does not cross workspace tenant boundaries when referencing workspace-prefixed objects.
 */
export function validateSafeRemoteMediaUrl(mediaUrl: string, authorizedWorkspaceId?: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new StorageSecurityError(`Invalid media URL format: ${mediaUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new StorageSecurityError(
      `SSRF protection: Only HTTPS remote media URLs are permitted (received protocol '${parsed.protocol}').`
    );
  }

  if (parsed.username || parsed.password) {
    throw new StorageSecurityError("SSRF protection: Media URLs must not contain embedded credentials.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrInternalHost(hostname)) {
    throw new StorageSecurityError(
      `SSRF protection: Access to internal, loopback, private, or IP-literal host '${hostname}' is forbidden.`
    );
  }

  const allowedHosts = getAllowedMediaHosts();
  const isAllowedHost =
    allowedHosts.has(hostname) ||
    hostname.endsWith(".r2.cloudflarestorage.com") ||
    hostname.endsWith(".amazonaws.com");

  if (!isAllowedHost) {
    throw new StorageSecurityError(
      `SSRF protection: Host '${hostname}' is not in the authorized media storage allowlist.`
    );
  }

  if (parsed.pathname.includes("..") || parsed.pathname.includes("\\")) {
    throw new StorageSecurityError("Path traversal sequence detected in remote media URL.");
  }

  // If the URL path references a workspace-scoped storage path (e.g., /workspaces/<wsId>/... or /uploads/<wsId>/...),
  // enforce that <wsId> matches the post's authorized workspaceId!
  if (authorizedWorkspaceId) {
    const safeWs = sanitizeStorageSegment(authorizedWorkspaceId);
    const wsMatch = /\/(?:workspaces|uploads)\/([^/]+)\//.exec(parsed.pathname);
    if (wsMatch && wsMatch[1] !== safeWs) {
      throw new StorageSecurityError(
        `Tenant isolation violation: Media URL belongs to workspace '${wsMatch[1]}', but post belongs to '${safeWs}'.`
      );
    }
  }

  return parsed;
}

/**
 * Downloads remote media with SSRF protections, redirect blocking, timeout, and strict byte-size cap.
 */
export async function fetchSafeRemoteMedia(
  mediaUrl: string,
  options?: {
    authorizedWorkspaceId?: string;
    maxBytes?: number;
    timeoutMs?: number;
  }
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const maxBytes = options?.maxBytes ?? 100 * 1024 * 1024; // 100 MB cap
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const validatedUrl = validateSafeRemoteMediaUrl(mediaUrl, options?.authorizedWorkspaceId);

  const res = await fetch(validatedUrl.toString(), {
    method: "GET",
    redirect: "error", // Never follow open redirects to internal/private endpoints
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Failed to download video media from ${validatedUrl.origin} (HTTP ${res.status})`);
  }

  const contentLengthHeader = res.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredBytes = parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new StorageSecurityError(
        `Remote media Content-Length (${declaredBytes} bytes) exceeds maximum allowed limit (${maxBytes} bytes).`
      );
    }
  }

  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > maxBytes) {
    throw new StorageSecurityError(
      `Downloaded media size (${arrayBuf.byteLength} bytes) exceeds maximum allowed limit (${maxBytes} bytes).`
    );
  }

  return {
    buffer: Buffer.from(arrayBuf),
    contentType: res.headers.get("content-type"),
  };
}

/**
 * Inspects binary magic bytes to verify the buffer matches the claimed MIME type.
 */
export function verifyFileSignature(buffer: Buffer, mimeType: string): { valid: boolean; reason?: string } {
  if (!buffer || buffer.length < 8) {
    return { valid: false, reason: "File buffer is empty or smaller than minimum 8-byte header." };
  }

  if (mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "video/x-m4v") {
    if (buffer.length < 12) {
      return { valid: false, reason: "Video buffer too short to contain ISO BMFF / QuickTime container header." };
    }
    const boxType = buffer.subarray(4, 8).toString("ascii");
    const validBoxes = ["ftyp", "moov", "wide", "mdat", "free", "skip"];
    if (!validBoxes.includes(boxType)) {
      return {
        valid: false,
        reason: `Invalid video binary signature: expected ISO BMFF / QuickTime box ('ftyp'/'moov'), found '${boxType.replace(/[^\x20-\x7E]/g, "?")}'.`,
      };
    }
    return { valid: true };
  }

  if (mimeType === "image/jpeg") {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true };
    }
    return { valid: false, reason: "Invalid JPEG signature: missing FF D8 FF magic bytes." };
  }

  if (mimeType === "image/png") {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.subarray(0, 8).equals(pngSig)) {
      return { valid: true };
    }
    return { valid: false, reason: "Invalid PNG signature: missing 89 50 4E 47 0D 0A 1A 0A magic bytes." };
  }

  if (mimeType === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return { valid: true };
    }
    return { valid: false, reason: "Invalid GIF signature: expected GIF87a or GIF89a header." };
  }

  if (mimeType === "image/webp") {
    if (buffer.length >= 12) {
      const riff = buffer.subarray(0, 4).toString("ascii");
      const webp = buffer.subarray(8, 12).toString("ascii");
      if (riff === "RIFF" && webp === "WEBP") {
        return { valid: true };
      }
    }
    return { valid: false, reason: "Invalid WebP signature: expected RIFF....WEBP header." };
  }

  return { valid: false, reason: `Unsupported MIME type for signature inspection: ${mimeType}` };
}

/**
 * Local File System Storage Provider
 * Zero-cost, self-contained development and test storage adapter with strict tenant boundary enforcement.
 */
export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(
      /*turbopackIgnore: true*/ baseDir || path.join(process.cwd(), "public", "uploads")
    );
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(storageKey: string, workspaceId: string): string {
    const normalizedKey = assertTenantStorageScope(storageKey, workspaceId);
    const resolved = path.resolve(/*turbopackIgnore: true*/ this.baseDir, normalizedKey);
    if (!resolved.startsWith(this.baseDir + path.sep)) {
      throw new StorageSecurityError("Path traversal outside base storage directory blocked");
    }
    return resolved;
  }

  async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    workspaceId: string
  ): Promise<StorageUploadResult> {
    const safeWorkspace = sanitizeStorageSegment(workspaceId);
    const rawExt = path.extname(path.basename(filename)).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : ".bin";
    const baseName =
      path
        .basename(filename, rawExt)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64) || "media";
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const safeStorageKey = `${safeWorkspace}/${baseName}_${uniqueId}${safeExt}`;

    const fullPath = this.resolveSafePath(safeStorageKey, safeWorkspace);
    const parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);
    const etag = crypto.createHash("md5").update(buffer).digest("hex");

    return {
      storageKey: safeStorageKey,
      publicUrl: this.getPublicUrl(safeStorageKey),
      sizeBytes: buffer.length,
      mimeType,
      etag,
      createdAt: new Date(),
    };
  }

  async read(storageKey: string, workspaceId: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storageKey, workspaceId);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Storage object not found: ${storageKey}`);
    }
    return await fs.promises.readFile(fullPath);
  }

  async head(storageKey: string, workspaceId: string): Promise<StorageHeadResult> {
    const fullPath = this.resolveSafePath(storageKey, workspaceId);
    if (!fs.existsSync(fullPath)) {
      return { exists: false, sizeBytes: 0 };
    }
    const stat = await fs.promises.stat(fullPath);
    return {
      exists: stat.isFile(),
      sizeBytes: stat.size,
    };
  }

  async delete(storageKey: string, workspaceId: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(storageKey, workspaceId);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      const parentDir = path.dirname(fullPath);
      if (parentDir !== this.baseDir) {
        const remaining = await fs.promises.readdir(parentDir).catch(() => ["nonempty"]);
        if (remaining.length === 0) {
          await fs.promises.rmdir(parentDir).catch(() => {});
        }
      }
      return true;
    }
    return false;
  }

  async getPresignedUploadUrl(
    storageKey: string,
    _mimeType: string,
    workspaceId: string,
    expiresInSeconds = 900
  ): Promise<string> {
    const normalized = assertTenantStorageScope(storageKey, workspaceId);
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = crypto
      .createHmac("sha256", process.env.AUTH_SECRET || "local_storage_secret")
      .update(`${normalized}:${expires}`)
      .digest("hex");
    return `/api/media/upload?key=${encodeURIComponent(normalized)}&expires=${expires}&signature=${sig}`;
  }

  getPublicUrl(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, "/");
    return `/uploads/${normalized}`;
  }
}

/**
 * AWS Signature Version 4 (SigV4) helper for S3 and Cloudflare R2 REST APIs.
 */
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service = "s3"): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Working S3 / Cloudflare R2 Storage Provider using AWS Signature Version 4.
 * Performs genuine PUT, GET, HEAD, DELETE HTTP requests and generates RFC-compliant presigned URLs.
 */
export class S3CompatibleStorageProvider implements IStorageProvider {
  private bucket: string;
  private region: string;
  private endpoint: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private publicBaseUrl: string;

  constructor(config?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
  }) {
    this.bucket = config?.bucket || process.env.S3_BUCKET || "";
    this.region = config?.region || process.env.S3_REGION || "auto";
    this.accessKeyId = config?.accessKeyId || process.env.S3_ACCESS_KEY_ID || "";
    this.secretAccessKey = config?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || "";
    this.endpoint = (
      config?.endpoint ||
      process.env.S3_ENDPOINT ||
      (this.bucket ? `https://s3.${this.region}.amazonaws.com` : "")
    ).replace(/\/+$/, "");
    this.publicBaseUrl = (
      config?.publicBaseUrl ||
      process.env.STORAGE_PUBLIC_BASE_URL ||
      (this.endpoint && this.bucket ? `${this.endpoint}/${this.bucket}` : "")
    ).replace(/\/+$/, "");
  }

  private assertConfigured(): void {
    if (!this.bucket || !this.accessKeyId || !this.secretAccessKey || !this.endpoint) {
      throw new StorageConfigurationError(
        "S3/R2 storage provider is not configured: S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required."
      );
    }
  }

  private buildSignedRequest(
    method: "PUT" | "GET" | "HEAD" | "DELETE",
    storageKey: string,
    payload: Buffer | string = "",
    contentType?: string
  ): { url: string; headers: Record<string, string> } {
    this.assertConfigured();

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const encodedKey = storageKey
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    const parsedEndpoint = new URL(this.endpoint);
    const basePath = parsedEndpoint.pathname.replace(/\/+$/, "");
    const canonicalUri = `${basePath}/${encodeURIComponent(this.bucket)}/${encodedKey}`;
    const url = `${parsedEndpoint.origin}${canonicalUri}`;

    const payloadHash = sha256Hex(payload);
    const headers: Record<string, string> = {
      host: parsedEndpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };

    if (contentType) {
      headers["content-type"] = contentType;
    }

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
    const signedHeaders = sortedHeaderKeys.join(";");

    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = getSigningKey(this.secretAccessKey, dateStamp, this.region, "s3");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    headers["Authorization"] =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { url, headers };
  }

  async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    workspaceId: string
  ): Promise<StorageUploadResult> {
    this.assertConfigured();
    const safeWorkspace = sanitizeStorageSegment(workspaceId);
    const rawExt = path.extname(path.basename(filename)).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : ".bin";
    const baseName =
      path
        .basename(filename, rawExt)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64) || "media";
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const storageKey = `workspaces/${safeWorkspace}/${baseName}_${uniqueId}${safeExt}`;

    const { url, headers } = this.buildSignedRequest("PUT", storageKey, buffer, mimeType);
    headers["content-length"] = String(buffer.length);

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`S3/R2 PUT object failed (${res.status}): ${errText}`);
    }

    const etag = res.headers.get("etag")?.replace(/"/g, "") || undefined;

    return {
      storageKey,
      publicUrl: this.getPublicUrl(storageKey),
      sizeBytes: buffer.length,
      mimeType,
      etag,
      createdAt: new Date(),
    };
  }

  async read(storageKey: string, workspaceId: string): Promise<Buffer> {
    this.assertConfigured();
    const normalized = assertTenantStorageScope(storageKey, workspaceId);
    const { url, headers } = this.buildSignedRequest("GET", normalized);

    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      throw new Error(`S3/R2 GET object failed (${res.status}) for key: ${normalized}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async head(storageKey: string, workspaceId: string): Promise<StorageHeadResult> {
    this.assertConfigured();
    const normalized = assertTenantStorageScope(storageKey, workspaceId);
    const { url, headers } = this.buildSignedRequest("HEAD", normalized);

    const res = await fetch(url, {
      method: "HEAD",
      headers,
    });

    if (res.status === 404) {
      return { exists: false, sizeBytes: 0 };
    }

    if (!res.ok) {
      throw new Error(`S3/R2 HEAD object failed (${res.status}) for key: ${normalized}`);
    }

    return {
      exists: true,
      sizeBytes: parseInt(res.headers.get("content-length") || "0", 10),
      contentType: res.headers.get("content-type") || undefined,
    };
  }

  async delete(storageKey: string, workspaceId: string): Promise<boolean> {
    this.assertConfigured();
    const normalized = assertTenantStorageScope(storageKey, workspaceId);
    const { url, headers } = this.buildSignedRequest("DELETE", normalized);

    const res = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (res.status === 404) {
      return false;
    }

    if (!res.ok && res.status !== 204) {
      const errText = await res.text();
      throw new Error(`S3/R2 DELETE object failed (${res.status}): ${errText}`);
    }

    return true;
  }

  async getPresignedUploadUrl(
    storageKey: string,
    _mimeType: string,
    workspaceId: string,
    expiresInSeconds = 900
  ): Promise<string> {
    this.assertConfigured();
    const normalized = assertTenantStorageScope(storageKey, workspaceId);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const parsedEndpoint = new URL(this.endpoint);
    const basePath = parsedEndpoint.pathname.replace(/\/+$/, "");
    const encodedKey = normalized
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const canonicalUri = `${basePath}/${encodeURIComponent(this.bucket)}/${encodedKey}`;

    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    });
    queryParams.sort();

    const canonicalQueryString = queryParams.toString();
    const canonicalHeaders = `host:${parsedEndpoint.host}\n`;
    const canonicalRequest = [
      "PUT",
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = getSigningKey(this.secretAccessKey, dateStamp, this.region, "s3");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    return `${parsedEndpoint.origin}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }

  getPublicUrl(storageKey: string): string {
    this.assertConfigured();
    return `${this.publicBaseUrl}/${storageKey}`;
  }
}

/**
 * High-Level Media Storage & Validation Service
 */
export class StorageService {
  private static providerInstance: IStorageProvider | null = null;

  static getProvider(): IStorageProvider {
    if (!this.providerInstance) {
      const providerType = process.env.STORAGE_PROVIDER || "local";
      if (providerType === "s3" || providerType === "r2") {
        this.providerInstance = new S3CompatibleStorageProvider();
      } else {
        this.providerInstance = new LocalStorageProvider();
      }
    }
    return this.providerInstance;
  }

  static setProvider(provider: IStorageProvider | null): void {
    this.providerInstance = provider;
  }

  /**
   * Validates media against social platform technical specifications, including magic-byte file signatures.
   */
  static validateMedia(input: MediaValidationInput): MediaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendedPlatforms: SocialPlatform[] = [];

    const isVideo = input.mimeType.startsWith("video/");
    const isImage = input.mimeType.startsWith("image/");
    const detectedType = isVideo ? "video" : isImage ? "image" : "unknown";

    // 1. MIME Type verification
    const allowedVideoMimes = ["video/mp4", "video/quicktime", "video/x-m4v"];
    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (isVideo && !allowedVideoMimes.includes(input.mimeType)) {
      errors.push(`Unsupported video format: ${input.mimeType}. Use MP4 or MOV.`);
    } else if (isImage && !allowedImageMimes.includes(input.mimeType)) {
      errors.push(`Unsupported image format: ${input.mimeType}. Use JPG, PNG, or WebP.`);
    } else if (!isVideo && !isImage) {
      errors.push(`Invalid media file type: ${input.mimeType}. Only video and images are accepted.`);
    }

    // 2. Binary file signature (magic bytes) verification when buffer is supplied
    if (input.buffer && errors.length === 0) {
      const sigCheck = verifyFileSignature(input.buffer, input.mimeType);
      if (!sigCheck.valid) {
        errors.push(sigCheck.reason || "Binary file signature does not match declared MIME type.");
      }
    }

    // 3. File size caps
    const maxVideoBytes = 100 * 1024 * 1024; // 100 MB
    const maxImageBytes = 10 * 1024 * 1024; // 10 MB

    if (input.sizeBytes <= 0) {
      errors.push("Media file cannot be empty (0 bytes).");
    }
    if (isVideo && input.sizeBytes > maxVideoBytes) {
      errors.push(`Video file size (${(input.sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MB limit.`);
    }
    if (isImage && input.sizeBytes > maxImageBytes) {
      errors.push(`Image file size (${(input.sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds 10 MB limit.`);
    }

    // 4. Aspect Ratio Checks
    let aspectRatio: number | undefined;
    if (input.width !== undefined && input.height !== undefined) {
      if (input.width <= 0 || input.height <= 0) {
        errors.push("Media dimensions (width and height) must be positive integers.");
      } else {
        aspectRatio = Number((input.width / input.height).toFixed(4));

        const isVertical = aspectRatio < 0.75; // 9:16 is ~0.5625
        const isSquare = aspectRatio >= 0.95 && aspectRatio <= 1.05; // 1:1
        const isPortrait = aspectRatio >= 0.75 && aspectRatio < 0.95; // 4:5 is 0.8
        const isWidescreen = aspectRatio > 1.6; // 16:9 is 1.777

        if (input.targetPlatform === "YOUTUBE") {
          if (input.format === "SHORT") {
            if (!isVertical) {
              errors.push(
                `YouTube Shorts requires a vertical 9:16 aspect ratio (detected ${aspectRatio}:1).`
              );
            }
            if (input.durationSeconds && input.durationSeconds > 180) {
              errors.push(
                `YouTube Shorts maximum duration is 180 seconds (3 minutes; video is ${input.durationSeconds}s).`
              );
            }
          } else if (!isWidescreen) {
            warnings.push(
              `YouTube standard videos perform best at 16:9 widescreen (detected ${aspectRatio}:1). Video will have pillarboxes.`
            );
          }
        }

        if (input.targetPlatform === "INSTAGRAM") {
          if (input.format === "REEL") {
            if (!isVertical) {
              errors.push(
                `Instagram Reels requires a vertical 9:16 aspect ratio (detected ${aspectRatio}:1).`
              );
            }
            if (input.durationSeconds && input.durationSeconds > 90) {
              errors.push(`Instagram Reels maximum duration is 90 seconds (video is ${input.durationSeconds}s).`);
            }
          } else if (!isSquare && !isPortrait && !isWidescreen) {
            warnings.push(
              `Instagram feed supports 1:1 square, 4:5 portrait, or 1.91:1 landscape. Aspect ratio ${aspectRatio}:1 will be automatically cropped.`
            );
          }
        }

        if (isVertical) {
          recommendedPlatforms.push("INSTAGRAM", "YOUTUBE");
        } else if (isWidescreen) {
          recommendedPlatforms.push("YOUTUBE", "X");
        } else if (isSquare || isPortrait) {
          recommendedPlatforms.push("INSTAGRAM", "X");
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      detectedType,
      aspectRatio,
      recommendedPlatforms,
    };
  }

  /**
   * Validates file signature, MIME type, dimensions, and size, then uploads to the active provider.
   */
  static async uploadMedia(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    workspaceId: string,
    validationInput?: Partial<MediaValidationInput>
  ): Promise<StorageUploadResult> {
    const validation = this.validateMedia({
      filename,
      mimeType,
      sizeBytes: buffer.length,
      buffer,
      ...validationInput,
    });

    if (!validation.isValid) {
      throw new MediaValidationError(
        `Media validation failed: ${validation.errors.join(", ")}`,
        validation.errors
      );
    }

    const provider = this.getProvider();
    return await provider.upload(buffer, filename, mimeType, workspaceId);
  }
}
