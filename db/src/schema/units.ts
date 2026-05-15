import { pgTable, text, serial, timestamp, integer, numeric, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const unitTypeEnum = pgEnum("unit_type", ["apartment", "villa", "office", "shop", "warehouse", "studio"]);
export const unitStatusEnum = pgEnum("unit_status", ["available", "rented", "maintenance", "reserved"]);

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  type: unitTypeEnum("type").notNull().default("apartment"),
  status: unitStatusEnum("status").notNull().default("available"),
  floor: integer("floor"),
  area: numeric("area", { precision: 10, scale: 2 }),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  livingRooms: integer("living_rooms"),
  halls: integer("halls"),
  parkingSpaces: integer("parking_spaces"),
  rentPrice: numeric("rent_price", { precision: 12, scale: 2 }),
  electricityMeter: text("electricity_meter"),
  waterMeter: text("water_meter"),
  gasMeter: text("gas_meter"),
  acUnits: integer("ac_units"),
  acType: text("ac_type"),
  parkingType: text("parking_type"),
  furnishing: text("furnishing"),
  kitchenType: text("kitchen_type"),
  fiber: text("fiber"),
  amenities: text("amenities"),
  /* extra detail fields */
  unitDirection: text("unit_direction"),
  yearBuilt: text("year_built"),
  finishing: text("finishing"),
  facadeLength: numeric("facade_length", { precision: 10, scale: 2 }),
  unitLength: numeric("unit_length", { precision: 10, scale: 2 }),
  unitWidth: numeric("unit_width", { precision: 10, scale: 2 }),
  unitHeight: numeric("unit_height", { precision: 10, scale: 2 }),
  hasMezzanine: boolean("has_mezzanine"),
  // Attachments — MinIO object keys uploaded via the FileUpload component
  // and persisted here so the unit detail view can show them again.
  // imageKey + floorPlanKey are single files; documents is a JSON array of
  //   { key, originalName, contentType, size }
  // entries to support multiple uploads.
  imageKey: text("image_key"),
  floorPlanKey: text("floor_plan_key"),
  documents: jsonb("documents"),
  // JSON array of MinIO object keys — the unit photo gallery.
  images: jsonb("images"),
  isDemo: boolean("is_demo").notNull().default(false),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
