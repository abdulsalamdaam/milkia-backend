import { pgTable, text, serial, timestamp, pgEnum, numeric, integer } from "drizzle-orm/pg-core";

export const ownerTypeEnum = pgEnum("owner_type", ["individual", "company"]);
export const ownerStatusEnum = pgEnum("owner_status", ["active", "inactive"]);

export const ownersTable = pgTable("owners", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  type: ownerTypeEnum("type").notNull().default("individual"),
  idNumber: text("id_number"),
  phone: text("phone"),
  email: text("email"),
  iban: text("iban"),
  managementFeePercent: numeric("management_fee_percent", { precision: 5, scale: 2 }),
  taxNumber: text("tax_number"),
  address: text("address"),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  buildingNumber: text("building_number"),
  status: ownerStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  isDemo: text("is_demo").default("false"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Owner = typeof ownersTable.$inferSelect;
