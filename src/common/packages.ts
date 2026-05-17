/**
 * Subscription packages. Two fixed plans drive the landlord / property /
 * unit quotas. The plan key is stored on the top-level user row
 * (`users.package_plan`); employees inherit their owner's plan.
 */

export type PackagePlan = "individual_owner" | "broker";

export interface PackageDef {
  key: PackagePlan;
  labelAr: string;
  labelEn: string;
  /** Max landlord (owner) records. Individual owner is his own sole landlord. */
  maxLandlords: number;
  maxProperties: number;
  maxUnits: number;
}

export const PACKAGES: Record<PackagePlan, PackageDef> = {
  individual_owner: {
    key: "individual_owner",
    labelAr: "مالك فردي",
    labelEn: "Individual Owner",
    maxLandlords: 1,
    maxProperties: 10,
    maxUnits: 50,
  },
  broker: {
    key: "broker",
    labelAr: "وسيط عقاري",
    labelEn: "Broker",
    maxLandlords: 30,
    maxProperties: 50,
    maxUnits: 500,
  },
};

/** Existing/unassigned accounts fall back to this — never lock anyone out. */
export const DEFAULT_PACKAGE: PackagePlan = "broker";

export function resolvePackage(plan: string | null | undefined): PackageDef {
  return PACKAGES[(plan as PackagePlan)] ?? PACKAGES[DEFAULT_PACKAGE];
}
