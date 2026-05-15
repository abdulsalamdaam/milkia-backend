import { pgTable, text, serial, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { paymentsTable } from "./payments";
import { contractsTable } from "./contracts";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

/**
 * Payment confirmations — a tenant claims they have paid an installment
 * (payments row) and attaches proof. The landlord reviews and either
 * approves (which marks the underlying payment as paid) or rejects.
 */
export const paymentConfirmationStatusEnum = pgEnum("payment_confirmation_status", [
  "pending",
  "approved",
  "rejected",
]);

export const paymentConfirmationsTable = pgTable("payment_confirmations", {
  id: serial("id").primaryKey(),
  // Landlord that owns the payment — the side that reviews the request.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id, { onDelete: "cascade" }),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // bank_transfer | cash | cheque | other
  method: text("method"),
  reference: text("reference"),
  note: text("note"),
  // MinIO object key + original filename for the proof attachment.
  proofKey: text("proof_key"),
  proofName: text("proof_name"),
  status: paymentConfirmationStatusEnum("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentConfirmationSchema = createInsertSchema(paymentConfirmationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentConfirmation = z.infer<typeof insertPaymentConfirmationSchema>;
export type PaymentConfirmation = typeof paymentConfirmationsTable.$inferSelect;
