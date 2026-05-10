import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const contactSubmissionStatusEnum = pgEnum("contact_submission_status", [
  "new",
  "read",
  "in_progress",
  "resolved",
  "spam",
]);

export const contactSubmissionsTable = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  description: text("description").notNull(),
  source: text("source").default("landing-contact"),
  status: contactSubmissionStatusEnum("status").notNull().default("new"),
  responseNotes: text("response_notes"),
  resolvedById: integer("resolved_by_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ContactSubmission = typeof contactSubmissionsTable.$inferSelect;
