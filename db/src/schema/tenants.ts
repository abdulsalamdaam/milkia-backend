import { pgTable, text, serial, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";

export const tenantTypeEnum = pgEnum("tenant_type", ["individual", "company"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "inactive"]);

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  type: tenantTypeEnum("type").notNull().default("individual"),
  nationalId: text("national_id"),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("tax_number"),
  address: text("address"),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  buildingNumber: text("building_number"),
  nationality: text("nationality"),
  status: tenantStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  isDemo: text("is_demo").default("false"),
  tokenVersion: integer("token_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  fcmToken: text("fcm_token"),
  fcmPlatform: text("fcm_platform"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Tenant = typeof tenantsTable.$inferSelect;
