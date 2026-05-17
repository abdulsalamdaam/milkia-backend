import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Central lookup table — replaces hard-coded dropdown lists across the
 * apps. Each row is one option in a category (e.g. category "unit_type",
 * key "villa"). `key` is the value stored on records; the labels are for
 * display. System rows have companyId = null; a company can add its own
 * options later (companyId set) without a code change.
 *
 * Truly fixed, code-coupled sets (statuses, payment frequency, deed type)
 * stay as pgEnums — only user-facing, extensible lists live here.
 */
export const lookupsTable = pgTable("lookups", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  key: text("key").notNull(),
  labelAr: text("label_ar").notNull(),
  labelEn: text("label_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // Optional parent option key — lets a category cascade from another
  // (e.g. a "city" row points at its "region" key).
  parentKey: text("parent_key"),
  // null = global/system option; set = a specific company's custom option.
  companyId: integer("company_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniq: uniqueIndex("lookups_category_key_company_uniq").on(t.category, t.key, t.companyId),
}));

export const insertLookupSchema = createInsertSchema(lookupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLookup = z.infer<typeof insertLookupSchema>;
export type Lookup = typeof lookupsTable.$inferSelect;
