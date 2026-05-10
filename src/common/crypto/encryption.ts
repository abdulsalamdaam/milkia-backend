import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM envelope encryption for secrets at rest (ZATCA private keys,
 * CSID secrets). Output format: base64( iv(12) ‖ tag(16) ‖ ciphertext ).
 *
 * The key is sourced from APP_ENCRYPTION_KEY (any string — we SHA-256 it down
 * to 32 bytes so users don't have to encode their own raw key). Rotating the
 * env var means existing rows can no longer be decrypted, so migrate before
 * rotating in production.
 */

const VERSION = 1;
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one: `openssl rand -base64 32` and add to your .env",
    );
  }
  // Stretch any input to 32 bytes via SHA-256 — convenient + idempotent.
  cachedKey = createHash("sha256").update(raw, "utf8").digest().subarray(0, KEY_LEN);
  return cachedKey;
}

/** Encrypt a UTF-8 string. Returns versioned base64 ciphertext. */
export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([Buffer.from([VERSION]), iv, tag, enc]);
  return out.toString("base64");
}

/** Decrypt a versioned base64 ciphertext produced by `encryptString`. */
export function decryptString(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const v = buf[0];
  if (v !== VERSION) throw new Error(`unsupported ciphertext version: ${v}`);
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const enc = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Convenience for nullable columns. */
export function encryptNullable(s: string | null | undefined): string | null {
  return s == null ? null : encryptString(s);
}
export function decryptNullable(s: string | null | undefined): string | null {
  return s == null ? null : decryptString(s);
}
