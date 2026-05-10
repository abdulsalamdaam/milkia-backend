import { pgTable, text, serial, timestamp, integer, numeric, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { invoicesTable } from "./invoices";

/**
 * UN/CEFACT VAT category codes accepted by ZATCA:
 *   S — standard rate, Z — zero rate, E — exempt, O — services outside scope.
 */
export const vatCategoryEnum = pgEnum("vat_category", ["S", "Z", "E", "O"]);

export const invoiceLinesTable = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  unitCode: text("unit_code").notNull().default("PCE"),
  quantity: numeric("quantity", { precision: 14, scale: 6 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  vatCategory: vatCategoryEnum("vat_category").notNull().default("S"),
  vatPercent: numeric("vat_percent", { precision: 5, scale: 2 }).notNull(),
  // Cached derived totals — recomputed on save, kept here so reports don't redo math.
  lineNet: numeric("line_net", { precision: 14, scale: 2 }).notNull(),
  lineVat: numeric("line_vat", { precision: 14, scale: 2 }).notNull(),
  lineTotalIncVat: numeric("line_total_inc_vat", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byInvoice: index("invoice_lines_invoice_idx").on(t.invoiceId, t.lineNumber),
}));

export const insertInvoiceLineSchema = createInsertSchema(invoiceLinesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;
export type InvoiceLine = typeof invoiceLinesTable.$inferSelect;
