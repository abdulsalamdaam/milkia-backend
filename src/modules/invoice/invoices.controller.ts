import {
  BadRequestException, Body, Controller, Delete, Get, Header, Inject,
  NotFoundException, Param, ParseIntPipe, Post, Query, Res, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { usersTable, companiesTable } from "@milkia/database";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { InvoiceService, type CreateInvoiceDto } from "./services/invoice.service";
import { PdfService } from "./services/pdf.service";

@ApiTags("invoices")
@ApiBearerAuth("user-jwt")
@Controller("invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Drizzle,
    private readonly invoices: InvoiceService,
    private readonly pdf: PdfService,
  ) {}

  /** GET /invoices?limit=&offset= */
  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.invoices.list(scopeId(user), {
      limit: limit ? Math.min(500, parseInt(limit, 10) || 100) : 100,
      offset: offset ? parseInt(offset, 10) || 0 : 0,
    });
  }

  /** GET /invoices/:id */
  @Get(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.invoices.getOneWithLines(scopeId(user), id);
  }

  /**
   * POST /invoices
   * Build, sign, submit, and persist an invoice in a single call.
   * Body matches CreateInvoiceDto.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateInvoiceDto) {
    if (!body?.invoiceNumber) throw new BadRequestException("invoiceNumber required");
    if (!body.profile) throw new BadRequestException("profile required");
    if (!Array.isArray(body.lines) || body.lines.length === 0)
      throw new BadRequestException("at least one line required");
    return this.invoices.issue(scopeId(user), body);
  }

  /**
   * POST /invoices/:id/resubmit
   * Resend the existing signed XML to ZATCA — useful after a transient outage.
   */
  @Post(":id/resubmit")
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async resubmit(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.invoices.resubmit(scopeId(user), id);
  }

  /** DELETE /invoices/:id  (soft-delete) */
  @Delete(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.invoices.softDelete(scopeId(user), id);
  }

  /** GET /invoices/:id/xml — raw signed XML (or unsigned if not yet signed) */
  @Get(":id/xml")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @Header("Content-Type", "application/xml; charset=utf-8")
  async getXml(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    const { invoice } = await this.invoices.getOneWithLines(scopeId(user), id);
    return invoice.signedXml ?? invoice.unsignedXml;
  }

  /** GET /invoices/:id/html — bilingual print template */
  @Get(":id/html")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  @Header("Content-Type", "text/html; charset=utf-8")
  async getHtml(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Query("lang") lang?: "ar" | "en",
  ) {
    const ctx = await this.buildRenderContext(user, id, lang);
    return this.pdf.renderHtml(ctx);
  }

  /** GET /invoices/:id/pdf — bilingual PDF (Chrome headless) */
  @Get(":id/pdf")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async getPdf(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Query("lang") lang: "ar" | "en" | undefined,
    @Res() res: Response,
  ) {
    const ctx = await this.buildRenderContext(user, id, lang);
    const pdf = await this.pdf.renderPdf(ctx);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${ctx.invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  }

  /* ─── helpers ───────────────────────────────────────────────────────── */

  private async buildRenderContext(user: AuthUser, id: number, lang?: "ar" | "en") {
    const { invoice, lines } = await this.invoices.getOneWithLines(scopeId(user), id);
    // Prefer the linked companies row; fall back to the legacy logo/company
    // columns on users while the migration window is open. Either way the
    // invoice template only sees the resolved logo URL.
    const [row] = await this.db
      .select({
        legacyLogoUrl: usersTable.logoUrl,
        legacyCompany: usersTable.company,
        companyLogoKey: companiesTable.logoKey,
        companyName: companiesTable.name,
      })
      .from(usersTable)
      .leftJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
      .where(and(eq(usersTable.id, scopeId(user)), isNull(usersTable.deletedAt)));
    return {
      invoice,
      lines,
      language: lang ?? invoice.language ?? "ar",
      brand: { logoUrl: row?.companyLogoKey ?? row?.legacyLogoUrl ?? null },
    } as const;
  }
}

