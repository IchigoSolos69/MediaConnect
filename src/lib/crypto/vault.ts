import crypto from "crypto";
import { getTokenVaultKey, isProduction } from "../config/secrets";

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

export class PlaintextTokenRejectedError extends Error {
  constructor(message = "Unencrypted plaintext token rejected in production environment.") {
    super(message);
    this.name = "PlaintextTokenRejectedError";
    Object.setPrototypeOf(this, PlaintextTokenRejectedError.prototype);
  }
}

export class TokenVault {
  private static getKey(version: string): Buffer {
    try {
      return getTokenVaultKey(version);
    } catch (err: any) {
      throw new VaultKeyError(err.message || `No cryptographic encryption key configured for version: ${version}`);
    }
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
   * In production, unencrypted plaintext tokens fail closed with PlaintextTokenRejectedError.
   */
  public static decrypt(envelope: string, aad?: string): string {
    if (!envelope) return "";

    // If string is not encrypted (legacy plaintext):
    if (!this.isEncrypted(envelope)) {
      if (isProduction()) {
        throw new PlaintextTokenRejectedError(
          "Production security violation: Unencrypted plaintext token rejected. All credentials must be stored in encrypted AES-256-GCM vault envelopes."
        );
      }
      console.warn("[SECURITY WARNING] Plaintext token decrypted in development mode. Please run token migration.");
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
      if (err instanceof VaultKeyError) throw err;
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
