import { db } from "@/lib/db";

/**
 * Validates whether a string is a valid IPv4 or IPv6 address.
 */
function isValidIp(ip: string): boolean {
  const ipv4Pattern =
    /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6Pattern =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

/**
 * Safely extracts client IP from request headers establishing a trusted proxy boundary.
 * Evaluates provider-verified headers first, then rightmost untrusted hop in X-Forwarded-For.
 */
export function getSafeClientIp(request: { headers: Headers }): string {
  // 1. Cloudflare direct verified connecting IP
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return cfConnectingIp;
  }

  // 2. Parse X-Forwarded-For: select rightmost validated IP to defeat client spoofing
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor
      .split(",")
      .map((p) => p.trim())
      .filter((ip) => isValidIp(ip) && ip !== "unknown");
    if (ips.length > 0) {
      // Rightmost IP is appended by the nearest trusted gateway/reverse proxy
      return ips[ips.length - 1];
    }
  }

  // 3. Fallback to X-Real-IP
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  return "127.0.0.1";
}

/**
 * Durable rate limiter backed by database storage.
 * Enforces atomic increments and fail-closed defense during backend outages.
 */
export class DurableRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  /**
   * Checks whether the given key is currently rate limited.
   * In production, fails closed (allowed: false) if database check fails.
   */
  public async check(
    key: string
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
    const now = new Date();

    try {
      const record = await db.rateLimitAttempt.findUnique({
        where: { key },
      });

      if (!record || record.expiresAt <= now) {
        return { allowed: true, remaining: this.maxAttempts, retryAfterSeconds: 0 };
      }

      const remaining = Math.max(0, this.maxAttempts - record.attempts);
      const retryAfterSeconds = Math.max(1, Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000));

      return {
        allowed: record.attempts < this.maxAttempts,
        remaining,
        retryAfterSeconds,
      };
    } catch (err: unknown) {
      console.error("[SECURITY ALERT] Rate limiter database check error:", (err as Error)?.message || err);
      // Fail closed in production to prevent brute-force attacks during database degradation
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      }
      return { allowed: true, remaining: this.maxAttempts, retryAfterSeconds: 0 };
    }
  }

  /**
   * Records a failed attempt for the key in durable database storage with atomic increment.
   */
  public async recordFailure(
    key: string
  ): Promise<{ remaining: number; retryAfterSeconds: number }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.windowMs);

    try {
      const existing = await db.rateLimitAttempt.findUnique({ where: { key } });

      if (existing && existing.expiresAt > now) {
        // Atomic database increment
        const updated = await db.rateLimitAttempt.update({
          where: { key },
          data: {
            attempts: { increment: 1 },
            lastAttemptAt: now,
          },
        });
        const remaining = Math.max(0, this.maxAttempts - updated.attempts);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((updated.expiresAt.getTime() - now.getTime()) / 1000)
        );
        return { remaining, retryAfterSeconds };
      } else {
        await db.rateLimitAttempt.upsert({
          where: { key },
          update: {
            attempts: 1,
            firstAttemptAt: now,
            lastAttemptAt: now,
            expiresAt,
          },
          create: {
            key,
            attempts: 1,
            firstAttemptAt: now,
            lastAttemptAt: now,
            expiresAt,
          },
        });
        return {
          remaining: this.maxAttempts - 1,
          retryAfterSeconds: Math.ceil(this.windowMs / 1000),
        };
      }
    } catch (err: unknown) {
      console.error("[SECURITY ALERT] Rate limiter recordFailure error:", (err as Error)?.message || err);
      return { remaining: 0, retryAfterSeconds: 60 };
    }
  }

  /**
   * Resets rate limit for a key upon successful authentication.
   */
  public async reset(key: string): Promise<void> {
    try {
      await db.rateLimitAttempt.deleteMany({
        where: { key },
      });
    } catch {
      // Ignore
    }
  }
}

// Global durable rate limiter: 5 failed attempts per 15 minutes
export const loginRateLimiter = new DurableRateLimiter(5, 15 * 60 * 1000);
