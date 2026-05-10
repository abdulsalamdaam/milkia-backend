import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const facilitiesTable = pgTable("facilities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  propertyName: text("property_name").notNull().default(""),
  type: text("type").notNull().default("خدمي"),
  status: text("status").notNull().default("يعمل"),
  lastMaintenance: text("last_maintenance"),
  nextMaintenance: text("next_maintenance"),
  monthlyOpex: numeric("monthly_opex", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Facility = typeof facilitiesTable.$inferSelect;
