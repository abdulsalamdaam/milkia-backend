import {
  Body, Controller, Get, Post, Query, UseGuards, BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { ZatcaOnboardingService, type SellerProfileInput } from "./services/zatca-onboarding.service";
import { InvoiceService } from "./services/invoice.service";
import type { ZatcaEnv } from "./services/zatca-api.service";

@ApiTags("zatca")
@ApiBearerAuth("user-jwt")
@Controller("zatca")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ZatcaOnboardingController {
  constructor(
    private readonly onboarding: ZatcaOnboardingService,
    private readonly invoices: InvoiceService,
  ) {}

  /**
   * POST /zatca/compliance-check  { ownerId }
   * Verify a landlord's integration: build + sign a sample invoice and submit
   * it to ZATCA's compliance endpoint. Returns ZATCA's verdict (pass / errors).
   * Nothing is persisted.
   */
  @Post("compliance-check")
  @RequirePermissions(PERMISSIONS.ZATCA_ONBOARD)
  async complianceCheck(@CurrentUser() user: AuthUser, @Body() body: { ownerId?: number }) {
    return this.invoices.complianceCheck(scopeId(user), this.oid(body?.ownerId));
  }

  /** Parse an optional landlord id (the per-landlord seller). */
  private oid(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * GET /zatca/landlords
   * Every landlord with their ZATCA integration status — drives the settings
   * tab listing all landlords and whether each is integrated.
   */
  @Get("landlords")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async listLandlords(@CurrentUser() user: AuthUser) {
    return this.onboarding.listLandlordStatus(scopeId(user));
  }

  /**
   * GET /zatca/credentials?ownerId=
   * Read seller profile + onboarding state for a landlord (or the account-level
   * seller when ownerId is omitted). Secrets are NOT returned — only presence
   * flags so the dashboard can show a checklist.
   */
  @Get("credentials")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async getCreds(@CurrentUser() user: AuthUser, @Query("ownerId") ownerId?: string) {
    const c = await this.onboarding.getCredentials(scopeId(user), this.oid(ownerId));
    if (!c) return { configured: false };
    return {
      configured: true,
      activeEnvironment: c.activeEnvironment,
      seller: {
        name: c.sellerName,
        nameAr: c.sellerNameAr,
        vatNumber: c.sellerVatNumber,
        crn: c.sellerCrn,
        idScheme: c.sellerIdScheme,
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
  async upsertProfile(@CurrentUser() user: AuthUser, @Body() body: SellerProfileInput & { ownerId?: number }) {
    if (!body?.sellerName || !body.sellerVatNumber || !body.sellerStreet) {
      throw new BadRequestException("sellerName, sellerVatNumber, sellerStreet are required");
    }
    return this.onboarding.upsertProfile(scopeId(user), body, this.oid(body.ownerId));
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
    @Body() body: { otp?: string; env?: ZatcaEnv; ownerId?: number },
    // env can also come from the path
  ) {
    const env: ZatcaEnv = (body.env ?? "sandbox") as ZatcaEnv;
    return this.onboarding.issueComplianceCsid(scopeId(user), env, body.otp, this.oid(body.ownerId));
  }

  /**
   * POST /zatca/onboarding/production
   * Promote the existing compliance CSID to production CSID. Only after the
   * test cycle has been completed for the same compliance CSID (≥1 of each
   * doc type signed and accepted).
   */
  @Post("onboarding/production")
  @RequirePermissions(PERMISSIONS.ZATCA_ONBOARD)
  async issueProductionCsid(@CurrentUser() user: AuthUser, @Body() body: { source?: "sandbox" | "production"; ownerId?: number }) {
    return this.onboarding.issueProductionCsid(scopeId(user), body.source ?? "production", this.oid(body.ownerId));
  }

  /**
   * POST /zatca/switch  { env }
   * 1-click switch active environment. Refuses to flip to production unless
   * production credentials exist AND the test cycle has been completed.
   */
  @Post("switch")
  @RequirePermissions(PERMISSIONS.ZATCA_PROMOTE_PRODUCTION)
  async switchEnv(@CurrentUser() user: AuthUser, @Body() body: { env: ZatcaEnv; ownerId?: number }) {
    if (!body?.env) throw new BadRequestException("env is required");
    return this.onboarding.switchEnvironment(scopeId(user), body.env, this.oid(body.ownerId));
  }

  /**
   * POST /zatca/reset-chain  { env }
   * Reset the PIH chain (and soft-delete all invoices in the env) so a new
   * onboarding cycle can be started cleanly. Use sparingly — destroys ICV
   * continuity for the env.
   */
  @Post("reset-chain")
  @RequirePermissions(PERMISSIONS.ZATCA_PROMOTE_PRODUCTION)
  async resetChain(@CurrentUser() user: AuthUser, @Body() body: { env: ZatcaEnv; ownerId?: number }) {
    if (!body?.env) throw new BadRequestException("env is required");
    await this.onboarding.resetChain(scopeId(user), body.env, this.oid(body.ownerId));
    return { ok: true };
  }
}
