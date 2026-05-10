import { pgTable, text, serial, timestamp, jsonb, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Roles are now first-class rows. The legacy `users.role` enum + `users.permissions`
 * jsonb are being phased out — instead a user is linked to a role via
 * `users.role_id`, and the role row carries the full permission list +
 * bilingual labels.
 *
 * Keeping `key` as a stable identifier (e.g. "super_admin", "admin", "user",
 * "demo") makes guards + presets easier to read than numeric IDs. The system
 * presets are seeded on boot; admins can layer additional custom roles via
 * the team UI without code changes.
 *
 * `companyId` is NULL for system-wide roles (super_admin/admin); company-scoped
 * roles (e.g. an "Accountant" preset for a specific tenant) carry the FK.
 */
export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  labelAr: text("label_ar").notNull(),
  labelEn: text("label_en").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  /** Marks the four built-ins (super_admin/admin/user/demo). Cannot be deleted. */
  isSystem: boolean("is_system").notNull().default(false),
  /** When set, the role belongs to that company. NULL for system-wide presets. */
  companyId: integer("company_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Role keys are unique within a scope: system roles share NULL companyId;
  // company-scoped roles can reuse common keys ("accountant") across companies.
  keyCompanyUniq: uniqueIndex("roles_key_company_uniq").on(t.key, t.companyId),
}));

export const insertRoleSchema = createInsertSchema(rolesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof rolesTable.$inferSelect;
