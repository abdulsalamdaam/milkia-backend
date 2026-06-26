import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownersTable } from "./owners";
import { usersTable } from "./users";

/**
 * In-app notifications sent from the landlord portal to an owner (landlord).
 * The owner reads them in the mobile app's notifications screen. `type`
 * holds the template key (or "custom") for filtering/icons. Mirrors
 * notifications.ts but targets an owner instead of a tenant.
 */
export const ownerNotificationsTable = pgTable("owner_notifications", {
  id: serial("id").primaryKey(),
  // Account that sent / owns the notification.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => ownersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("custom"),
  readAt: timestamp("read_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOwnerNotificationSchema = createInsertSchema(ownerNotificationsTable).omit({ id: true, createdAt: true });
export type InsertOwnerNotification = z.infer<typeof insertOwnerNotificationSchema>;
export type OwnerNotification = typeof ownerNotificationsTable.$inferSelect;
