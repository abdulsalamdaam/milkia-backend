import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Users are pure identity rows — no role/permissions/company data lives
 * here. Authorization is resolved by joining `roles` (via `role_id`) and
 * billing/branding data by joining `companies` (via `company_id`).
 *
 * Migration history:
 *   - Originally carried `role` enum + `permissions` jsonb + `role_label`
 *     and a bag of company fields (`company`, `commercial_reg`, `vat_number`,
 *     `official_email`, `company_phone`, `website`, `city`, `address`,
 *     `logo_url`). All dropped in migration 2026_05_drop_legacy_user_columns.sql
 *     once the data was backfilled into `companies` + `roles`.
 */
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  accountStatus: text("account_status").notNull().default("active"),
  phone: text("phone"),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  tokenVersion: integer("token_version").notNull().default(0),
  /**
   * If set, this user is an employee belonging to another user (the owner).
   * The employee inherits the owner's data scope (sees the owner's properties,
   * tenants, contracts, etc.). Null for top-level users (landlords/admins).
   * Self-referencing FK using AsType to avoid TS circular issue.
   */
  ownerUserId: integer("owner_user_id"),
  /** FK → companies.id. Source of legal/billing/branding fields. */
  companyId: integer("company_id"),
  /** FK → roles.id. Source of role key + permissions + label. */
  roleId: integer("role_id"),
  /**
   * Subscription package — "individual_owner" | "broker". Drives the
   * landlord/property/unit quota limits (see src/common/packages.ts).
   * Only meaningful on a top-level account; employees inherit the owner's.
   */
  packagePlan: text("package_plan").notNull().default("broker"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
