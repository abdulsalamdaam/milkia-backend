import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  targetUnits: text("target_units"),
  channel: text("channel").notNull().default(""),
  budget: numeric("budget", { precision: 12, scale: 2 }).default("0"),
  leads: integer("leads").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  status: text("status").notNull().default("نشطة"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Campaign = typeof campaignsTable.$inferSelect;
