/**
 * Subscription packages. Four tiers gate the unit quota (properties scale
 * with units; landlords are unlimited — the Landlords tab is available on
 * every plan). The plan key is stored on the top-level user row
 * (`users.package_plan`); employees inherit their owner's plan.
 *
 * Account *type* (individual vs company) is a separate concept stored on
 * `users.user_type` and only drives Settings visibility — it is NOT a plan.
 */

export type PackagePlan = "tenant" | "basic" | "advanced" | "professional" | "enterprise";

/** Two product modes: the tenant self-tracker vs the full landlord portal. */
export type PackageMode = "tenant" | "landlord";

/** Sentinel for "unlimited" — large enough to never gate in practice. */
export const UNLIMITED = 1_000_000;

export interface PackageDef {
  key: PackagePlan;
  labelAr: string;
  labelEn: string;
  /** tenant = personal contract tracker; landlord = full portal. */
  mode: PackageMode;
  /** Landlord (owner) records — unlimited on every plan. */
  maxLandlords: number;
  maxProperties: number;
  maxUnits: number;
  /** Team members (employees) the owner may add — excludes the owner itself. */
  maxUsers: number;
}

export const PACKAGES: Record<PackagePlan, PackageDef> = {
  // Tenant package — a self-managed personal tracker (1 unit, no team, no
  // financials/reports/maintenance). The account holder IS the tenant.
  // Landing limits: Tenant 50 units / 1 user, Basic 500 / 3, Pro 1,000 / 6,
  // Enterprise unlimited. The landing "users" count includes the account
  // holder, so maxUsers (added employees) = that number − 1.
  tenant: {
    key: "tenant",
    labelAr: "المستأجرين",
    labelEn: "Tenants",
    mode: "tenant",
    maxLandlords: 0,
    maxProperties: 50,
    maxUnits: 50,
    maxUsers: 0,
  },
  basic: {
    key: "basic",
    labelAr: "الأساسية",
    labelEn: "Basic",
    mode: "landlord",
    maxLandlords: UNLIMITED,
    maxProperties: 500,
    maxUnits: 500,
    maxUsers: 2,
  },
  // Legacy tier — not offered anymore; mapped to the closest current limits.
  advanced: {
    key: "advanced",
    labelAr: "المتقدمة",
    labelEn: "Advanced",
    mode: "landlord",
    maxLandlords: UNLIMITED,
    maxProperties: 500,
    maxUnits: 500,
    maxUsers: 2,
  },
  professional: {
    key: "professional",
    labelAr: "المطورة",
    labelEn: "Pro",
    mode: "landlord",
    maxLandlords: UNLIMITED,
    maxProperties: 1000,
    maxUnits: 1000,
    maxUsers: 5,
  },
  enterprise: {
    key: "enterprise",
    labelAr: "الأعمال",
    labelEn: "Enterprise",
    mode: "landlord",
    maxLandlords: UNLIMITED,
    maxProperties: UNLIMITED,
    maxUnits: UNLIMITED,
    maxUsers: UNLIMITED,
  },
};

/** Existing/unassigned accounts fall back to this — never lock anyone out. */
export const DEFAULT_PACKAGE: PackagePlan = "professional";

/** Pre-tier plan keys map onto the closest new tier (kept for old rows). */
const LEGACY_ALIASES: Record<string, PackagePlan> = {
  individual_owner: "basic",
  broker: "professional",
};

export function resolvePackage(plan: string | null | undefined): PackageDef {
  if (plan && plan in PACKAGES) return PACKAGES[plan as PackagePlan];
  if (plan && LEGACY_ALIASES[plan]) return PACKAGES[LEGACY_ALIASES[plan]];
  return PACKAGES[DEFAULT_PACKAGE];
}

/** Whether a string is one of the current plan keys. */
export function isPackagePlan(plan: string | null | undefined): plan is PackagePlan {
  return !!plan && plan in PACKAGES;
}

/** The product mode (tenant tracker vs landlord portal) for a plan. */
export function packageMode(plan: string | null | undefined): PackageMode {
  return resolvePackage(plan).mode;
}
