// Map Ejar (JSON:API) payloads into this API's Contract shape.
//
// The UAT payloads carry many optional, snake_cased attributes and the exact
// names vary between the ejar / ejarext products. Every accessor tries a list
// of likely keys and falls back to null rather than throwing. READ-ONLY: this
// only shapes what we pull for import + preview; nothing is pushed to NHC.

import type { EjarBody, JsonApiRef, JsonApiResource } from "./ejar.types";

type Attrs = Record<string, unknown>;

function pick(attrs: Attrs | undefined, ...keys: string[]): string | null {
  if (!attrs) return null;
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && `${v}`.trim() !== "") return `${v}`;
  }
  return null;
}

function resolve(body: EjarBody | undefined, ref: JsonApiRef | null | undefined): JsonApiResource | null {
  if (!body?.included || !ref) return null;
  return body.included.find((r) => r.type === ref.type && r.id === ref.id) ?? null;
}

function firstRel(res: JsonApiResource | undefined, name: string): JsonApiRef | null {
  const rel = res?.relationships?.[name]?.data;
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** Coerce the many Ejar status spellings into our contract_status enum. */
export function normalizeStatus(raw: string | null): string {
  const s = (raw || "").toLowerCase();
  if (/active|نشط|ساري|current|valid/.test(s)) return "active";
  if (/expired|منتهي|ended/.test(s)) return "expired";
  if (/terminat|فسخ|منهي/.test(s)) return "terminated";
  if (/cancel|ملغ/.test(s)) return "cancelled";
  if (/pend|draft|مسودة|قيد/.test(s)) return "pending";
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

export function summarizeContract(res: JsonApiResource, body?: EjarBody): EjarContractSummary {
  const a = res.attributes || {};
  const propertyRes = resolve(body, firstRel(res, "property")) || resolve(body, firstRel(res, "properties"));
  const tenantRes =
    resolve(body, firstRel(res, "tenant")) ||
    resolve(body, firstRel(res, "lessee")) ||
    resolve(body, firstRel(res, "party"));

  return {
    id: res.id,
    contractNumber: pick(a, "contract_number", "contractNumber", "number", "ejar_contract_number") || res.id,
    contractType: pick(a, "contract_type", "contractType", "type", "rental_type"),
    rawStatus: pick(a, "contract_status", "status", "contractStatus", "state"),
    status: normalizeStatus(pick(a, "contract_status", "status", "contractStatus", "state")),
    startDate: pick(a, "start_date", "startDate", "contract_start_date", "from_date"),
    endDate: pick(a, "end_date", "endDate", "contract_end_date", "to_date"),
    propertyName:
      pick(a, "property_name", "propertyName", "property") ||
      pick(propertyRes?.attributes, "name", "property_name", "title"),
    tenantName:
      pick(a, "tenant_name", "tenantName", "lessee_name", "tenant") ||
      pick(tenantRes?.attributes, "name", "full_name", "party_name"),
    monthlyRent: pick(a, "monthly_rent", "monthlyRent", "rent_amount", "monthly_amount"),
    annualRent: pick(a, "annual_rent", "annualRent", "total_rent", "yearly_rent", "total_contract_value"),
  };
}

export function summarizeContractsBody(body: EjarBody): EjarContractSummary[] {
  const data = body.data;
  if (!data) return [];
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((r) => summarizeContract(r, body));
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
      dueDate: pick(a, "due_date", "dueDate", "invoice_date", "date"),
      amount: pick(a, "amount", "total", "invoice_amount", "value", "total_amount"),
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
  const summary = summarizeContract(detail.contract, detail.listBody);
  const c = detail.contract.attributes || {};
  const fin = firstResource(detail.financial)?.attributes || {};
  const na = firstResource(detail.nationalAddress)?.attributes || {};

  const propertyRes =
    resolve(detail.listBody, firstRel(detail.contract, "property")) ||
    resolve(detail.listBody, firstRel(detail.contract, "properties"));
  const tenantRes =
    resolve(detail.listBody, firstRel(detail.contract, "tenant")) ||
    resolve(detail.listBody, firstRel(detail.contract, "lessee"));
  const lessorRes =
    resolve(detail.listBody, firstRel(detail.contract, "lessor")) ||
    resolve(detail.listBody, firstRel(detail.contract, "landlord")) ||
    resolve(detail.listBody, firstRel(detail.contract, "owner"));

  const nationalAddress = {
    buildingNumber: pick(na, "building_number", "buildingNumber", "building_no"),
    street: pick(na, "street", "street_name", "streetName"),
    district: pick(na, "district", "district_name", "neighborhood"),
    city: pick(na, "city", "city_name"),
    postalCode: pick(na, "postal_code", "postalCode", "zip_code", "zip"),
    additionalNumber: pick(na, "additional_number", "additionalNumber", "secondary_number"),
    region: pick(na, "region", "region_name"),
  };

  const contract: Record<string, unknown> = {
    ejarSource: "ejar",
    ejarContractNumber: summary.contractNumber,
    contractNumber: summary.contractNumber,
    startDate: summary.startDate,
    endDate: summary.endDate,
    status: summary.status,
    monthlyRent: summary.monthlyRent || pick(fin, "monthly_rent", "monthlyRent", "rent_amount", "monthly_amount"),
    annualRent: summary.annualRent || pick(fin, "annual_rent", "annualRent", "total_rent", "total_contract_value"),
    depositAmount: pick(c, "deposit", "deposit_amount", "security_deposit") || pick(fin, "deposit", "deposit_amount"),
    paymentFrequency: pick(c, "payment_frequency", "paymentFrequency", "payment_cycle", "installment_frequency"),
    tenantName: summary.tenantName || pick(tenantRes?.attributes, "name", "full_name", "party_name"),
    tenantIdNumber: pick(tenantRes?.attributes, "id_number", "national_id", "identity_number") || pick(c, "tenant_id_number"),
    tenantPhone: pick(tenantRes?.attributes, "phone", "mobile", "mobile_number"),
    tenantEmail: pick(tenantRes?.attributes, "email"),
    landlordName: pick(lessorRes?.attributes, "name", "full_name", "party_name") || pick(c, "lessor_name", "landlord_name"),
    landlordIdNumber: pick(lessorRes?.attributes, "id_number", "national_id", "identity_number") || pick(c, "lessor_id_number"),
    landlordPhone: pick(lessorRes?.attributes, "phone", "mobile", "mobile_number"),
    landlordEmail: pick(lessorRes?.attributes, "email"),
    propertyName: summary.propertyName || pick(propertyRes?.attributes, "name", "property_name", "title"),
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
