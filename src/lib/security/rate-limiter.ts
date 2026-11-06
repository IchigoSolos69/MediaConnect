/**
 * In-memory sliding window rate limiter for security-sensitive endpoints (e.g. /api/auth/login).
 * In distributed production environments, this can be backed by Redis / Upstash with identical interface.
 */

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
}

class MemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Periodically clean expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), 5 * 60 * 1000).unref?.();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.firstAttemptAt > this.windowMs) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Checks whether the given key is currently rate limited.
   */
  public check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry) {
      return { allowed: true, remaining: this.maxAttempts, retryAfterSeconds: 0 };
    }

    // If window has passed, reset
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.store.delete(key);
      return { allowed: true, remaining: this.maxAttempts, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(0, this.maxAttempts - entry.count);
    const retryAfterSeconds = Math.ceil((entry.firstAttemptAt + this.windowMs - now) / 1000);

    return {
      allowed: entry.count < this.maxAttempts,
      remaining,
      retryAfterSeconds,
    };
  }

  /**
   * Records a failed attempt for the key.
   */
  public recordFailure(key: string): { remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.store.set(key, { count: 1, firstAttemptAt: now, lastAttemptAt: now });
      return {
        remaining: this.maxAttempts - 1,
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    entry.count += 1;
    entry.lastAttemptAt = now;
    const remaining = Math.max(0, this.maxAttempts - entry.count);
    const retryAfterSeconds = Math.ceil((entry.firstAttemptAt + this.windowMs - now) / 1000);

    return { remaining, retryAfterSeconds };
  }

  /**
   * Resets rate limit for a key upon successful authentication.
   */
  public reset(key: string): void {
    this.store.delete(key);
  }
}

// 5 failed attempts per 15 minutes for authentication
export const loginRateLimiter = new MemoryRateLimiter(5, 15 * 60 * 1000);
