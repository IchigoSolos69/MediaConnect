export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

// Development-only fallbacks with explicit warning
const DEV_ONLY_AUTH_SECRET = "dev_secret_auth_vault_key_2026_minimum_32_bytes_long";
const DEV_ONLY_VAULT_KEY_V1 = "e9b21f98c614b7e1898522e8412e8732a13876d91244e8910248bfb18274619a";
const DEV_ONLY_VAULT_KEY_V2 = "9a4821fb81bf4820198e44129d67831a2378e2148e2258981e7b416c89f12b9e";
const DEV_ONLY_DISPATCH_SECRET = "dev_dispatch_cron_internal_service_secret_32bytes";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Returns the secret used for signing and verifying user session JWTs.
 * Throws in production if missing, too short (< 32 chars), or using the dev fallback.
 */
export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (isProduction()) {
    if (!secret || secret.trim().length < 32 || secret === DEV_ONLY_AUTH_SECRET) {
      throw new ConfigError(
        "FATAL: Production security requirement violated: AUTH_SECRET must be configured with at least 32 characters in production."
      );
    }
    return new TextEncoder().encode(secret);
  }

  // Development / Test mode fallback
  if (!secret) {
    return new TextEncoder().encode(DEV_ONLY_AUTH_SECRET);
  }

  return new TextEncoder().encode(secret);
}

/**
 * Returns the 32-byte cryptographic key for AES-256-GCM token encryption.
 * Strictly separates session secrets from token encryption keys.
 * In production, strictly requires a properly generated 64-character hexadecimal key (256-bit).
 * Refuses to silently hash arbitrary weak strings in production.
 */
export function getTokenVaultKey(version: string = "v1"): Buffer {
  const envKey =
    version === "v1"
      ? process.env.TOKEN_VAULT_KEY_V1
      : version === "v2"
      ? process.env.TOKEN_VAULT_KEY_V2
      : process.env[`TOKEN_VAULT_KEY_${version.toUpperCase()}`];

  if (isProduction()) {
    if (!envKey || envKey === DEV_ONLY_VAULT_KEY_V1 || envKey === DEV_ONLY_VAULT_KEY_V2) {
      throw new ConfigError(
        `FATAL: Production security requirement violated: TOKEN_VAULT_KEY_${version.toUpperCase()} must be securely configured in production environment.`
      );
    }

    // In production, strictly require 64-char hex key (32 bytes). No weak string hashing.
    if (envKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(envKey)) {
      throw new ConfigError(
        `FATAL: Production security requirement violated: TOKEN_VAULT_KEY_${version.toUpperCase()} must be an exact 64-character hexadecimal string (256-bit AES key).`
      );
    }

    return Buffer.from(envKey, "hex");
  }

  const effectiveKey = envKey || (version === "v2" ? DEV_ONLY_VAULT_KEY_V2 : DEV_ONLY_VAULT_KEY_V1);

  if (!effectiveKey) {
    throw new ConfigError(`No cryptographic encryption key configured for version: ${version}`);
  }

  // 64-char hex string (exact 32 bytes)
  if (effectiveKey.length === 64 && /^[0-9a-fA-F]+$/.test(effectiveKey)) {
    return Buffer.from(effectiveKey, "hex");
  }

  // Development fallback for non-production only
  return Buffer.from(effectiveKey.padEnd(32, "0").slice(0, 32), "utf8");
}

/**
 * Returns the shared secret for service-to-service internal dispatch calls (/api/posts/dispatch).
 */
export function getDispatchSecret(): string {
  const secret = process.env.DISPATCH_SECRET;

  if (isProduction()) {
    if (!secret || secret.trim().length < 32 || secret === DEV_ONLY_DISPATCH_SECRET) {
      throw new ConfigError(
        "FATAL: Production security requirement violated: DISPATCH_SECRET must be set with at least 32 characters in production."
      );
    }
    return secret;
  }

  return secret || DEV_ONLY_DISPATCH_SECRET;
}
