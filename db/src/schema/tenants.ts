import { pgTable, text, serial, timestamp, pgEnum, integer, boolean, numeric } from "drizzle-orm/pg-core";

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
  // Financial fields — surfaced on the new Financial step of the tenant
  // wizard. iban + employer + monthlyIncome help collectors size payment
  // plans. All nullable; pre-migration rows leave them empty.
  iban: text("iban"),
  employer: text("employer"),
  monthlyIncome: numeric("monthly_income", { precision: 12, scale: 2 }),
  // National address (العنوان الوطني) — structured Saudi block. Legacy
  // `address` stays for free-text fallback.
  nationalAddressCity: text("national_address_city"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressStreet: text("national_address_street"),
  address: text("address"),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  buildingNumber: text("building_number"),
  nationality: text("nationality"),
  // Representative (وكيل) flow — same pattern as owners.ts. When set, the
  // row describes the agent and original-tenant fields hold the actual
  // tenant identity.
  isRepresentative: boolean("is_representative").notNull().default(false),
  representativeDocUrl: text("representative_doc_url"),
  originalTenantName: text("original_tenant_name"),
  originalTenantIdNumber: text("original_tenant_id_number"),
  originalTenantPhone: text("original_tenant_phone"),
  originalTenantEmail: text("original_tenant_email"),
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
