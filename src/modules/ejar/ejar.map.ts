// Map Ejar (JSON:API) payloads into this API's Contract shape.
//
// Field names verified against the real UAT `GetRentalContracts` payload:
// dates are `start_time`/`end_time`, money is `total_value` /
// `security_deposit_value`, and parties/units are INLINE arrays on
// `attributes` (`tenants`, `lessors`, `units`) — not JSON:API relationships.
// Every accessor still falls back across likely aliases so a shape change
// degrades gracefully instead of throwing. READ-ONLY: nothing is pushed to NHC.

import type { EjarBody, JsonApiResource } from "./ejar.types";

type Attrs = Record<string, unknown>;

function pick(attrs: Attrs | null | undefined, ...keys: string[]): string | null {
  if (!attrs) return null;
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && `${v}`.trim() !== "") return `${v}`;
  }
  return null;
}

const roleOf = (p: Attrs) => String(p?.role || "").toLowerCase();

/**
 * Pick the PRIMARY party from an inline `tenants`/`lessors` array — the actual
 * tenant/lessor (which may be an organization with no `role`), NOT its
 * representative. Prefers the exact role, then any non-representative party.
 */
function party(arr: unknown, preferRole: string): Attrs | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items = arr as Attrs[];
  return (
    items.find((p) => roleOf(p) === preferRole) ||
    items.find((p) => !roleOf(p).includes("representative")) ||
    items[0]
  );
}

/** The representative party (ممثل) in an inline array, if any. */
function representative(arr: unknown): Attrs | null {
  if (!Array.isArray(arr)) return null;
  return (arr as Attrs[]).find((p) => roleOf(p).includes("representative")) || null;
}

const isOrg = (p: Attrs | null | undefined) =>
  !!p && /organization|company|establishment/.test(String(p.type || "").toLowerCase());

/** Coerce the many Ejar status spellings into our contract_status enum. */
export function normalizeStatus(raw: string | null): string {
  const s = (raw || "").toLowerCase();
  if (/active|registered|نشط|ساري|current|valid/.test(s)) return "active";
  if (/expired|منتهي|ended/.test(s)) return "expired";
  if (/terminat|فسخ|منهي/.test(s)) return "terminated";
  if (/cancel|ملغ/.test(s)) return "cancelled";
  if (/pend|draft|waiting|مسودة|قيد/.test(s)) return "pending";
  return "active";
}

export interface EjarContractSummary {
  id: string;
  contractNumber: string;
  contractType: string | null;
  status: string;
  rawStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  propertyName: string | null;
  tenantName: string | null;
  monthlyRent: string | null;
  annualRent: string | null;
}

export function summarizeContract(res: JsonApiResource): EjarContractSummary {
  const a = res.attributes || {};
  const tenant = party(a.tenants, "tenant");
  return {
    id: res.id,
    contractNumber: pick(a, "contract_number", "contractNumber", "number") || res.id,
    contractType: pick(a, "contract_type", "contractType", "type", "rental_type"),
    rawStatus: pick(a, "status", "contract_status", "contractStatus", "state"),
    status: normalizeStatus(pick(a, "status", "contract_status", "contractStatus", "state")),
    startDate: pick(a, "start_time", "start_date", "startDate", "contract_start_date", "from_date"),
    endDate: pick(a, "end_time", "end_date", "endDate", "contract_end_date", "to_date"),
    propertyName: pick(a, "property_name", "propertyName", "property"),
    tenantName: pick(tenant, "name", "full_name", "party_name") || pick(a, "tenant_name", "tenantName"),
    monthlyRent: pick(a, "monthly_rent", "monthlyRent", "rent_amount", "installment_value"),
    annualRent: pick(a, "total_value", "annual_rent", "annualRent", "total_contract_value", "yearly_rent"),
  };
}

export function summarizeContractsBody(body: EjarBody): EjarContractSummary[] {
  const data = body.data;
  if (!data) return [];
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((r) => summarizeContract(r));
}

export interface EjarInvoiceRow {
  id: string;
  number: string | null;
  dueDate: string | null;
  amount: string | null;
  status: string | null;
}

export function summarizeInvoices(body?: EjarBody | null): EjarInvoiceRow[] {
  if (!body?.data) return [];
  const arr = Array.isArray(body.data) ? body.data : [body.data];
  return arr.map((r) => {
    const a = r.attributes || {};
    return {
      id: r.id,
      number: pick(a, "invoice_number", "number", "invoiceNo", "reference"),
      dueDate: pick(a, "due_date", "dueDate", "invoice_date", "date", "due_time"),
      amount: pick(a, "amount", "total", "invoice_amount", "value", "total_amount", "total_value"),
      status: pick(a, "status", "payment_status", "state"),
    };
  });
}

export interface EjarContractDetail {
  contract: JsonApiResource;
  listBody?: EjarBody;
  nationalAddress?: EjarBody | null;
  financial?: EjarBody | null;
  invoices?: EjarBody | null;
}

function firstResource(body?: EjarBody | null): JsonApiResource | null {
  const data = body?.data;
  if (!data) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export interface EjarImportPreview {
  contract: Record<string, unknown>;
  invoices: EjarInvoiceRow[];
  nationalAddress: Record<string, string | null>;
}

/** Assemble the mapped Contract + invoices + address for preview/import. */
export function mapEjarToContract(detail: EjarContractDetail): EjarImportPreview {
  const summary = summarizeContract(detail.contract);
  const a = detail.contract.attributes || {};
  const fin = firstResource(detail.financial)?.attributes || {};
  const na = firstResource(detail.nationalAddress)?.attributes || {};

  const tenant = party(a.tenants, "tenant") || {};
  const tenantRep = representative(a.tenants);
  const lessor = party(a.lessors, "lessor") || {};
  const region = (a.region && typeof a.region === "object" ? (a.region as Attrs) : {}) as Attrs;

  const nationalAddress = {
    buildingNumber: pick(na, "building_number", "buildingNumber", "building_no"),
    street: pick(na, "street", "street_name", "streetName"),
    district: pick(na, "district", "district_name", "neighborhood"),
    city: pick(na, "city", "city_name") || pick(region, "name_ar", "name_en"),
    postalCode: pick(na, "postal_code", "postalCode", "zip_code", "zip"),
    additionalNumber: pick(na, "additional_number", "additionalNumber", "secondary_number"),
    region: pick(region, "name_ar", "name_en") || pick(na, "region", "region_name"),
  };

  const contract: Record<string, unknown> = {
    ejarSource: "ejar",
    ejarContractNumber: summary.contractNumber,
    contractNumber: summary.contractNumber,
    startDate: summary.startDate,
    endDate: summary.endDate,
    status: summary.status,
    monthlyRent: summary.monthlyRent || pick(fin, "monthly_rent", "installment_value", "rent_amount"),
    annualRent: summary.annualRent || pick(fin, "total_value", "annual_rent", "total_contract_value"),
    depositAmount:
      pick(a, "security_deposit_value", "deposit", "deposit_amount", "security_deposit") ||
      pick(fin, "security_deposit_value", "deposit", "deposit_amount"),
    paymentFrequency: pick(a, "payment_frequency", "paymentFrequency", "payment_cycle", "installment_frequency"),
    tenantType: isOrg(tenant) ? "company" : "individual",
    tenantName: pick(tenant, "name", "full_name", "party_name") || summary.tenantName,
    tenantIdNumber: pick(tenant, "id_number", "national_id", "identity_number", "registration_number"),
    tenantPhone: pick(tenant, "phone_number", "phone", "mobile"),
    tenantEmail: pick(tenant, "email"),
    // Organization tenant → unified number + org type + representative.
    companyUnified: pick(tenant, "unified_number"),
    companyOrgType: pick(tenant, "organization_type"),
    repName: pick(tenantRep, "name", "full_name"),
    repIdNumber: pick(tenantRep, "id_number", "national_id", "identity_number"),
    landlordName: pick(lessor, "name", "full_name", "party_name"),
    landlordIdNumber: pick(lessor, "id_number", "national_id", "identity_number"),
    landlordPhone: pick(lessor, "phone_number", "phone", "mobile"),
    landlordEmail: pick(lessor, "email"),
    propertyName: summary.propertyName,
    tenantBuildingNumber: nationalAddress.buildingNumber,
    tenantPostalCode: nationalAddress.postalCode,
    tenantAdditionalNumber: nationalAddress.additionalNumber,
    tenantAddress:
      [nationalAddress.street, nationalAddress.district, nationalAddress.city].filter(Boolean).join("، ") ||
      pick(na, "full_address"),
    notes: `مستورد من إيجار — عقد رقم ${summary.contractNumber}`,
  };

  for (const k of Object.keys(contract)) {
    if (contract[k] === null || contract[k] === undefined || contract[k] === "") delete contract[k];
  }

  return { contract, invoices: summarizeInvoices(detail.invoices), nationalAddress };
}
