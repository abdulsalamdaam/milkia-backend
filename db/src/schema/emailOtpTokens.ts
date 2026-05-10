import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

/**
 * Short-lived email-OTP login codes. We store the *bcrypt hash* of the code
 * (never the plaintext) along with an explicit expiry so a stolen DB dump
 * doesn't grant attackers active codes.
 *
 * One row per (email, attempt). New requests soft-rotate by writing a new
 * row + ignoring older ones. A nightly cleanup (or cron-style passive) can
 * drop rows where expiresAt < now() - 1 day.
 */
export const emailOtpTokensTable = pgTable("email_otp_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  /** bcrypt hash of the 6-digit code. Never stored in plaintext. */
  codeHash: text("code_hash").notNull(),
  /** Brute-force counter. After 5 wrong attempts on the same row we burn it. */
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byEmail: index("email_otp_tokens_email_idx").on(t.email, t.expiresAt),
}));

export type EmailOtpToken = typeof emailOtpTokensTable.$inferSelect;
