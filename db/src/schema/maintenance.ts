import { pgTable, text, serial, timestamp, pgEnum, numeric, integer } from "drizzle-orm/pg-core";

export const maintenancePriorityEnum = pgEnum("maintenance_priority", ["low", "medium", "high"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["open", "in_progress", "pending_approval", "completed"]);

export const maintenanceRequestsTable = pgTable("maintenance_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tenantId: integer("tenant_id"),
  contractId: integer("contract_id"),
  unitLabel: text("unit_label").notNull(),
  description: text("description").notNull(),
  priority: maintenancePriorityEnum("priority").notNull().default("medium"),
  status: maintenanceStatusEnum("status").notNull().default("open"),
  supplier: text("supplier"),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MaintenanceRequest = typeof maintenanceRequestsTable.$inferSelect;
