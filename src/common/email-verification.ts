import { randomBytes, createHash, randomInt } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Email-verification helpers. New registrations verify with a 6-digit OTP
 * code (see `newEmailVerifyOtp`); the legacy link-based token helpers are
 * kept for backwards compatibility with any outstanding links.
 */

const TTL_DAYS = 7;

/** Minutes a verification OTP stays valid. */
export const EMAIL_VERIFY_OTP_TTL_MIN = 15;

export function newEmailVerifyToken(ttlDays = TTL_DAYS) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

export function hashEmailVerifyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A fresh 6-digit verification OTP. The plaintext `code` is emailed to the
 * user; only its bcrypt `codeHash` is stored (in `users.emailVerifyTokenHash`)
 * alongside `expiresAt` (in `users.emailVerifyExpiresAt`).
 */
export async function newEmailVerifyOtp(ttlMin = EMAIL_VERIFY_OTP_TTL_MIN) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + ttlMin * 60_000);
  return { code, codeHash, expiresAt };
}

/** Verify a plaintext code against a stored bcrypt hash. */
export function verifyEmailOtpCode(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}
