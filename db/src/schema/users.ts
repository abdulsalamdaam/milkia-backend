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
  /** Company profile fields — landlords use these for invoices, contracts, branding. */
  commercialReg: text("commercial_reg"),
  vatNumber: text("vat_number"),
  officialEmail: text("official_email"),
  companyPhone: text("company_phone"),
  website: text("website"),
  city: text("city"),
  address: text("address"),
  logoUrl: text("logo_url"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
