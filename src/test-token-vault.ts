import { TokenVault, TamperDetectedError, PlaintextTokenRejectedError } from "./lib/crypto/vault";

async function verifyTokenVault() {
  console.log("🧪 Running Cryptographic Token Vault Verification Suite...\n");

  const secretToken = "ya29.a0AfH6SMDIu93_YouTubeMockOAuthSecretToken1234567890_VerySecret";
  const accountAad = "account_yt_12345";

  // 1. Encryption & Unique Nonce
  const enc1 = TokenVault.encrypt(secretToken, accountAad, "v1");
  const enc2 = TokenVault.encrypt(secretToken, accountAad, "v1");

  console.log("1. Encryption & Unique Nonce Verification:");
  console.log(`   Envelope 1: ${enc1.substring(0, 35)}...`);
  console.log(`   Envelope 2: ${enc2.substring(0, 35)}...`);

  if (enc1 === enc2) {
    throw new Error("Nonce reuse detected! Two encryptions of the same plaintext must yield different envelopes.");
  }
  console.log("   ✓ Nonces are unique per encryption (no IV reuse)");

  // 2. Successful Decryption
  const decrypted = TokenVault.decrypt(enc1, accountAad);
  if (decrypted !== secretToken) {
    throw new Error(`Decryption mismatch! Expected "${secretToken}", got "${decrypted}"`);
  }
  console.log("   ✓ Plaintext successfully decrypted and matches original secret");

  // 3. Tamper Detection - Modified Ciphertext
  console.log("\n2. Tamper Detection Tests:");
  const parts = enc1.split(":");
  const tamperedCipher = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa");
  const tamperedEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}:${parts[4]}`;

  let tamperCaught = false;
  try {
    TokenVault.decrypt(tamperedEnvelope, accountAad);
  } catch (err: any) {
    if (err instanceof TamperDetectedError || err.name === "TamperDetectedError") {
      tamperCaught = true;
      console.log(`   ✓ Tampered ciphertext correctly rejected: ${err.message}`);
    }
  }
  if (!tamperCaught) {
    throw new Error("Security failure: Tampered ciphertext was not detected by AES-GCM!");
  }

  // 4. Tamper Detection - Modified Auth Tag
  const tamperedTag = parts[4].slice(0, -2) + "00";
  const tamperedTagEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedTag}`;

  let tagTamperCaught = false;
  try {
    TokenVault.decrypt(tamperedTagEnvelope, accountAad);
  } catch (err: any) {
    if (err instanceof TamperDetectedError || err.name === "TamperDetectedError") {
      tagTamperCaught = true;
      console.log(`   ✓ Tampered auth tag correctly rejected: ${err.message}`);
    }
  }
  if (!tagTamperCaught) {
    throw new Error("Security failure: Tampered auth tag was not detected by AES-GCM!");
  }

  // 5. Tamper Detection - Cross-Account AAD Swap
  let aadTamperCaught = false;
  try {
    TokenVault.decrypt(enc1, "account_attacker_99999");
  } catch (err: any) {
    if (err instanceof TamperDetectedError || err.name === "TamperDetectedError") {
      aadTamperCaught = true;
      console.log(`   ✓ Cross-record token swap (AAD mismatch) correctly rejected: ${err.message}`);
    }
  }
  if (!aadTamperCaught) {
    throw new Error("Security failure: AAD mismatch was not rejected!");
  }

  // 6. Fail-Closed on Unencrypted Plaintext Tokens in Production Mode
  console.log("\n3. Fail-Closed Plaintext Rejection in Production Mode:");
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = "production";
    let plaintextRejected = false;
    try {
      TokenVault.decrypt("unencrypted_raw_api_secret_12345", accountAad);
    } catch (err: any) {
      if (err instanceof PlaintextTokenRejectedError || err.name === "PlaintextTokenRejectedError") {
        plaintextRejected = true;
        console.log(`   ✓ Plaintext token fail-closed rejected in production: ${err.message}`);
      }
    }
    if (!plaintextRejected) {
      throw new Error("Security failure: Plaintext token was accepted in production mode!");
    }
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
  }

  // 7. Key Rotation (v1 -> v2)
  console.log("\n4. Key Rotation Verification:");
  const rotated = TokenVault.rotate(enc1, "v2", accountAad);
  console.log(`   Rotated envelope: ${rotated.substring(0, 35)}...`);
  if (!rotated.startsWith("enc:v2:")) {
    throw new Error("Key rotation did not update envelope version to v2");
  }
  const rotatedDecrypted = TokenVault.decrypt(rotated, accountAad);
  if (rotatedDecrypted !== secretToken) {
    throw new Error("Failed to decrypt rotated v2 envelope");
  }
  console.log("   ✓ Key rotation from v1 to v2 verified seamlessly");

  console.log("\n🎉 ALL TOKEN VAULT CRYPTOGRAPHIC TESTS PASSED!");
}

verifyTokenVault().catch((e) => {
  console.error(e);
  process.exit(1);
});
