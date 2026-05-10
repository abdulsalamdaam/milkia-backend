import { pgTable, text, serial, timestamp, boolean, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "user", "demo"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  accountStatus: text("account_status").notNull().default("active"),
  phone: text("phone"),
  company: text("company"),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  tokenVersion: integer("token_version").notNull().default(0),
  /** Custom permissions list — when null, the role's preset permissions are used. */
  permissions: jsonb("permissions").$type<string[] | null>(),
  /** Custom human-readable label for the role (free-form). */
  roleLabel: text("role_label"),
  /**
   * If set, this user is an employee belonging to another user (the owner).
   * The employee inherits the owner's data scope (sees the owner's properties,
   * tenants, contracts, etc.). Null for top-level users (landlords/admins).
   * Self-referencing FK using AsType to avoid TS circular issue.
   */
  ownerUserId: integer("owner_user_id"),
  /**
   * Foreign key into the new `companies` table. The legacy `company` text
   * field below is kept for the migration window so existing rows still
   * render — code reads `companyId` first and only falls back to `company`
   * when the FK is NULL.
   */
  companyId: integer("company_id"),
  /**
   * Foreign key into the new `roles` table. While both are populated during
   * the migration window, guards prefer `roleId` and fall back to `role`.
   */
  roleId: integer("role_id"),
  /** @deprecated — kept until backfill complete. New code reads via companies join. */
  commercialReg: text("commercial_reg"),
  /** @deprecated */
  vatNumber: text("vat_number"),
  /** @deprecated */
  officialEmail: text("official_email"),
  /** @deprecated */
  companyPhone: text("company_phone"),
  /** @deprecated */
  website: text("website"),
  /** @deprecated */
  city: text("city"),
  /** @deprecated */
  address: text("address"),
  /** @deprecated — moved to companies.logoKey */
  logoUrl: text("logo_url"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
