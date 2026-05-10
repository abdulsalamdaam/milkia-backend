import {
  Body, Controller, Get, Post, UseGuards, BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { ZatcaOnboardingService, type SellerProfileInput } from "./services/zatca-onboarding.service";
import type { ZatcaEnv } from "./services/zatca-api.service";

@Controller("zatca")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ZatcaOnboardingController {
  constructor(private readonly onboarding: ZatcaOnboardingService) {}

  /**
   * GET /zatca/credentials
   * Read seller profile + onboarding state. Secrets are NOT returned — only
   * presence flags so the dashboard can show a checklist.
   */
  @Get("credentials")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async getCreds(@CurrentUser() user: AuthUser) {
    const c = await this.onboarding.getCredentials(scopeId(user));
    if (!c) return { configured: false };
    return {
      configured: true,
      activeEnvironment: c.activeEnvironment,
      seller: {
        name: c.sellerName,
        nameAr: c.sellerNameAr,
        vatNumber: c.sellerVatNumber,
        crn: c.sellerCrn,
        street: c.sellerStreet,
        buildingNo: c.sellerBuildingNo,
        district: c.sellerDistrict,
        city: c.sellerCity,
        postalZone: c.sellerPostalZone,
        additionalNo: c.sellerAdditionalNo,
      },
      csrFields: {
        serialNumber: c.serialNumber,
        organizationIdentifier: c.organizationIdentifier,
        organizationUnitName: c.organizationUnitName,
        invoiceType: c.invoiceType,
        locationAddress: c.locationAddress,
        industryCategory: c.industryCategory,
        countryName: c.countryName,
        commonName: c.commonName,
      },
      sandbox: {
        onboarded: !!c.sandboxCertPem,
        onboardedAt: c.sandboxOnboardedAt,
        icv: c.sandboxIcv,
        complianceRequestId: c.sandboxComplianceRequestId,
      },
      production: {
        onboarded: !!c.prodCertPem,
        onboardedAt: c.prodOnboardedAt,
        icv: c.prodIcv,
        complianceRequestId: c.prodComplianceRequestId,
      },
    };
  }

  /**
   * POST /zatca/profile
   * Create or update the seller profile. Required before onboarding.
   */
  @Post("profile")
  @RequirePermissions(PERMISSIONS.ZATCA_ONBOARD)
  async upsertProfile(@CurrentUser() user: AuthUser, @Body() body: SellerProfileInput) {
    if (!body?.sellerName || !body.sellerVatNumber || !body.sellerStreet) {
      throw new BadRequestException("sellerName, sellerVatNumber, sellerStreet are required");
    }
    return this.onboarding.upsertProfile(scopeId(user), body);
  }

  /**
   * POST /zatca/onboarding/:env/compliance  { otp }
   * Generate CSR + exchange for compliance CSID. `env` ∈ sandbox/simulation/production.
   * Sandbox OTP is the fixed string "123456".
   */
  @Post("onboarding/:env/compliance")
  @RequirePermissions(PERMISSIONS.ZATCA_ONBOARD)
  async issueComplianceCsid(
    @CurrentUser() user: AuthUser,
    @Body() body: { otp?: string; env?: ZatcaEnv },
    // env can also come from the path
  ) {
    const env: ZatcaEnv = (body.env ?? "sandbox") as ZatcaEnv;
    return this.onboarding.issueComplianceCsid(scopeId(user), env, body.otp);
  }

  /**
   * POST /zatca/onboarding/production
   * Promote the existing compliance CSID to production CSID. Only after the
   * test cycle has been completed for the same compliance CSID (≥1 of each
   * doc type signed and accepted).
   */
  @Post("onboarding/production")
  @RequirePermissions(PERMISSIONS.ZATCA_ONBOARD)
  async issueProductionCsid(@CurrentUser() user: AuthUser, @Body() body: { source?: "sandbox" | "production" }) {
    return this.onboarding.issueProductionCsid(scopeId(user), body.source ?? "production");
  }

  /**
   * POST /zatca/switch  { env }
   * 1-click switch active environment. Refuses to flip to production unless
   * production credentials exist AND the test cycle has been completed.
   */
  @Post("switch")
  @RequirePermissions(PERMISSIONS.ZATCA_PROMOTE_PRODUCTION)
  async switchEnv(@CurrentUser() user: AuthUser, @Body() body: { env: ZatcaEnv }) {
    if (!body?.env) throw new BadRequestException("env is required");
    return this.onboarding.switchEnvironment(scopeId(user), body.env);
  }

  /**
   * POST /zatca/reset-chain  { env }
   * Reset the PIH chain (and soft-delete all invoices in the env) so a new
   * onboarding cycle can be started cleanly. Use sparingly — destroys ICV
   * continuity for the env.
   */
  @Post("reset-chain")
  @RequirePermissions(PERMISSIONS.ZATCA_PROMOTE_PRODUCTION)
  async resetChain(@CurrentUser() user: AuthUser, @Body() body: { env: ZatcaEnv }) {
    if (!body?.env) throw new BadRequestException("env is required");
    await this.onboarding.resetChain(scopeId(user), body.env);
    return { ok: true };
  }
}
