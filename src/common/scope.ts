import type { AuthUser } from "./guards/jwt-auth.guard";

/**
 * Returns the user-id whose data the current request should access.
 * For top-level users (landlords/admins) this is their own id; for employees
 * (users with ownerUserId set) this returns the owner's id, so the employee
 * sees and can act on the owner's data scope.
 */
export function scopeId(user: AuthUser): number {
  return user.ownerUserId ?? user.id;
}

/**
 * Soft-delete: mark the row's deleted_at instead of removing it. Every
 * SELECT query in the app must filter `isNull(table.deletedAt)` to hide
 * tombstoned rows.
 */
export const SOFT_DELETE = { deletedAt: new Date() } as const;
