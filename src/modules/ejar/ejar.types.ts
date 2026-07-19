// Types + endpoint registry for the NHC / Takamolat "Ejar" integration.
//
// Every Ejar response shares one envelope: a `Header` (status + tracing) and a
// `Body` in JSON:API shape (`data` / `included` / `meta` / `links`). The client
// unwraps the envelope and returns the `Body`.

export interface EjarStatus {
  Code: number;
  Description?: string;
}

export interface EjarHeader {
  ResTime?: string;
  ChId?: string;
  RefId?: string;
  ReqID?: string;
  Status?: EjarStatus;
}

export interface JsonApiRef {
  type: string;
  id: string;
}

export interface JsonApiResource<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes?: A;
  relationships?: Record<string, { data?: JsonApiRef | JsonApiRef[] | null }>;
  links?: Record<string, unknown>;
}

export interface EjarBody<T = Record<string, unknown>> {
  data?: JsonApiResource<T> | JsonApiResource<T>[] | null;
  included?: JsonApiResource[];
  meta?: { count?: number; [k: string]: unknown };
  links?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EjarEnvelope<T = Record<string, unknown>> {
  Header?: EjarHeader;
  Body?: EjarBody<T>;
}

/* ── Endpoint registry — the six verified endpoints ── */

export type EjarEndpointKey =
  | "getRentalContracts"
  | "getProperties"
  | "getUnits"
  | "nationalAddress"
  | "rentalContractInvoices"
  | "rentalFinancialData";

export interface EjarEndpointDef {
  method: "GET";
  path: string;
  /** "A" = /v1/ejar/* (by contractNumber); "B" = /v1/ejarext/* (by id_number). */
  group: "A" | "B";
  required: string[];
  label: string;
}

export const EJAR_ENDPOINTS: Record<EjarEndpointKey, EjarEndpointDef> = {
  getRentalContracts: { method: "GET", path: "/v1/ejarext/GetRentalContracts", group: "B", required: ["id_number"], label: "Get Rental Contracts" },
  getProperties: { method: "GET", path: "/v1/ejarext/GetProperties", group: "B", required: ["id_number"], label: "Get Properties" },
  getUnits: { method: "GET", path: "/v1/ejarext/GetUnits", group: "B", required: ["id_number"], label: "Get Units" },
  nationalAddress: { method: "GET", path: "/v1/ejar/NationalAddress", group: "A", required: ["contractNumber"], label: "National Address" },
  rentalContractInvoices: { method: "GET", path: "/v1/ejar/RentalContractInvoices", group: "A", required: ["contractNumber"], label: "Rental Contract Invoices" },
  rentalFinancialData: { method: "GET", path: "/v1/ejar/RentalFinancialData", group: "A", required: ["contractNumber"], label: "Rental Financial Data" },
};

export function isEjarEndpointKey(k: unknown): k is EjarEndpointKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(EJAR_ENDPOINTS, k);
}

/** In-memory shape of a log row before it is persisted (mirrors the DB row). */
export interface EjarLogRecordInput {
  userId: number | null;
  env: string;
  endpoint: EjarEndpointKey | string;
  method: string;
  url: string;
  params: Record<string, string>;
  requestHeaders: Record<string, string>;
  status: number | null;
  ejarStatus: number | null;
  transactionId: string | null;
  durationMs: number;
  attempts: number;
  responseBody: unknown;
  bodyTruncated: boolean;
  error: string | null;
}
