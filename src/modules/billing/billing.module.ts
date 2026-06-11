import {
  Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query,
  BadRequestException, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc, sum, inArray, getTableColumns } from "drizzle-orm";
import { simpleInvoicesTable, paymentsTable, paymentCollectionsTable, contractsTable } from "@oqudk/database";
import { listQuerySchema } from "../../common/pagination";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";

const DOC_TYPES = ["invoice", "credit", "debit"] as const;
const DOC_STATUSES = ["draft", "confirmed", "cancelled"] as const;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

type LineItem = { description: string; quantity: number; unitPrice: number; amount: number; vat?: boolean };

function normalizeItems(raw: any): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const quantity = round2(Number(it?.quantity ?? 1)) || 0;
      const unitPrice = round2(Number(it?.unitPrice ?? 0)) || 0;
      const amount = it?.amount != null ? round2(Number(it.amount)) : round2(quantity * unitPrice);
      // Per-line VAT flag — default true when omitted (legacy behaviour).
      const vat = it?.vat == null ? true : !!it.vat;
      return { description: String(it?.description ?? "").trim(), quantity, unitPrice, amount, vat };
    })
    .filter((it) => it.description || it.amount);
}

@ApiTags("simple-invoices")
@ApiBearerAuth("user-jwt")
@Controller("simple-invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class SimpleInvoicesController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /** Next document number for a type, e.g. INV-000123 / CRN-000005 / DBN-000002. */
  private async nextNumber(userId: number, type: string): Promise<string> {
    const prefix = type === "credit" ? "CRN" : type === "debit" ? "DBN" : "INV";
    const [row] = await this.db.select({ c: count() }).from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.userId, userId), eq(simpleInvoicesTable.type, type as any)));
    const seq = Number(row?.c ?? 0) + 1;
    return `${prefix}-${String(seq).padStart(6, "0")}`;
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async list(@CurrentUser() user: AuthUser, @Query() rawQuery: any) {
    const q = listQuerySchema.parse(rawQuery ?? {});
    const type = DOC_TYPES.includes(rawQuery?.type) ? rawQuery.type : undefined;
    const status = DOC_STATUSES.includes(rawQuery?.status) ? rawQuery.status : undefined;
    // Optional landlord/property/unit filter — resolved to contract ids by the
    // frontend and passed through here.
    const contractIds: number[] | undefined =
      typeof rawQuery?.contractIds === "string" && rawQuery.contractIds.trim()
        ? rawQuery.contractIds.split(",").map((x: string) => parseInt(x, 10)).filter((n: number) => Number.isFinite(n))
        : undefined;
    const base = and(eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt));
    const conds = [base];
    if (type) conds.push(eq(simpleInvoicesTable.type, type as any));
    if (status) conds.push(eq(simpleInvoicesTable.status, status as any));
    if (contractIds && contractIds.length > 0) conds.push(inArray(simpleInvoicesTable.contractId, contractIds) as any);
    if (q.search) {
      conds.push(or(
        ilike(simpleInvoicesTable.number, `%${q.search}%`),
        ilike(simpleInvoicesTable.tenantName, `%${q.search}%`),
        ilike(simpleInvoicesTable.receiptNumber, `%${q.search}%`),
        ilike(contractsTable.contractNumber, `%${q.search}%`),
      ) as any);
    }
    const where = and(...conds);
    const statsConds: any[] = [base];
    if (type) statsConds.push(eq(simpleInvoicesTable.type, type as any));
    if (contractIds && contractIds.length > 0) statsConds.push(inArray(simpleInvoicesTable.contractId, contractIds));
    const statsWhere = and(...statsConds);

    const [rows, totalRow, statsRows] = await Promise.all([
      this.db.select({ ...getTableColumns(simpleInvoicesTable), contractNumber: contractsTable.contractNumber })
        .from(simpleInvoicesTable)
        .leftJoin(contractsTable, eq(simpleInvoicesTable.contractId, contractsTable.id))
        .where(where)
        .orderBy((q.order === "asc" ? asc : desc)(simpleInvoicesTable.createdAt), desc(simpleInvoicesTable.id))
        .limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(simpleInvoicesTable)
        .leftJoin(contractsTable, eq(simpleInvoicesTable.contractId, contractsTable.id)).where(where),
      this.db.select({ status: simpleInvoicesTable.status, cnt: count(), amount: sum(simpleInvoicesTable.total) })
        .from(simpleInvoicesTable).where(statsWhere).groupBy(simpleInvoicesTable.status),
    ]);
    const stats: Record<string, number> = { draftCount: 0, draftAmount: 0, confirmedCount: 0, confirmedAmount: 0 };
    for (const s of statsRows as any[]) {
      if (s.status === "draft") { stats.draftCount = Number(s.cnt); stats.draftAmount = round2(Number(s.amount ?? 0)); }
      else if (s.status === "confirmed") { stats.confirmedCount = Number(s.cnt); stats.confirmedAmount = round2(Number(s.amount ?? 0)); }
    }
    const total = Number(totalRow[0]?.total ?? 0);
    return { data: rows, page: q.page, pageSize: q.pageSize, total, stats };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const type = DOC_TYPES.includes(body?.type) ? body.type : "invoice";
    const items = normalizeItems(body?.items);
    const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
    const total = body?.total != null ? round2(Number(body.total)) : subtotal;
    const number = (body?.number && String(body.number).trim()) || (await this.nextNumber(scopeId(user), type));

    // If linked to an installment, snapshot tenant/contract from it.
    let contractId = body?.contractId ?? null;
    let tenantId = body?.tenantId ?? null;
    let tenantName = body?.tenantName ?? null;
    let client = body?.client ?? null;
    if (body?.paymentId) {
      const [pay] = await this.db.select({ contractId: paymentsTable.contractId, tenantName: contractsTable.tenantName, tenantId: contractsTable.tenantId })
        .from(paymentsTable).leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
        .where(and(eq(paymentsTable.id, Number(body.paymentId)), eq(paymentsTable.userId, scopeId(user))));
      if (pay) { contractId = contractId ?? pay.contractId; tenantId = tenantId ?? pay.tenantId; tenantName = tenantName ?? pay.tenantName; }
    }
    // Credit/debit note: snapshot client + contract from the referenced invoice
    // (the note's parties come from the invoice, not entered manually).
    if ((type === "credit" || type === "debit") && body?.billingReference) {
      const [refInv] = await this.db.select({
        contractId: simpleInvoicesTable.contractId, tenantId: simpleInvoicesTable.tenantId,
        tenantName: simpleInvoicesTable.tenantName, client: simpleInvoicesTable.client,
      }).from(simpleInvoicesTable).where(and(
        eq(simpleInvoicesTable.userId, scopeId(user)), eq(simpleInvoicesTable.type, "invoice"),
        eq(simpleInvoicesTable.number, String(body.billingReference)), isNull(simpleInvoicesTable.deletedAt),
      ));
      if (refInv) {
        contractId = contractId ?? refInv.contractId;
        tenantId = tenantId ?? refInv.tenantId;
        tenantName = refInv.tenantName ?? tenantName;
        client = refInv.client ?? client;
      }
    }

    const paymentIds: number[] = Array.isArray(body?.paymentIds)
      ? body.paymentIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
      : (body?.paymentId ? [Number(body.paymentId)] : []);

    const [doc] = await this.db.insert(simpleInvoicesTable).values({
      userId: scopeId(user),
      number,
      type,
      status: "draft",
      contractId: contractId ?? null,
      paymentId: body?.paymentId ?? (paymentIds[0] ?? null),
      paymentIds: paymentIds.length ? paymentIds : null,
      tenantId: tenantId ?? null,
      tenantName: tenantName ?? null,
      client: client ?? null,
      items,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      issueDate: body?.issueDate || today(),
      dueDate: body?.dueDate || null,
      billingReference: body?.billingReference ?? null,
      notes: body?.notes ?? null,
    } as any).returning();
    return doc;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status === "confirmed") throw new BadRequestException("لا يمكن تعديل مستند مؤكَّد");
    const patch: any = {};
    if (body?.items != null) {
      const items = normalizeItems(body.items);
      patch.items = items;
      patch.subtotal = round2(items.reduce((s, it) => s + it.amount, 0)).toFixed(2);
      patch.total = (body?.total != null ? round2(Number(body.total)) : round2(items.reduce((s, it) => s + it.amount, 0))).toFixed(2);
    } else if (body?.total != null) {
      patch.total = round2(Number(body.total)).toFixed(2);
    }
    for (const k of ["tenantName", "client", "issueDate", "dueDate", "notes", "billingReference", "contractId", "tenantId", "paymentId", "paymentIds"]) {
      if (body?.[k] !== undefined) patch[k] = body[k];
    }
    const [updated] = await this.db.update(simpleInvoicesTable).set(patch)
      .where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, scopeId(user)))).returning();
    return updated;
  }

  /**
   * Approve a document (اعتماد). An invoice is simply marked confirmed and
   * then awaits collection on the Collections page (no money moves here). A
   * credit/debit note immediately adjusts the invoice it references — and
   * that invoice's installment — so the original invoice becomes the
   * corrected one (مُعدَّلة وليست جديدة).
   */
  @Post(":id/approve")
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async approve(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    void body;
    const uid = scopeId(user);
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, uid), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status === "confirmed") throw new BadRequestException("المستند معتمد مسبقاً");

    const isNote = doc.type === "credit" || doc.type === "debit";
    if (isNote) {
      const sign = doc.type === "credit" ? -1 : 1;
      const voucher = `${doc.type === "credit" ? "CN" : "DN"}-${String(doc.id).padStart(6, "0")}`;
      if (doc.billingReference) {
        const [refInv] = await this.db.select().from(simpleInvoicesTable)
          .where(and(eq(simpleInvoicesTable.userId, uid), eq(simpleInvoicesTable.type, "invoice"),
            eq(simpleInvoicesTable.number, doc.billingReference), isNull(simpleInvoicesTable.deletedAt)));
        if (refInv) {
          const newSubtotal = Math.max(0, round2(Number(refInv.subtotal) + sign * Number(doc.subtotal)));
          const newTotal = Math.max(0, round2(Number(refInv.total) + sign * Number(doc.total)));
          await this.db.update(simpleInvoicesTable).set({
            subtotal: newSubtotal.toFixed(2),
            total: newTotal.toFixed(2),
            notes: `${refInv.notes ? refInv.notes + " · " : ""}${doc.type === "credit" ? "إشعار دائن" : "إشعار مدين"} ${doc.number}`,
          }).where(eq(simpleInvoicesTable.id, refInv.id));
          // Adjust the referenced invoice's installment amount accordingly.
          if (refInv.paymentId) {
            const [payment] = await this.db.select().from(paymentsTable)
              .where(and(eq(paymentsTable.id, refInv.paymentId), eq(paymentsTable.userId, uid), isNull(paymentsTable.deletedAt)));
            if (payment && payment.status !== "cancelled") {
              const newAmount = Math.max(0, round2(Number(payment.amount) + sign * Number(doc.total)));
              const prior = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
                .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.paymentId, payment.id));
              const collected = round2(Number(prior[0]?.total ?? 0));
              const status = collected >= newAmount - 0.01 ? "paid" : collected > 0.01 ? "partially_paid" : "pending";
              await this.db.update(paymentsTable).set({
                amount: newAmount.toFixed(2),
                status,
                paidDate: status === "pending" ? null : payment.paidDate,
              }).where(eq(paymentsTable.id, payment.id));
            }
          }
        }
      }
      const [updated] = await this.db.update(simpleInvoicesTable).set({
        status: "confirmed", confirmedAt: new Date(), receiptNumber: voucher,
      }).where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, uid))).returning();
      return updated;
    }

    // Invoice — just approve; collection happens later on the Collections page.
    const [updated] = await this.db.update(simpleInvoicesTable).set({
      status: "confirmed", confirmedAt: new Date(),
    }).where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, uid))).returning();
    return updated;
  }

  /**
   * Record a collection against an approved invoice (from the Collections
   * page). Distributes the amount across the invoice's installment(s), marks
   * them paid/partially-paid and stamps the receipt-voucher on the invoice so
   * it surfaces under Receipt Vouchers.
   */
  @Post(":id/collect")
  @RequirePermissions(PERMISSIONS.PAYMENTS_WRITE)
  async collect(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    const uid = scopeId(user);
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, uid), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.type !== "invoice") throw new BadRequestException("التحصيل يتم على الفواتير فقط");
    if (doc.status !== "confirmed") throw new BadRequestException("يجب اعتماد الفاتورة قبل التحصيل");
    if (doc.paidDate || doc.receiptNumber) throw new BadRequestException("تم تحصيل هذه الفاتورة مسبقاً");

    const paidDate = body?.paidDate || today();
    const voucher = `RV-${String(doc.id).padStart(6, "0")}`;
    const method = body?.method ?? "bank_transfer";
    const receipt = (body?.receiptNumber && String(body.receiptNumber).trim()) || voucher;
    const ids = (doc.paymentIds && doc.paymentIds.length) ? doc.paymentIds : (doc.paymentId ? [doc.paymentId] : []);
    let toCollect = body?.amount != null ? round2(Number(body.amount)) : round2(Number(doc.total));

    for (const pid of ids) {
      if (toCollect <= 0.01) break;
      const [payment] = await this.db.select().from(paymentsTable)
        .where(and(eq(paymentsTable.id, pid), eq(paymentsTable.userId, uid), isNull(paymentsTable.deletedAt)));
      if (!payment || payment.status === "cancelled") continue;
      const prior = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
        .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.paymentId, pid));
      const collectedBefore = round2(Number(prior[0]?.total ?? 0));
      const totalDue = round2(Number(payment.amount));
      const remaining = round2(totalDue - collectedBefore);
      if (remaining <= 0.01) continue;
      const amt = round2(Math.min(remaining, toCollect));
      await this.db.insert(paymentCollectionsTable).values({
        paymentId: pid,
        userId: uid,
        amount: amt.toFixed(2),
        collectedDate: paidDate,
        method,
        receiptNumber: receipt,
        attachmentKey: body?.attachmentKey ?? null,
        invoiceId: doc.id,
        notes: body?.notes ?? `فاتورة ${doc.number}`,
      });
      const collectedAfter = round2(collectedBefore + amt);
      const status = collectedAfter >= totalDue - 0.01 ? "paid" : "partially_paid";
      await this.db.update(paymentsTable).set({
        status,
        paidDate: status === "paid" ? paidDate : payment.paidDate,
        receiptNumber: receipt,
        attachmentKey: body?.attachmentKey ?? payment.attachmentKey,
      }).where(eq(paymentsTable.id, pid));
      toCollect = round2(toCollect - amt);
    }

    // Only mark the invoice fully collected when the entered amount covers the
    // whole total; a partial collection keeps it confirmed (collectible again).
    const collectedNow = body?.amount != null ? round2(Number(body.amount)) : round2(Number(doc.total));
    const fullyCollected = collectedNow >= round2(Number(doc.total)) - 0.01;
    const [updated] = await this.db.update(simpleInvoicesTable).set({
      ...(fullyCollected ? { paidDate, receiptNumber: voucher } : {}),
      paymentMethod: method,
      attachmentKey: body?.attachmentKey ?? doc.attachmentKey,
    }).where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, uid))).returning();
    return updated;
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    await this.db.update(simpleInvoicesTable).set({ deletedAt: new Date() })
      .where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, scopeId(user))));
    return { ok: true };
  }
}

@Module({ controllers: [SimpleInvoicesController] })
export class BillingModule {}
