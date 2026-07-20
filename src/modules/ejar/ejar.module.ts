import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject, Module,
  NotFoundException, Param, Post, Query, ServiceUnavailableException, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq } from "drizzle-orm";
import { contractsTable, paymentsTable } from "@oqudk/database";
import { buildInstallments } from "../contracts/installments";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard, type AuthUser } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { EjarClientService, EjarApiError, EjarConfigError } from "./ejar.client.service";
import { EjarLogService, type EjarLogFilter } from "./ejar.log.service";
import { isEjarEndpointKey, type EjarBody, type JsonApiResource } from "./ejar.types";
import { mapEjarToContract, summarizeContractsBody } from "./ejar.map";

const PAYMENT_FREQ = new Set(["monthly", "quarterly", "semi_annual", "annual", "custom"]);
const HEALTH_CONTRACT = "10732702933";

/**
 * Ejar (NHC) integration — the sensitive, credential-holding backend. The web
 * portal calls these endpoints; the IBM client id/secret never leave here.
 * Everything is READ-ONLY against NHC (we pull, never push).
 */
@ApiTags("ejar")
@ApiBearerAuth("user-jwt")
@Controller("ejar")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class EjarController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Drizzle,
    private readonly client: EjarClientService,
    private readonly logs: EjarLogService,
  ) {}

  /** Run one whitelisted endpoint; returns the unwrapped Body + the log row. */
  @Post("call")
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async call(@CurrentUser() user: AuthUser, @Body() body: { endpoint?: string; params?: Record<string, unknown> }) {
    if (!isEjarEndpointKey(body?.endpoint)) {
      throw new BadRequestException(
        "Unknown or missing endpoint. Allowed: getRentalContracts, getProperties, getUnits, nationalAddress, rentalContractInvoices, rentalFinancialData",
      );
    }
    const params = this.cleanParams(body.params);
    try {
      return await this.client.request(body.endpoint, params, { userId: user.id });
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  /** Assemble + map a full import preview for one contract (server-side). */
  @Post("preview")
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async preview(
    @CurrentUser() user: AuthUser,
    @Body() body: { id_number?: string; contract_number?: string; partyType?: number },
  ) {
    const idNumber = body?.id_number?.trim();
    const contractNumber = body?.contract_number?.trim();
    const partyType = body?.partyType ?? 0;
    if (!contractNumber) throw new BadRequestException("contract_number is required");

    const logs: unknown[] = [];
    const run = async (fn: () => Promise<{ body: EjarBody | null; log: unknown }>) => {
      try {
        const r = await fn();
        logs.push(r.log);
        return r.body;
      } catch (e) {
        if (e instanceof EjarApiError && e.log) logs.push(e.log);
        if (e instanceof EjarConfigError) throw this.toHttp(e);
        return null;
      }
    };

    // Best-effort: list the ID's contracts so relationships resolve.
    let listBody: EjarBody | null = null;
    let resource: JsonApiResource | null = null;
    if (idNumber) {
      listBody = await run(() =>
        this.client.request("getRentalContracts", { id_number: idNumber, "page[size]": 100, "page[number]": 1 }, { userId: user.id }),
      );
      if (listBody) {
        const arr = Array.isArray(listBody.data) ? listBody.data : listBody.data ? [listBody.data] : [];
        const idx = summarizeContractsBody(listBody).findIndex((s) => s.contractNumber === contractNumber);
        resource = idx >= 0 ? arr[idx] : null;
      }
    }
    if (!resource) resource = { type: "rental-contract", id: contractNumber, attributes: { contract_number: contractNumber } };

    const [na, fin, inv] = await Promise.all([
      run(() => this.client.request("nationalAddress", { contractNumber, partyType }, { userId: user.id })),
      run(() => this.client.request("rentalFinancialData", { contractNumber, partyType }, { userId: user.id })),
      run(() => this.client.request("rentalContractInvoices", { contractNumber, partyType }, { userId: user.id })),
    ]);

    const preview = mapEjarToContract({ contract: resource, listBody: listBody ?? undefined, nationalAddress: na, financial: fin, invoices: inv });
    return { ...preview, logs };
  }

  /**
   * Import a reviewed Ejar contract into the local Contract table. Ejar
   * contracts have no local unit, so this does NOT go through /api/contracts
   * (which requires a unit). Scoped to the caller's account; deduped on
   * (user_id, contract_number).
   */
  @Post("import")
  @RequirePermissions(PERMISSIONS.CONTRACTS_WRITE)
  async import(@CurrentUser() user: AuthUser, @Body() body: { contract?: Record<string, unknown> }) {
    const src = body?.contract || {};
    const ownerId = scopeId(user);
    const num = String(src.ejarContractNumber || src.contractNumber || "").trim();
    if (!num) throw new BadRequestException("رقم عقد إيجار مطلوب للاستيراد");

    const [dup] = await this.db
      .select({ id: contractsTable.id })
      .from(contractsTable)
      .where(and(eq(contractsTable.userId, ownerId), eq(contractsTable.contractNumber, num)))
      .limit(1);
    if (dup) throw new ConflictException(`العقد ${num} مستورد مسبقًا (#${dup.id}).`);

    const today = new Date().toISOString().slice(0, 10);
    const num2 = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    const str = (v: unknown) => (v == null || v === "" ? null : String(v));

    // Real Ejar invoices arrive as a custom schedule (exact due dates + amounts).
    const customSchedule = Array.isArray(src.customSchedule)
      ? (src.customSchedule as Array<{ dueDate?: unknown; amount?: unknown }>)
          .map((e) => ({ dueDate: String(e?.dueDate ?? "").slice(0, 10), amount: String(e?.amount ?? "") }))
          .filter((e) => e.dueDate && Number(e.amount) > 0)
      : [];

    const freqRaw = String(src.paymentFrequency || "").toLowerCase();
    const freq = customSchedule.length
      ? "custom"
      : PAYMENT_FREQ.has(freqRaw) ? freqRaw
      : /year|annual|سنوي/.test(freqRaw) ? "annual"
      : /quarter|ربع/.test(freqRaw) ? "quarterly"
      : /semi|نصف/.test(freqRaw) ? "semi_annual"
      : /month|شهري/.test(freqRaw) ? "monthly"
      : "annual";

    // Rent: prefer the schedule total, then annual/monthly hints. NOT NULL col.
    const scheduleTotal = customSchedule.reduce((s, e) => s + Number(e.amount), 0);
    const monthly = num2(src.monthlyRent) ?? num2(src.annualRent) ?? (scheduleTotal || 0);
    const status = ["active", "expired", "terminated", "cancelled", "pending"].includes(String(src.status))
      ? (src.status as string)
      : "active";

    const [created] = await this.db
      .insert(contractsTable)
      .values({
        userId: ownerId,
        contractNumber: num,
        ejarSource: "ejar",
        ejarContractNumber: num,
        tenantType: str(src.tenantType),
        tenantName: str(src.tenantName) || "—",
        tenantIdNumber: str(src.tenantIdNumber),
        tenantPhone: str(src.tenantPhone),
        tenantEmail: str(src.tenantEmail),
        companyUnified: str(src.companyUnified),
        companyOrgType: str(src.companyOrgType),
        repName: str(src.repName),
        repIdNumber: str(src.repIdNumber),
        landlordName: str(src.landlordName),
        landlordIdNumber: str(src.landlordIdNumber),
        landlordPhone: str(src.landlordPhone),
        landlordEmail: str(src.landlordEmail),
        startDate: str(src.startDate)?.slice(0, 10) || today,
        endDate: str(src.endDate)?.slice(0, 10) || today,
        monthlyRent: String(monthly),
        paymentFrequency: freq as never,
        customSchedule: customSchedule.length ? customSchedule : null,
        depositAmount: num2(src.depositAmount) != null ? String(num2(src.depositAmount)) : null,
        status: status as never,
        notes: [str(src.notes), src.propertyName ? `العقار: ${src.propertyName}` : null].filter(Boolean).join(" — ") || null,
      })
      .returning();

    // Generate the payment schedule from the real Ejar invoices (custom) or the
    // mapped frequency. Mirrors the manual-create path so the Payment Log is
    // populated with the actual amounts + due dates — not a synthetic 0.
    let installmentsCreated = 0;
    try {
      const rows = buildInstallments(
        created.id, ownerId, created.startDate, created.endDate, created.monthlyRent, freq,
        null, false, 0, "percent", null, 0, customSchedule.length ? customSchedule : null,
      );
      if (rows.length > 0) {
        await this.db.insert(paymentsTable).values(rows);
        installmentsCreated = rows.length;
      }
    } catch (e) {
      // Never let schedule generation fail the import — the contract is saved.
    }
    return { ...created, installmentsCreated };
  }

  @Get("logs")
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async listLogs(@Query("endpoint") endpoint?: string, @Query("status") status?: string, @Query("limit") limit?: string) {
    const filter: EjarLogFilter = { endpoint: endpoint || undefined, limit: limit ? Number(limit) : undefined };
    if (status === "ok" || status === "error") filter.status = status;
    else if (status && !Number.isNaN(Number(status))) filter.status = Number(status);
    const logs = await this.logs.list(filter);
    return { count: logs.length, logs };
  }

  /** Re-run a logged call verbatim (params were persisted on the row). */
  @Post("logs/:id/replay")
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async replay(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const row = await this.logs.get(Number(id));
    if (!row) throw new NotFoundException("log not found");
    if (!isEjarEndpointKey(row.endpoint)) throw new BadRequestException("cannot replay this endpoint");
    try {
      return await this.client.request(row.endpoint, row.params ?? {}, { userId: user.id });
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  /** Lightweight whitelist + creds check (pings NationalAddress). */
  @Get("health")
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async health(@CurrentUser() user: AuthUser) {
    try {
      const { log } = await this.client.request(
        "nationalAddress",
        { contractNumber: HEALTH_CONTRACT, partyType: 0 },
        { userId: user.id, skipLog: true },
      );
      return { ok: true, status: (log as { status?: number }).status ?? null, transactionId: (log as { transactionId?: string }).transactionId ?? null };
    } catch (err) {
      if (err instanceof EjarConfigError) return { ok: false, status: null, transactionId: null, detail: "not-configured" };
      const e = err as EjarApiError;
      return { ok: false, status: e.status ?? null, transactionId: e.transactionId ?? null, detail: e.message };
    }
  }

  private cleanParams(params?: Record<string, unknown>): Record<string, string | number | undefined> {
    const clean: Record<string, string | number | undefined> = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === "") continue;
      clean[k] = typeof v === "number" ? v : String(v);
    }
    return clean;
  }

  private toHttp(err: unknown) {
    if (err instanceof EjarConfigError) return new ServiceUnavailableException(err.message);
    if (err instanceof EjarApiError) {
      return new BadRequestException({ message: err.message, status: err.status, transactionId: err.transactionId, log: err.log ?? null });
    }
    return err instanceof Error ? new BadRequestException(err.message) : new BadRequestException("Ejar call failed");
  }
}

@Module({
  controllers: [EjarController],
  providers: [EjarClientService, EjarLogService],
})
export class EjarModule {}
