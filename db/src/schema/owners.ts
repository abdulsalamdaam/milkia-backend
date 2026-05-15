import { pgTable, text, serial, timestamp, pgEnum, numeric, integer, boolean } from "drizzle-orm/pg-core";

export const ownerTypeEnum = pgEnum("owner_type", ["individual", "company"]);
export const ownerStatusEnum = pgEnum("owner_status", ["active", "inactive"]);

export const ownersTable = pgTable("owners", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  /**
   * The company this owner/reseller is linked to. NULL during the migration
   * window for legacy rows; new owners always carry this. The legacy `userId`
   * is kept for data-scoping continuity (employees inherit their owner-user's
   * scope) until we move scoping to companyId end-to-end.
   */
  companyId: integer("company_id"),
  name: text("name").notNull(),
  type: ownerTypeEnum("type").notNull().default("individual"),
  idNumber: text("id_number"),
  nationality: text("nationality"),
  phone: text("phone"),
  email: text("email"),
  iban: text("iban"),
  managementFeePercent: numeric("management_fee_percent", { precision: 5, scale: 2 }),
  taxNumber: text("tax_number"),
  // Wakala / representative flow. When isRepresentative is true the row
  // describes the agent (وكيل) acting on behalf of the actual owner stored
  // in the original* columns below. The authorization document URL is the
  // power-of-attorney scan; UI shows a download chip.
  isRepresentative: boolean("is_representative").notNull().default(false),
  representativeDocUrl: text("representative_doc_url"),
  originalOwnerName: text("original_owner_name"),
  originalOwnerIdNumber: text("original_owner_id_number"),
  originalOwnerPhone: text("original_owner_phone"),
  originalOwnerEmail: text("original_owner_email"),
  // National address (العنوان الوطني) — Saudi standard address block.
  // The legacy `address` is a single free-text line kept for backwards
  // compatibility; the structured fields below feed the new wizard step.
  nationalAddressCity: text("national_address_city"),
  nationalAddressDistrict: text("national_address_district"),
  nationalAddressStreet: text("national_address_street"),
  address: text("address"),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  buildingNumber: text("building_number"),
  status: ownerStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  isDemo: text("is_demo").default("false"),
  // Draft records are saved incomplete and finished later.
  isDraft: boolean("is_draft").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Owner = typeof ownersTable.$inferSelect;
