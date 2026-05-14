/**
 * Permission catalog. Add new keys as features are added — these strings are
 * the contract between the API guard and the dashboard's UI gating.
 */
export const PERMISSIONS = {
  DEEDS_VIEW:   "deeds.view",
  DEEDS_WRITE:  "deeds.write",
  DEEDS_DELETE: "deeds.delete",

  PROPERTIES_VIEW:   "properties.view",
  PROPERTIES_WRITE:  "properties.write",
  PROPERTIES_DELETE: "properties.delete",

  UNITS_VIEW:   "units.view",
  UNITS_WRITE:  "units.write",
  UNITS_DELETE: "units.delete",

  CONTRACTS_VIEW:   "contracts.view",
  CONTRACTS_WRITE:  "contracts.write",
  CONTRACTS_DELETE: "contracts.delete",

  PAYMENTS_VIEW:  "payments.view",
  PAYMENTS_WRITE: "payments.write",

  OWNERS_VIEW:   "owners.view",
  OWNERS_WRITE:  "owners.write",
  OWNERS_DELETE: "owners.delete",

  TENANTS_VIEW:   "tenants.view",
  TENANTS_WRITE:  "tenants.write",
  TENANTS_DELETE: "tenants.delete",

  MAINTENANCE_VIEW:   "maintenance.view",
  MAINTENANCE_WRITE:  "maintenance.write",
  MAINTENANCE_DELETE: "maintenance.delete",

  FACILITIES_VIEW:   "facilities.view",
  FACILITIES_WRITE:  "facilities.write",
  FACILITIES_DELETE: "facilities.delete",

  CAMPAIGNS_VIEW:   "campaigns.view",
  CAMPAIGNS_WRITE:  "campaigns.write",
  CAMPAIGNS_DELETE: "campaigns.delete",

  REPORTS_VIEW: "reports.view",

  SUPPORT_VIEW:    "support.view",
  SUPPORT_RESPOND: "support.respond",

  ADMIN_DASHBOARD: "admin.dashboard",
  ADMIN_USERS:     "admin.users",
  ADMIN_ROLES:     "admin.roles",
  ADMIN_DEMO:      "admin.demo",

  INVOICES_VIEW:   "invoices.view",
  INVOICES_WRITE:  "invoices.write",
  INVOICES_DELETE: "invoices.delete",
  ZATCA_ONBOARD:              "zatca.onboard",
  ZATCA_PROMOTE_PRODUCTION:   "zatca.promote-production",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS) as Permission[];

/** Read-only, viewer-style preset for a typical accountant or read-only user. */
const VIEW_ONLY: Permission[] = [
  PERMISSIONS.DEEDS_VIEW,
  PERMISSIONS.PROPERTIES_VIEW, PERMISSIONS.UNITS_VIEW, PERMISSIONS.CONTRACTS_VIEW,
  PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.OWNERS_VIEW, PERMISSIONS.TENANTS_VIEW,
  PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.FACILITIES_VIEW, PERMISSIONS.CAMPAIGNS_VIEW,
  PERMISSIONS.REPORTS_VIEW, PERMISSIONS.INVOICES_VIEW,
];

const FULL_TENANT_ADMIN: Permission[] = [
  PERMISSIONS.DEEDS_VIEW, PERMISSIONS.DEEDS_WRITE, PERMISSIONS.DEEDS_DELETE,
  PERMISSIONS.PROPERTIES_VIEW, PERMISSIONS.PROPERTIES_WRITE, PERMISSIONS.PROPERTIES_DELETE,
  PERMISSIONS.UNITS_VIEW, PERMISSIONS.UNITS_WRITE, PERMISSIONS.UNITS_DELETE,
  PERMISSIONS.CONTRACTS_VIEW, PERMISSIONS.CONTRACTS_WRITE, PERMISSIONS.CONTRACTS_DELETE,
  PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_WRITE,
  PERMISSIONS.OWNERS_VIEW, PERMISSIONS.OWNERS_WRITE, PERMISSIONS.OWNERS_DELETE,
  PERMISSIONS.TENANTS_VIEW, PERMISSIONS.TENANTS_WRITE, PERMISSIONS.TENANTS_DELETE,
  PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_WRITE, PERMISSIONS.MAINTENANCE_DELETE,
  PERMISSIONS.FACILITIES_VIEW, PERMISSIONS.FACILITIES_WRITE, PERMISSIONS.FACILITIES_DELETE,
  PERMISSIONS.CAMPAIGNS_VIEW, PERMISSIONS.CAMPAIGNS_WRITE, PERMISSIONS.CAMPAIGNS_DELETE,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.SUPPORT_VIEW,
  PERMISSIONS.INVOICES_VIEW, PERMISSIONS.INVOICES_WRITE, PERMISSIONS.INVOICES_DELETE,
  PERMISSIONS.ZATCA_ONBOARD, PERMISSIONS.ZATCA_PROMOTE_PRODUCTION,
];

/**
 * Default permissions per role enum. `super_admin` gets everything; `admin`
 * gets everything except platform-level admin operations; `user` is a tenant-
 * facing landlord with full property control; `demo` is read-only.
 */
export const ROLE_PRESETS: Record<"super_admin" | "admin" | "user" | "demo", Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: [
    ...FULL_TENANT_ADMIN,
    PERMISSIONS.SUPPORT_RESPOND,
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_USERS,
  ],
  user: FULL_TENANT_ADMIN,
  demo: VIEW_ONLY,
};

export function effectivePermissions(role: keyof typeof ROLE_PRESETS, custom?: string[] | null): Permission[] {
  if (custom && Array.isArray(custom)) return custom as Permission[];
  return ROLE_PRESETS[role] || [];
}

export function hasPermission(perms: string[] | undefined | null, key: Permission): boolean {
  if (!perms) return false;
  return perms.includes(key);
}

/**
 * Employee role templates picked by an owner when adding a team member. These
 * are *labels*, not role-enum values — the underlying user.role stays "user"
 * (so `ROLE_PRESETS.user` is the upper bound) and we copy these permissions
 * into user.permissions JSONB. Owners can then trim/extend per individual.
 */
export const EMPLOYEE_PRESETS: Record<string, { labelAr: string; labelEn: string; permissions: Permission[] }> = {
  general: {
    labelAr: "مدير عام",
    labelEn: "General Manager",
    permissions: FULL_TENANT_ADMIN,
  },
  accountant: {
    labelAr: "محاسب",
    labelEn: "Accountant",
    permissions: [
      PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_WRITE,
      PERMISSIONS.CONTRACTS_VIEW,
      PERMISSIONS.TENANTS_VIEW,
      PERMISSIONS.OWNERS_VIEW,
      PERMISSIONS.PROPERTIES_VIEW,
      PERMISSIONS.UNITS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.INVOICES_VIEW, PERMISSIONS.INVOICES_WRITE,
      PERMISSIONS.ZATCA_ONBOARD,
    ],
  },
  propertyManager: {
    labelAr: "مدير عقار",
    labelEn: "Property Manager",
    permissions: [
      PERMISSIONS.PROPERTIES_VIEW, PERMISSIONS.PROPERTIES_WRITE,
      PERMISSIONS.UNITS_VIEW, PERMISSIONS.UNITS_WRITE,
      PERMISSIONS.CONTRACTS_VIEW, PERMISSIONS.CONTRACTS_WRITE,
      PERMISSIONS.TENANTS_VIEW, PERMISSIONS.TENANTS_WRITE,
      PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_WRITE,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.OWNERS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  collector: {
    labelAr: "محصّل",
    labelEn: "Collector",
    permissions: [
      PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_WRITE,
      PERMISSIONS.TENANTS_VIEW,
      PERMISSIONS.CONTRACTS_VIEW,
    ],
  },
  assistant: {
    labelAr: "مساعد",
    labelEn: "Assistant",
    permissions: [
      PERMISSIONS.PROPERTIES_VIEW,
      PERMISSIONS.UNITS_VIEW,
      PERMISSIONS.CONTRACTS_VIEW,
      PERMISSIONS.TENANTS_VIEW,
      PERMISSIONS.OWNERS_VIEW,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
};
