import { pgTable, text, serial, timestamp, integer, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { ownersTable } from "./owners";
import { deedsTable } from "./deeds";

export const propertyTypeEnum = pgEnum("property_type", ["residential", "commercial", "mixed", "land", "villa", "apartment_building", "tower", "plaza", "mall", "chalet", "other"]);
export const propertyStatusEnum = pgEnum("property_status", ["active", "inactive", "maintenance"]);

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: propertyTypeEnum("type").notNull().default("residential"),
  status: propertyStatusEnum("status").notNull().default("active"),
  city: text("city").notNull(),
  district: text("district"),
  street: text("street"),
  // Legacy free-text deed number kept for backwards-compat with rows created
  // before the deeds table existed; new flows write via deedId and a join.
  deedNumber: text("deed_number"),
  // FK to the deed that legally backs this property. Enforced 1:1 via
  // uniqueIndex below — a deed can be linked to at most one property.
  deedId: integer("deed_id").references(() => deedsTable.id, { onDelete: "set null" }),
  totalUnits: integer("total_units").notNull().default(0),
  floors: integer("floors"),
  elevators: integer("elevators"),
  parkings: integer("parkings"),
  yearBuilt: integer("year_built"),
  buildingType: text("building_type"),
  usageType: text("usage_type"),
  region: text("region"),
  postalCode: text("postal_code"),
  buildingNumber: text("building_number"),
  additionalNumber: text("additional_number"),
  ownerId: integer("owner_id").references(() => ownersTable.id, { onDelete: "set null" }),
  amenitiesData: text("amenities_data"),
  notes: text("notes"),
  // MinIO object key for the property photo (single PNG).
  imageKey: text("image_key"),
  isDemo: boolean("is_demo").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // 1:1 enforcement: a single deed cannot back two properties.
  uniqDeedId: uniqueIndex("properties_deed_id_uniq").on(t.deedId),
}));

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
