// Map Ejar (JSON:API) payloads into this API's Contract shape.
//
// Field names verified against the REAL UAT responses (captured in
// ejar_api_logs):
//   GetRentalContracts   — dates start_time/end_time, total_value,
//                          security_deposit_value, inline tenants/lessors/units.
//   RentalFinancialData  — rent in included[rental_fees].total_rent_amount.
//   RentalContractInvoices — invoices in included[payments]: invoice_amount,
//                          invoice_due_date, payment_status.{ar,en}.
//   NationalAddress      — NO street address; included has property coordinates
//                          + property_type and a unit (unit_number, floor_number,
//                          unit_type). All bilingual fields are {ar,en}.
// READ-ONLY: nothing is pushed to NHC.

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

/**
 * Ejar returns many labels as objects — { ar, en } on the detail endpoints and
 * { name_ar, name_en } on Get Properties/Units. Prefer Arabic, fall back to en.
 */
function bilingual(v: unknown): string | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (o.ar as string) || (o.name_ar as string) || (o.en as string) || (o.name_en as string) || null;
  }
  return v == null || `${v}`.trim() === "" ? null : `${v}`;
}

/** Included resources of a given JSON:API type. */
function includedByType(body: EjarBody | null | undefined, type: string): JsonApiResource[] {
  const inc = body?.included;
  return Array.isArray(inc) ? inc.filter((r) => r.type === type) : [];
}

const roleOf = (p: Attrs) => String(p?.role || "").toLowerCase();

/** Primary party (actual tenant/lessor, possibly an org) — NOT its representative. */
function party(arr: unknown, preferRole: string): Attrs | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items = arr as Attrs[];
  return (
    items.find((p) => roleOf(p) === preferRole) ||
    items.find((p) => !roleOf(p).includes("representative")) ||
    items[0]
  );
}

function representative(arr: unknown): Attrs | null {
  if (!Array.isArray(arr)) return null;
  return (arr as Attrs[]).find((p) => roleOf(p).includes("representative")) || null;
}

const isOrg = (p: Attrs | null | undefined) =>
  !!p && /organization|company|establishment/.test(String(p.type || "").toLowerCase());

export function normalizeStatus(raw: string | null): string {
  const s = (raw || "").toLowerCase();
  if (/active|registered|نشط|ساري|current|valid/.test(s)) return "active";
  if (/expired|منتهي|ended/.test(s)) return "expired";
  if (/terminat|فسخ|منهي/.test(s)) return "terminated";
  if (/cancel|ملغ/.test(s)) return "cancelled";
  if (/pend|draft|waiting|مسودة|قيد/.test(s)) return "pending";
  return "active";
}

/** Ejar payment_frequency → our enum (fallback when there are no invoices). */
function mapFrequency(raw: string | null): string {
  const s = (raw || "").toLowerCase();
  if (/quarter|ربع/.test(s)) return "quarterly";
  if (/semi|نصف/.test(s)) return "semi_annual";
  if (/month|شهري/.test(s)) return "monthly";
  return "annual"; // incl. "one payment" / "دفعة واحدة"
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
  remaining: string | null;
  status: string | null;
}

/** Real invoices live in included[type=payments], not in `data`. */
export function summarizeInvoices(body?: EjarBody | null): EjarInvoiceRow[] {
  return includedByType(body, "payments").map((r) => {
    const a = r.attributes || {};
    return {
      id: r.id,
      number: pick(a, "sequence_number", "invoice_number", "number", "reference"),
      dueDate: pick(a, "invoice_due_date", "due_date", "dueDate", "invoice_issue_date"),
      amount: pick(a, "invoice_amount", "amount", "total", "total_amount"),
      remaining: pick(a, "invoice_remaining_amount", "remaining_amount"),
      status: bilingual(a.payment_status) || pick(a, "status", "payment_status"),
    };
  });
}

/** The rental_fees included resource (RentalFinancialData / Invoices). */
function rentalFee(body?: EjarBody | null): Attrs {
  return includedByType(body, "rental_fees")[0]?.attributes || {};
}

export interface EjarContractDetail {
  contract: JsonApiResource;
  listBody?: EjarBody;
  nationalAddress?: EjarBody | null;
  financial?: EjarBody | null;
  invoices?: EjarBody | null;
  propertiesBody?: EjarBody | null;
  unitsBody?: EjarBody | null;
}

export interface EjarPropertyInfo {
  ejarId: string | null;
  name: string | null;
  propertyType: string | null;
  district: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  deedNumber: string | null;
  yearBuilt: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface EjarUnitInfo {
  ejarId: string | null;
  unitNumber: string | null;
  unitType: string | null;
  floor: string | null;
  area: string | null;
  rooms: string | null;
  rentPrice: string | null;
}

export interface EjarImportPreview {
  contract: Record<string, unknown>;
  invoices: EjarInvoiceRow[];
  nationalAddress: Record<string, string | null>;
  property: EjarPropertyInfo;
  units: EjarUnitInfo[];
}

/** Find a resource in a body's `data` array by id. */
function findData(body: EjarBody | null | undefined, id: string | null): Attrs {
  if (!id || !body?.data) return {};
  const arr = Array.isArray(body.data) ? body.data : [body.data];
  return arr.find((r) => r.id === id)?.attributes || {};
}

function localizedName(v: unknown): string | null {
  if (v && typeof v === "object") return bilingual(v);
  return v == null ? null : `${v}`;
}

/** Build the local Property from the contract + optional GetProperties enrich. */
export function mapEjarProperty(detail: EjarContractDetail): EjarPropertyInfo {
  const a = detail.contract.attributes || {};
  const pid = pick(a, "property_id");
  const p = findData(detail.propertiesBody, pid);
  const region = (a.region && typeof a.region === "object" ? (a.region as Attrs) : {}) as Attrs;
  return {
    ejarId: pid,
    name: pick(a, "property_name") || pick(p, "name"),
    propertyType: pick(a, "property_type") || pick(p, "property_type"),
    district: localizedName(p.district),
    street: pick(p, "street_name", "street"),
    city: localizedName(p.city),
    region: pick(region, "name_ar", "name_en") || localizedName(p.region),
    postalCode: pick(p, "postcode", "postal_code"),
    deedNumber: pick(p, "title_deed_number", "deed_number"),
    yearBuilt: pick(p, "building_year", "year_built"),
    latitude: pick(a, "latitude") || pick(p, "latitude"),
    longitude: pick(a, "longitude") || pick(p, "longitude"),
  };
}

/** Build the local Unit(s) from the contract.units + optional GetUnits enrich. */
export function mapEjarUnits(detail: EjarContractDetail): EjarUnitInfo[] {
  const a = detail.contract.attributes || {};
  const units = Array.isArray(a.units) ? (a.units as Attrs[]) : [];
  const naUnit = includedByType(detail.nationalAddress, "national_address_units")[0]?.attributes || {};
  return units.map((u) => {
    const uid = pick(u, "id", "unit_id");
    const full = findData(detail.unitsBody, uid);
    return {
      ejarId: uid,
      unitNumber: pick(u, "unit_number") || pick(full, "unit_number"),
      unitType: pick(u, "unit_type") || pick(full, "unit_type"),
      floor: pick(full, "floor_number") || pick(naUnit, "floor_number"),
      area: pick(full, "area"),
      rooms: pick(full, "room_count", "bedrooms"),
      rentPrice: pick(full, "last_rental_price", "rent_price"),
    };
  });
}

export function mapEjarToContract(detail: EjarContractDetail): EjarImportPreview {
  const summary = summarizeContract(detail.contract);
  const a = detail.contract.attributes || {};

  const tenant = party(a.tenants, "tenant") || {};
  const tenantRep = representative(a.tenants);
  const lessor = party(a.lessors, "lessor") || {};
  const region = (a.region && typeof a.region === "object" ? (a.region as Attrs) : {}) as Attrs;

  // Rent: RentalFinancialData.total_rent_amount is authoritative; fall back to
  // the list's total_value.
  const fee = rentalFee(detail.financial);
  const totalRent = pick(fee, "total_rent_amount", "total_rent", "rent_amount") || summary.annualRent;

  // Real invoices → a custom payment schedule (exact amounts + due dates).
  const invoices = summarizeInvoices(detail.invoices);
  const customSchedule = invoices
    .filter((inv) => inv.dueDate && Number(inv.amount) > 0)
    .map((inv) => ({ dueDate: String(inv.dueDate).slice(0, 10), amount: String(Number(inv.amount)) }));

  // National address: no street — coordinates + property/unit descriptors.
  const naProp = includedByType(detail.nationalAddress, "national_address_properties")[0]?.attributes || {};
  const naUnit = includedByType(detail.nationalAddress, "national_address_units")[0]?.attributes || {};
  const coords = (naProp.coordinates && typeof naProp.coordinates === "object" ? naProp.coordinates : {}) as Attrs;
  const listUnit = (Array.isArray(a.units) && (a.units as Attrs[])[0]) || {};
  const nationalAddress = {
    propertyType: bilingual(naProp.property_type) || pick(a, "property_type"),
    unitType: bilingual(naUnit.unit_type) || pick(listUnit, "unit_type"),
    unitNumber: pick(naUnit, "unit_number") || pick(listUnit, "unit_number"),
    floorNumber: pick(naUnit, "floor_number"),
    region: pick(region, "name_ar", "name_en"),
    latitude: coords.latitude != null ? `${coords.latitude}` : pick(a, "latitude"),
    longitude: coords.longitude != null ? `${coords.longitude}` : pick(a, "longitude"),
  };

  const unitLabel = [nationalAddress.unitNumber && `وحدة ${nationalAddress.unitNumber}`, nationalAddress.floorNumber && `دور ${nationalAddress.floorNumber}`]
    .filter(Boolean)
    .join(" - ");

  const contract: Record<string, unknown> = {
    ejarSource: "ejar",
    ejarContractNumber: summary.contractNumber,
    contractNumber: summary.contractNumber,
    startDate: summary.startDate,
    endDate: summary.endDate,
    status: summary.status,
    annualRent: totalRent,
    monthlyRent: totalRent, // representative; custom schedule drives installments
    depositAmount: pick(a, "security_deposit_value", "deposit", "deposit_amount", "security_deposit"),
    paymentFrequency: customSchedule.length ? "custom" : mapFrequency(bilingual(fee.payment_frequency) || pick(a, "payment_frequency")),
    customSchedule: customSchedule.length ? customSchedule : undefined,
    tenantType: isOrg(tenant) ? "company" : "individual",
    tenantName: pick(tenant, "name", "full_name", "party_name") || summary.tenantName,
    tenantIdNumber: pick(tenant, "id_number", "national_id", "identity_number", "registration_number"),
    tenantPhone: pick(tenant, "phone_number", "phone", "mobile"),
    tenantEmail: pick(tenant, "email"),
    companyUnified: pick(tenant, "unified_number"),
    companyOrgType: pick(tenant, "organization_type"),
    repName: pick(tenantRep, "name", "full_name"),
    repIdNumber: pick(tenantRep, "id_number", "national_id", "identity_number"),
    landlordName: pick(lessor, "name", "full_name", "party_name"),
    landlordIdNumber: pick(lessor, "id_number", "national_id", "identity_number"),
    landlordPhone: pick(lessor, "phone_number", "phone", "mobile"),
    landlordEmail: pick(lessor, "email"),
    propertyName: summary.propertyName,
    notes: [`مستورد من إيجار — عقد رقم ${summary.contractNumber}`, nationalAddress.propertyType, unitLabel]
      .filter(Boolean)
      .join(" — "),
  };

  for (const k of Object.keys(contract)) {
    if (contract[k] === null || contract[k] === undefined || contract[k] === "") delete contract[k];
  }

  return { contract, invoices, nationalAddress, property: mapEjarProperty(detail), units: mapEjarUnits(detail) };
}
