import { randomBytes, createHash } from "crypto";

/**
 * Email-verification token helpers. The raw token travels in the link sent to
 * the user; only its sha256 hash is stored, so a leaked DB can't be used to
 * forge verification links. sha256 is deterministic → we can look the user up
 * by hash on click.
 */

const TTL_DAYS = 7;

export function newEmailVerifyToken(ttlDays = TTL_DAYS) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

export function hashEmailVerifyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
