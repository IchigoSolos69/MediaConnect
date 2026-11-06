import crypto from "crypto";

export class TamperDetectedError extends Error {
  constructor(message = "Cryptographic authentication failed: token payload has been tampered with or corrupted.") {
    super(message);
    this.name = "TamperDetectedError";
    Object.setPrototypeOf(this, TamperDetectedError.prototype);
  }
}

export class VaultKeyError extends Error {
  constructor(message = "Token Vault key configuration error.") {
    super(message);
    this.name = "VaultKeyError";
    Object.setPrototypeOf(this, VaultKeyError.prototype);
  }
}

// Default development key (32 bytes = 64 hex characters) used only if TOKEN_VAULT_KEY_V1 is not set in environment
const DEV_FALLBACK_KEY_V1 = "e9b21f98c614b7e1898522e8412e8732a13876d91244e8910248bfb18274619a";
const DEV_FALLBACK_KEY_V2 = "9a4821fb81bf4820198e44129d67831a2378e2148e2258981e7b416c89f12b9e";

export class TokenVault {
  private static getKey(version: string): Buffer {
    const envKey =
      version === "v1"
        ? process.env.TOKEN_VAULT_KEY_V1 || DEV_FALLBACK_KEY_V1
        : version === "v2"
        ? process.env.TOKEN_VAULT_KEY_V2 || DEV_FALLBACK_KEY_V2
        : process.env[`TOKEN_VAULT_KEY_${version.toUpperCase()}`];

    if (!envKey) {
      throw new VaultKeyError(`No cryptographic encryption key configured for version: ${version}`);
    }

    // Accept 64-char hex string or 32-byte string/base64
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }

    // Fallback: SHA-256 hash to guarantee exact 32 bytes
    return crypto.createHash("sha256").update(envKey).digest();
  }

  public static getActiveVersion(): string {
    return process.env.TOKEN_VAULT_ACTIVE_VERSION || "v1";
  }

  /**
   * Checks whether a given string is an encrypted vault envelope.
   */
  public static isEncrypted(value: string | null | undefined): boolean {
    if (!value || typeof value !== "string") return false;
    return value.startsWith("enc:");
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Envelope format: `enc:<version>:<iv_hex>:<ciphertext_hex>:<tag_hex>`
   */
  public static encrypt(
    plaintext: string,
    aad?: string,
    versionOverride?: string
  ): string {
    if (!plaintext) return "";

    const version = versionOverride || this.getActiveVersion();
    const key = this.getKey(version);

    // Generate unique 12-byte (96-bit) nonce per encryption
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: 16,
    });

    if (aad) {
      cipher.setAAD(Buffer.from(aad, "utf8"));
    }

    let ciphertext = cipher.update(plaintext, "utf8", "hex");
    ciphertext += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");
    const ivHex = iv.toString("hex");

    return `enc:${version}:${ivHex}:${ciphertext}:${authTag}`;
  }

  /**
   * Decrypts an encrypted vault envelope using AES-256-GCM.
   * Validates authenticated tag; throws TamperDetectedError on any modification.
   */
  public static decrypt(envelope: string, aad?: string): string {
    if (!envelope) return "";

    // If string is not encrypted (e.g. legacy plaintext), return as-is for safe backward compatibility
    if (!this.isEncrypted(envelope)) {
      return envelope;
    }

    const parts = envelope.split(":");
    if (parts.length !== 5 || parts[0] !== "enc") {
      throw new TamperDetectedError("Invalid token envelope format");
    }

    const [, version, ivHex, ciphertextHex, tagHex] = parts;

    try {
      const key = this.getKey(version);
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(tagHex, "hex");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
      });

      if (aad) {
        decipher.setAAD(Buffer.from(aad, "utf8"));
      }

      decipher.setAuthTag(authTag);

      let plaintext = decipher.update(ciphertextHex, "hex", "utf8");
      plaintext += decipher.final("utf8");

      return plaintext;
    } catch (err: any) {
      throw new TamperDetectedError(
        `Failed to decrypt token with version [${version}]: ${err.message}`
      );
    }
  }

  /**
   * Rotates an encrypted token to a new key version without exposing plaintext.
   */
  public static rotate(envelope: string, targetVersion: string, aad?: string): string {
    const plaintext = this.decrypt(envelope, aad);
    return this.encrypt(plaintext, aad, targetVersion);
  }
}
