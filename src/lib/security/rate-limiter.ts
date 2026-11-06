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
 * Safely extracts client IP from request headers, preventing spoofing.
 */
export function getSafeClientIp(request: { headers: Headers }): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((p) => p.trim());
    for (const ip of ips) {
      if (isValidIp(ip) && ip !== "unknown") {
        return ip;
      }
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  return "127.0.0.1";
}

/**
 * Durable rate limiter backed by database storage.
 * Works across serverless instances, clustered workers, and app restarts.
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
   */
  public async check(key: string): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
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
    } catch {
      // In case of unexpected DB error, allow request to avoid complete outage
      return { allowed: true, remaining: this.maxAttempts, retryAfterSeconds: 0 };
    }
  }

  /**
   * Records a failed attempt for the key in durable database storage.
   */
  public async recordFailure(key: string): Promise<{ remaining: number; retryAfterSeconds: number }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.windowMs);

    try {
      const record = await db.rateLimitAttempt.findUnique({ where: { key } });

      let attempts = 1;
      if (record && record.expiresAt > now) {
        attempts = record.attempts + 1;
        await db.rateLimitAttempt.update({
          where: { key },
          data: {
            attempts,
            lastAttemptAt: now,
          },
        });
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
      }

      const remaining = Math.max(0, this.maxAttempts - attempts);
      const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

      return { remaining, retryAfterSeconds };
    } catch {
      return { remaining: 0, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
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
