import {
  Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query,
  BadRequestException, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc, sum, inArray } from "drizzle-orm";
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

type LineItem = { description: string; quantity: number; unitPrice: number; amount: number };

function normalizeItems(raw: any): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const quantity = round2(Number(it?.quantity ?? 1)) || 0;
      const unitPrice = round2(Number(it?.unitPrice ?? 0)) || 0;
      const amount = it?.amount != null ? round2(Number(it.amount)) : round2(quantity * unitPrice);
      return { description: String(it?.description ?? "").trim(), quantity, unitPrice, amount };
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
    const base = and(eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt));
    const conds = [base];
    if (type) conds.push(eq(simpleInvoicesTable.type, type as any));
    if (status) conds.push(eq(simpleInvoicesTable.status, status as any));
    if (q.search) {
      conds.push(or(
        ilike(simpleInvoicesTable.number, `%${q.search}%`),
        ilike(simpleInvoicesTable.tenantName, `%${q.search}%`),
        ilike(simpleInvoicesTable.receiptNumber, `%${q.search}%`),
      ) as any);
    }
    const where = and(...conds);
    const statsWhere = type ? and(base, eq(simpleInvoicesTable.type, type as any)) : base;

    const [rows, totalRow, statsRows] = await Promise.all([
      this.db.select().from(simpleInvoicesTable).where(where)
        .orderBy((q.order === "asc" ? asc : desc)(simpleInvoicesTable.createdAt), desc(simpleInvoicesTable.id))
        .limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(simpleInvoicesTable).where(where),
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
    if (body?.paymentId) {
      const [pay] = await this.db.select({ contractId: paymentsTable.contractId, tenantName: contractsTable.tenantName, tenantId: contractsTable.tenantId })
        .from(paymentsTable).leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
        .where(and(eq(paymentsTable.id, Number(body.paymentId)), eq(paymentsTable.userId, scopeId(user))));
      if (pay) { contractId = contractId ?? pay.contractId; tenantId = tenantId ?? pay.tenantId; tenantName = tenantName ?? pay.tenantName; }
    }

    const [doc] = await this.db.insert(simpleInvoicesTable).values({
      userId: scopeId(user),
      number,
      type,
      status: "draft",
      contractId: contractId ?? null,
      paymentId: body?.paymentId ?? null,
      tenantId: tenantId ?? null,
      tenantName: tenantName ?? null,
      client: body?.client ?? null,
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
    for (const k of ["tenantName", "client", "issueDate", "dueDate", "notes", "billingReference", "contractId", "tenantId", "paymentId"]) {
      if (body?.[k] !== undefined) patch[k] = body[k];
    }
    const [updated] = await this.db.update(simpleInvoicesTable).set(patch)
      .where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, scopeId(user)))).returning();
    return updated;
  }

  /**
   * Confirm a document. For an invoice this marks it paid, stamps a
   * receipt-voucher number and — when linked to an installment — records a
   * collection so it flows into Payments / Collections / Receipt Vouchers.
   */
  @Post(":id/confirm")
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async confirm(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status === "confirmed") throw new BadRequestException("المستند مؤكَّد مسبقاً");

    const paidDate = body?.paidDate || today();
    const isInvoice = doc.type === "invoice";
    const voucherNumber = isInvoice ? `RV-${String(doc.id).padStart(6, "0")}` : null;
    // The collection carries the user-supplied receipt/reference if given,
    // else falls back to the generated voucher number.
    const collectionReceipt = (body?.receiptNumber && String(body.receiptNumber).trim()) || voucherNumber;
    const method = body?.method ?? "invoice";

    // Record a collection on the linked installment, if any (invoices only).
    if (isInvoice && doc.paymentId) {
      const [payment] = await this.db.select().from(paymentsTable)
        .where(and(eq(paymentsTable.id, doc.paymentId), eq(paymentsTable.userId, scopeId(user)), isNull(paymentsTable.deletedAt)));
      if (payment && payment.status !== "cancelled") {
        const prior = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
          .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.paymentId, payment.id));
        const collectedBefore = round2(Number(prior[0]?.total ?? 0));
        const totalDue = round2(Number(payment.amount));
        const remaining = round2(totalDue - collectedBefore);
        const requested = body?.amount != null ? round2(Number(body.amount)) : Number(doc.total);
        const amount = round2(Math.min(requested, remaining));
        if (amount > 0.01) {
          await this.db.insert(paymentCollectionsTable).values({
            paymentId: payment.id,
            userId: scopeId(user),
            amount: amount.toFixed(2),
            collectedDate: paidDate,
            method,
            receiptNumber: collectionReceipt,
            notes: body?.notes ?? `فاتورة ${doc.number}`,
          });
          const collectedAfter = round2(collectedBefore + amount);
          const fullyPaid = collectedAfter >= totalDue - 0.01;
          await this.db.update(paymentsTable).set({
            status: fullyPaid ? "paid" : "partially_paid",
            paidDate: fullyPaid ? paidDate : payment.paidDate,
            receiptNumber: collectionReceipt ?? payment.receiptNumber,
          }).where(eq(paymentsTable.id, payment.id));
        }
      }
    }

    const [updated] = await this.db.update(simpleInvoicesTable).set({
      status: "confirmed",
      confirmedAt: new Date(),
      paidDate: isInvoice ? paidDate : doc.paidDate,
      receiptNumber: voucherNumber,
      paymentMethod: isInvoice ? method : doc.paymentMethod,
    }).where(and(eq(simpleInvoicesTable.id, doc.id), eq(simpleInvoicesTable.userId, scopeId(user)))).returning();
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
