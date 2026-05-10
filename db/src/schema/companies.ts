import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A company (the legal/billing entity that issues invoices, signs contracts,
 * and aggregates employees). Replaces the bag of company-* fields previously
 * scattered on the `users` table.
 *
 * Many users → one company (the company owner is just the user that created
 * the row first; subsequent employees are linked via `users.company_id`).
 * Owners (resellers) are also linked back to their company.
 */
export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  /** Legal/Trading name. Required. */
  name: text("name").notNull(),
  /** Commercial Registration number (سجل تجاري). */
  commercialReg: text("commercial_reg"),
  /** ZATCA-issued VAT number — 15 digits, starts and ends with 3. */
  vatNumber: text("vat_number"),
  /** Tax/Zakat number distinct from VAT (some companies file separately). */
  taxNumber: text("tax_number"),
  /** Public-facing email shown on invoices/contracts. Falls back to owner's email. */
  officialEmail: text("official_email"),
  companyPhone: text("company_phone"),
  website: text("website"),
  city: text("city"),
  region: text("region"),
  district: text("district"),
  street: text("street"),
  buildingNumber: text("building_number"),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  address: text("address"),
  /** MinIO object key — render via /api/uploads/sign?key=... never store a public URL here. */
  logoKey: text("logo_key"),
  /** Free-form short description for the landing page / proposals. */
  bio: text("bio"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byVat: index("companies_vat_idx").on(t.vatNumber),
}));

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
