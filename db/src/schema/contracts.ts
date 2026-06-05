import { pgTable, text, serial, timestamp, integer, numeric, boolean, date, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const contractStatusEnum = pgEnum("contract_status", ["active", "expired", "terminated", "pending"]);
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "quarterly", "semi_annual", "annual", "custom"]);

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // A contract's units live in the `contract_units` join table — a contract
  // can span many units. Rent below is one combined figure for all of them.
  contractNumber: text("contract_number").notNull().unique(),
  // tenant — FK link to the registered tenant (one tenant → many contracts).
  // The tenant* text fields below are kept as a denormalised snapshot of the
  // renter's details at signing time.
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  tenantType: text("tenant_type"),
  tenantName: text("tenant_name").notNull(),
  tenantIdNumber: text("tenant_id_number"),
  tenantPhone: text("tenant_phone"),
  tenantNationality: text("tenant_nationality"),
  tenantEmail: text("tenant_email"),
  tenantTaxNumber: text("tenant_tax_number"),
  tenantAddress: text("tenant_address"),
  tenantPostalCode: text("tenant_postal_code"),
  tenantAdditionalNumber: text("tenant_additional_number"),
  tenantBuildingNumber: text("tenant_building_number"),
  // contract signing
  signingDate: date("signing_date"),
  signingPlace: text("signing_place"),
  // financial
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // Higher precision so annual = monthly * 12 is exact (1,000,000 / 12 →
  // 83333.333333, which multiplies back to 1,000,000 — not 999,999.96).
  monthlyRent: numeric("monthly_rent", { precision: 14, scale: 6 }).notNull(),
  paymentFrequency: paymentFrequencyEnum("payment_frequency").notNull().default("monthly"),
  depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }),
  // Deposit (الوديعة) lifecycle — 'pending' | 'collected' | 'returned'.
  depositStatus: text("deposit_status"),
  depositDueDate: date("deposit_due_date"),
  // Rent paid up-front; counted as already paid against the rent total.
  prepaidRent: numeric("prepaid_rent", { precision: 14, scale: 2 }).notNull().default("0"),
  // VAT (15%) applied to each rent installment, and annual rent escalation
  // (تصاعد الإيجار) compounded once per contract year.
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  // `escalationType` 'percent' → escalationRate is a % ; 'amount' → it is a
  // fixed SAR amount added to the annual rent each year.
  escalationType: text("escalation_type").notNull().default("percent"),
  escalationRate: numeric("escalation_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  // company representative (ممثل المستأجر للشركات)
  repName: text("rep_name"),
  repIdNumber: text("rep_id_number"),
  companyUnified: text("company_unified"),
  companyOrgType: text("company_org_type"),
  // landlord (مؤجر) info from PDF
  landlordName: text("landlord_name"),
  landlordNationality: text("landlord_nationality"),
  landlordIdNumber: text("landlord_id_number"),
  landlordPhone: text("landlord_phone"),
  landlordEmail: text("landlord_email"),
  landlordTaxNumber: text("landlord_tax_number"),
  landlordAddress: text("landlord_address"),
  landlordPostalCode: text("landlord_postal_code"),
  landlordAdditionalNumber: text("landlord_additional_number"),
  landlordBuildingNumber: text("landlord_building_number"),
  // additional financial
  agencyFee: numeric("agency_fee", { precision: 12, scale: 2 }),
  firstPaymentAmount: numeric("first_payment_amount", { precision: 12, scale: 2 }),
  // additional fees (الرسوم الإضافية)
  additionalFees: jsonb("additional_fees").$type<Array<{ id: string; name: string; amount: string; recurrence: string; dueDate: string; paymentMethod: string }>>(),
  // Custom payment schedule — used only when paymentFrequency === 'custom'.
  // Each entry is one rent installment the user laid out by hand (a due
  // date + the amount due on that date). Replaces the periodic rent loop.
  customSchedule: jsonb("custom_schedule").$type<Array<{ dueDate: string; amount: string }>>(),
  // misc
  status: contractStatusEnum("status").notNull().default("active"),
  isDraft: boolean("is_draft").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
