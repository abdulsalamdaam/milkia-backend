/**
 * Subscription status derivation. The stored `subscription_status` is the
 * intent (pending_payment vs active); grace/locked are derived from the dates
 * so the truth stays correct without a cron job.
 *
 * Timeline after a payment:
 *   [start ───────────── endsAt] active
 *                        (endsAt, endsAt+15d] grace  (pay soon or get locked)
 *                        (endsAt+15d, ∞)      locked (settings/usage/pay only)
 */

export const GRACE_DAYS = 15;

export type SubscriptionStatus = "pending_payment" | "active" | "grace" | "locked";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DerivedSubscription {
  status: SubscriptionStatus;
  /** When the account locks (endsAt + 15 days), if applicable. */
  graceUntil: Date | null;
  /** Whole days until the account locks (negative once locked). */
  daysUntilLock: number | null;
  /** Whether the user must pay before they can use the portal. */
  needsPayment: boolean;
  /** Whether the account is restricted to settings/usage/pay. */
  locked: boolean;
}

export function deriveSubscription(input: {
  storedStatus: string | null | undefined;
  subscriptionEndsAt: Date | string | null | undefined;
  now?: Date;
}): DerivedSubscription {
  const now = input.now ?? new Date();
  const stored = (input.storedStatus || "active") as SubscriptionStatus;

  // Never paid yet — must pay to activate. Not "locked" (they still onboard),
  // but flagged as needing payment.
  if (stored === "pending_payment") {
    return { status: "pending_payment", graceUntil: null, daysUntilLock: null, needsPayment: true, locked: false };
  }

  const endsAt = input.subscriptionEndsAt ? new Date(input.subscriptionEndsAt) : null;
  // Legacy/active with no end date → treat as active indefinitely.
  if (!endsAt) {
    return { status: "active", graceUntil: null, daysUntilLock: null, needsPayment: false, locked: false };
  }

  const graceUntil = new Date(endsAt.getTime() + GRACE_DAYS * DAY_MS);
  const daysUntilLock = Math.ceil((graceUntil.getTime() - now.getTime()) / DAY_MS);

  if (now <= endsAt) {
    return { status: "active", graceUntil, daysUntilLock, needsPayment: false, locked: false };
  }
  if (now <= graceUntil) {
    // Past due but within grace — nag to pay; not locked yet.
    return { status: "grace", graceUntil, daysUntilLock, needsPayment: true, locked: false };
  }
  // Grace expired.
  return { status: "locked", graceUntil, daysUntilLock, needsPayment: true, locked: true };
}
