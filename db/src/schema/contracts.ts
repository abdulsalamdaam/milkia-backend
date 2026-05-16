import { pgTable, text, serial, timestamp, integer, numeric, boolean, date, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export const contractStatusEnum = pgEnum("contract_status", ["active", "expired", "terminated", "pending"]);
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["monthly", "quarterly", "semi_annual", "annual"]);

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  contractNumber: text("contract_number").notNull().unique(),
  // tenant
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
  monthlyRent: numeric("monthly_rent", { precision: 12, scale: 2 }).notNull(),
  paymentFrequency: paymentFrequencyEnum("payment_frequency").notNull().default("monthly"),
  depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }),
  // VAT (15%) applied to each rent installment, and annual rent escalation
  // (تصاعد الإيجار) — a percentage compounded once per contract year.
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  escalationRate: numeric("escalation_rate", { precision: 5, scale: 2 }).notNull().default("0"),
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
