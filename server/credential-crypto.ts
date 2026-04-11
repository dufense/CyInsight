import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = "ccc-connector-creds-v1";

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "[credential-crypto] SESSION_SECRET environment variable is not set. " +
      "Cannot encrypt or decrypt connector credentials. Set SESSION_SECRET before starting the server."
    );
  }
  return scryptSync(secret, SALT, 32);
}

export function encryptCredential(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptCredential(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  try {
    const buf = Buffer.from(ciphertext, "base64");
    const key = getKey();
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch (err: any) {
    console.error(
      "[credential-crypto] decryptCredential failed — possible key mismatch or data corruption.",
      "Error:", err?.message ?? String(err),
      "Check that SESSION_SECRET has not changed since credentials were encrypted."
    );
    return ciphertext;
  }
}
