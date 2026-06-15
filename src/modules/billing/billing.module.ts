import {
  Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query,
  BadRequestException, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, ne, isNull, or, ilike, count, asc, desc, sum, inArray, getTableColumns } from "drizzle-orm";
import {
  simpleInvoicesTable, paymentsTable, paymentCollectionsTable, contractsTable,
  contractUnitsTable, unitsTable, propertiesTable, companiesTable, usersTable,
} from "@oqudk/database";
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
const DEPOSIT_DESC = "تأمين (وديعة)";
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
    // `type` may be a single value or a comma list (e.g. "credit,debit" for the
    // combined Settlement page).
    const types: string[] | undefined = typeof rawQuery?.type === "string" && rawQuery.type.includes(",")
      ? rawQuery.type.split(",").map((s: string) => s.trim()).filter((t: string) => DOC_TYPES.includes(t as any))
      : undefined;
    const type = !types && DOC_TYPES.includes(rawQuery?.type) ? rawQuery.type : undefined;
    const status = DOC_STATUSES.includes(rawQuery?.status) ? rawQuery.status : undefined;
    // Optional landlord/property/unit filter — resolved to contract ids by the
    // frontend and passed through here.
    const contractIds: number[] | undefined =
      typeof rawQuery?.contractIds === "string" && rawQuery.contractIds.trim()
        ? rawQuery.contractIds.split(",").map((x: string) => parseInt(x, 10)).filter((n: number) => Number.isFinite(n))
        : undefined;
    const base = and(eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt));
    const conds = [base];
    if (types) conds.push(inArray(simpleInvoicesTable.type, types as any) as any);
    else if (type) conds.push(eq(simpleInvoicesTable.type, type as any));
    if (status) conds.push(eq(simpleInvoicesTable.status, status as any));
    if (contractIds && contractIds.length > 0) conds.push(inArray(simpleInvoicesTable.contractId, contractIds) as any);
    // Hide vouchers (deposit + receipt) from the Invoices / Collections views —
    // they're evidence documents shown under Receipt Vouchers, never tax
    // invoices and never collectible.
    const excludeVouchers = rawQuery?.excludeVouchers === "true" || rawQuery?.excludeVouchers === true;
    // Deposit-only exclusion: deposits live solely on the contract detail and
    // must not appear even in the global Receipt Vouchers list.
    const excludeDeposit = rawQuery?.excludeDeposit === "true" || rawQuery?.excludeDeposit === true;
    const notVoucherCond = or(
      isNull(simpleInvoicesTable.kind),
      and(ne(simpleInvoicesTable.kind, "deposit"), ne(simpleInvoicesTable.kind, "receipt")),
    );
    const notDepositCond = or(isNull(simpleInvoicesTable.kind), ne(simpleInvoicesTable.kind, "deposit"));
    if (excludeVouchers) conds.push(notVoucherCond as any);
    else if (excludeDeposit) conds.push(notDepositCond as any);
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
    if (types) statsConds.push(inArray(simpleInvoicesTable.type, types as any));
    else if (type) statsConds.push(eq(simpleInvoicesTable.type, type as any));
    if (contractIds && contractIds.length > 0) statsConds.push(inArray(simpleInvoicesTable.contractId, contractIds));
    if (excludeVouchers) statsConds.push(notVoucherCond as any);
    else if (excludeDeposit) statsConds.push(notDepositCond as any);
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
    // Per-invoice collected amount (sum of collections recorded against it).
    const ids = (rows as Array<{ id: number }>).map((r) => r.id);
    const collAgg = ids.length
      ? await this.db.select({ invoiceId: paymentCollectionsTable.invoiceId, total: sum(paymentCollectionsTable.amount) })
          .from(paymentCollectionsTable).where(inArray(paymentCollectionsTable.invoiceId, ids))
          .groupBy(paymentCollectionsTable.invoiceId)
      : [];
    const collMap = new Map((collAgg as Array<{ invoiceId: number | null; total: string | null }>).map((c) => [c.invoiceId, Number(c.total ?? 0)]));
    const data = (rows as any[]).map((r) => ({ ...r, collectedAmount: round2(collMap.get(r.id) ?? 0) }));
    return { data, page: q.page, pageSize: q.pageSize, total, stats };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INVOICES_VIEW)
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const [doc] = await this.db.select().from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.id, parseInt(id, 10)), eq(simpleInvoicesTable.userId, scopeId(user)), isNull(simpleInvoicesTable.deletedAt)));
    if (!doc) throw new NotFoundException("Document not found");
    const [agg] = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
      .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.invoiceId, doc.id));
    return { ...doc, collectedAmount: round2(Number(agg?.total ?? 0)) };
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

    // A security deposit (الوديعة/الضمان) is held trust money (amanat), never
    // revenue — collecting it must produce a receipt voucher (سند قبض), not a
    // tax invoice. If a linked installment is a deposit and the caller hasn't
    // explicitly opted to bill it (billDeposit), divert to a receipt voucher
    // (which also records the collection against the deposit installment).
    if (type === "invoice" && !body?.kind && paymentIds.length && !body?.billDeposit) {
      const linked = await this.db.select({ description: paymentsTable.description })
        .from(paymentsTable)
        .where(and(inArray(paymentsTable.id, paymentIds), eq(paymentsTable.userId, scopeId(user))));
      if (linked.some((p) => p.description === DEPOSIT_DESC)) {
        return this.createReceiptVoucher(user, {
          amount: total, contractId, tenantId, tenantName, client,
          paidDate: body?.issueDate, method: body?.method, paymentIds,
          description: items[0]?.description || DEPOSIT_DESC,
          notes: body?.notes,
        });
      }
    }

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
      kind: body?.kind ?? null,
      issueDate: body?.issueDate || today(),
      dueDate: body?.dueDate || null,
      billingReference: body?.billingReference ?? null,
      notes: body?.notes ?? null,
    } as any).returning();

    // NB: the paired commission invoice is NOT created here — it's spawned only
    // when this rent invoice is APPROVED (see approve()), so a commission never
    // sits next to a still-draft rent invoice.

    // Advance rent: the invoice is billed at the full payment face value, and
    // any prior collection on these installments (e.g. advance collected at
    // contract start) is brought onto the invoice so its remaining balance
    // reflects the advance instead of shrinking the invoice itself.
    if (type === "invoice" && !body?.kind && paymentIds.length) {
      await this.db.update(paymentCollectionsTable).set({ invoiceId: doc.id })
        .where(and(
          inArray(paymentCollectionsTable.paymentId, paymentIds),
          isNull(paymentCollectionsTable.invoiceId),
          eq(paymentCollectionsTable.userId, scopeId(user)),
        ));
    }
    return doc;
  }

  /** Next commission-invoice number for an account: COM-000001, … */
  private async nextCommissionNumber(userId: number): Promise<string> {
    const [row] = await this.db.select({ c: count() }).from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.userId, userId), eq(simpleInvoicesTable.kind, "commission")));
    return `COM-${String(Number(row?.c ?? 0) + 1).padStart(6, "0")}`;
  }

  /**
   * When a rent invoice is issued for a contract whose property has a
   * management-fee %, create a paired commission invoice (فاتورة عمولة):
   * seller = the managing account, buyer = the property's landlord, amount =
   * the **pre-VAT rent** × the property's fee %. The commission base is the
   * rent only — service fees (gas, cleaning, …) are excluded — and VAT is
   * never part of the base. VAT is then applied on top of the commission when
   * the account is VAT-registered (its company carries a VAT number).
   */
  private async maybeCreateCommissionInvoice(uid: number, rentDoc: any, contractId: number) {
    const [propRow] = await this.db.select({ pct: propertiesTable.managementFeePercent })
      .from(contractUnitsTable)
      .innerJoin(unitsTable, eq(contractUnitsTable.unitId, unitsTable.id))
      .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(eq(contractUnitsTable.contractId, contractId)).limit(1);
    const pct = round2(Number(propRow?.pct ?? 0));
    if (!(pct > 0)) return null;

    const [c] = await this.db.select({
      landlordName: contractsTable.landlordName, landlordPhone: contractsTable.landlordPhone,
      landlordEmail: contractsTable.landlordEmail, landlordAddress: contractsTable.landlordAddress,
      landlordTaxNumber: contractsTable.landlordTaxNumber,
    }).from(contractsTable).where(eq(contractsTable.id, contractId));
    if (!c) return null;

    const [u] = await this.db.select({ companyId: usersTable.companyId })
      .from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    let vatReg = false;
    if (u?.companyId) {
      const [comp] = await this.db.select({ vat: companiesTable.vatNumber })
        .from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1);
      vatReg = !!(comp?.vat && String(comp.vat).trim());
    }

    // Commission base = pre-VAT RENT only. Rent installments have a null
    // description; service-fee installments carry a name and are excluded.
    // Installment amounts are VAT-inclusive when the contract has VAT, so we
    // strip the 15% back off to land on the net rent.
    const payIds: number[] = (rentDoc.paymentIds && rentDoc.paymentIds.length)
      ? rentDoc.paymentIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
      : (rentDoc.paymentId ? [Number(rentDoc.paymentId)] : []);
    let base = 0;
    if (payIds.length) {
      const pays = await this.db.select().from(paymentsTable)
        .where(and(inArray(paymentsTable.id, payIds), eq(paymentsTable.userId, uid)));
      for (const p of pays) {
        if (p.description) continue;                    // rent rows only (no description)
        const amt = round2(Number(p.amount));
        base = round2(base + (p.vatEnabled ? round2(amt / 1.15) : amt));
      }
    }
    if (!(base > 0)) return null;
    const commissionNet = round2((base * pct) / 100);
    if (commissionNet <= 0) return null;
    const total = vatReg ? round2(commissionNet * 1.15) : commissionNet;
    const number = await this.nextCommissionNumber(uid);

    const [comm] = await this.db.insert(simpleInvoicesTable).values({
      userId: uid, number, type: "invoice", kind: "commission", status: "draft",
      contractId,
      tenantId: null, tenantName: c.landlordName ?? null,
      client: {
        phone: c.landlordPhone ?? undefined, email: c.landlordEmail ?? undefined,
        address: c.landlordAddress ?? undefined, vatNumber: c.landlordTaxNumber ?? undefined,
      },
      items: [{ description: "عمولة إدارة الأملاك", quantity: 1, unitPrice: commissionNet, amount: commissionNet, vat: vatReg }],
      subtotal: commissionNet.toFixed(2), total: total.toFixed(2),
      issueDate: today(), dueDate: rentDoc.dueDate ?? null,
      billingReference: rentDoc.number,
      notes: `عمولة إدارة بنسبة ${pct}% على الفاتورة ${rentDoc.number}`,
    } as any).returning();
    return comm ?? null;
  }

  /**
   * Create a standalone receipt voucher (سند قبض) — a confirmed + collected
   * invoice issued directly (money already received), optionally linked to a
   * contract. Produces an RV number immediately.
   */
  @Post("receipt-voucher")
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE)
  async createReceiptVoucher(@CurrentUser() user: AuthUser, @Body() body: any) {
    const uid = scopeId(user);
    const amount = round2(Number(body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("المبلغ غير صالح");
    const paidDate = body?.paidDate || today();
    const method = body?.method || "bank_transfer";

    // Optional installment link(s) — the voucher also records a collection
    // against each, so a deposit/fee/rent collected this way reflects its real
    // collected/remaining figures (no orphaned "paid but collected = 0").
    const payIds: number[] = Array.isArray(body?.paymentIds)
      ? body.paymentIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
      : (body?.paymentId ? [Number(body.paymentId)] : []);

    // Optional contract link — snapshot its number/tenant. Fall back to the
    // contract of the first linked installment when not given explicitly.
    let contractId: number | null = body?.contractId ?? null;
    let tenantName: string | null = body?.tenantName ?? null;
    let tenantId: number | null = body?.tenantId ?? null;
    if (contractId) {
      const [c] = await this.db.select({ id: contractsTable.id, tenantName: contractsTable.tenantName, tenantId: contractsTable.tenantId })
        .from(contractsTable).where(and(eq(contractsTable.id, contractId), eq(contractsTable.userId, uid)));
      if (!c) { contractId = null; } else { tenantName = tenantName || c.tenantName; tenantId = tenantId ?? c.tenantId; }
    } else if (payIds.length) {
      const [pay] = await this.db.select({ contractId: paymentsTable.contractId, tenantName: contractsTable.tenantName, tenantId: contractsTable.tenantId })
        .from(paymentsTable).leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
        .where(and(eq(paymentsTable.id, payIds[0]!), eq(paymentsTable.userId, uid)));
      if (pay) { contractId = pay.contractId; tenantName = tenantName || pay.tenantName; tenantId = tenantId ?? pay.tenantId; }
    }

    const items = Array.isArray(body?.items) && body.items.length
      ? normalizeItems(body.items)
      : [{ description: String(body?.description || "سند قبض").trim(), quantity: 1, unitPrice: amount, amount, vat: false }];
    const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
    const number = await this.nextNumber(uid, "invoice");
    const [{ c: rvCount }] = await this.db.select({ c: count() }).from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.userId, uid), ilike(simpleInvoicesTable.receiptNumber, "RV-%")));
    const voucher = `RV-${String(Number(rvCount ?? 0) + 1).padStart(6, "0")}`;

    // "Include as collection?" — when true the voucher counts in Collections
    // (kind = null, so it surfaces as a confirmed collection); when false it's
    // evidence only (kind = "receipt"), shown solely under Receipt Vouchers.
    const voucherKind = body?.kind ?? (body?.countAsCollection ? null : "receipt");
    const [doc] = await this.db.insert(simpleInvoicesTable).values({
      userId: uid, number, type: "invoice", kind: voucherKind, status: "confirmed",
      contractId: contractId ?? null, tenantId: tenantId ?? null, tenantName: tenantName ?? null,
      client: body?.client ?? null, items,
      subtotal: subtotal.toFixed(2), total: amount.toFixed(2),
      issueDate: paidDate, paidDate, confirmedAt: new Date(),
      receiptNumber: voucher, paymentMethod: method, notes: body?.notes ?? null,
    } as any).returning();

    // Record the collection against the linked installment(s), distributing the
    // amount across their remaining balances and updating their paid status.
    if (payIds.length) {
      let left = amount;
      for (const pid of payIds) {
        if (left <= 0.01) break;
        const [payment] = await this.db.select().from(paymentsTable)
          .where(and(eq(paymentsTable.id, pid), eq(paymentsTable.userId, uid), isNull(paymentsTable.deletedAt)));
        if (!payment || payment.status === "cancelled") continue;
        const prior = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
          .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.paymentId, pid));
        const collectedBefore = round2(Number(prior[0]?.total ?? 0));
        const totalDue = round2(Number(payment.amount));
        const remaining = round2(totalDue - collectedBefore);
        if (remaining <= 0.01) continue;
        const amt = round2(Math.min(remaining, left));
        await this.db.insert(paymentCollectionsTable).values({
          paymentId: pid, userId: uid, amount: amt.toFixed(2), collectedDate: paidDate,
          method, receiptNumber: voucher, invoiceId: doc.id,
          notes: body?.notes ?? `سند قبض ${voucher}`,
        } as any);
        const after = round2(collectedBefore + amt);
        const status = after >= totalDue - 0.01 ? "paid" : "partially_paid";
        await this.db.update(paymentsTable).set({
          status, paidDate: status === "paid" ? paidDate : payment.paidDate, receiptNumber: voucher,
        }).where(eq(paymentsTable.id, pid));
        left = round2(left - amt);
      }
    }
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
      // Per-account sequential note voucher (CN-000001 / DN-000001).
      const notePrefix = doc.type === "credit" ? "CN" : "DN";
      const [nCount] = await this.db.select({ c: count() }).from(simpleInvoicesTable)
        .where(and(eq(simpleInvoicesTable.userId, uid), ilike(simpleInvoicesTable.receiptNumber, `${notePrefix}-%`)));
      const voucher = `${notePrefix}-${String(Number(nCount?.c ?? 0) + 1).padStart(6, "0")}`;
      if (doc.billingReference) {
        const [refInv] = await this.db.select().from(simpleInvoicesTable)
          .where(and(eq(simpleInvoicesTable.userId, uid), eq(simpleInvoicesTable.type, "invoice"),
            eq(simpleInvoicesTable.number, doc.billingReference), isNull(simpleInvoicesTable.deletedAt)));
        if (refInv) {
          const newSubtotal = Math.max(0, round2(Number(refInv.subtotal) + sign * Number(doc.subtotal)));
          const newTotal = Math.max(0, round2(Number(refInv.total) + sign * Number(doc.total)));
          // Append an adjustment LINE for the note so the invoice's line items
          // still reconcile with its (now reduced/increased) subtotal + total —
          // otherwise the lines keep their original values while the totals
          // change, and the document no longer adds up. The line carries VAT
          // only if the note itself did, so the per-line tax stays consistent.
          const noteHasVat = round2(Number(doc.total) - Number(doc.subtotal)) > 0.01;
          const adjAmount = round2(sign * Number(doc.subtotal));
          const adjLine = {
            description: `${doc.type === "credit" ? "إشعار دائن" : "إشعار مدين"} ${doc.number}`,
            quantity: 1, unitPrice: adjAmount, amount: adjAmount, vat: noteHasVat,
          };
          const prevItems = Array.isArray(refInv.items) ? refInv.items : [];
          // If the new total exceeds what's already been collected (a debit note
          // on a paid invoice), re-open it: clear the paid stamp so it shows as
          // partially paid and the Collect action works again.
          const [refColl] = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
            .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.invoiceId, refInv.id));
          const refCollected = round2(Number(refColl?.total ?? 0));
          const reopen = refCollected < newTotal - 0.01;
          await this.db.update(simpleInvoicesTable).set({
            items: [...prevItems, adjLine],
            subtotal: newSubtotal.toFixed(2),
            total: newTotal.toFixed(2),
            ...(reopen ? { paidDate: null } : {}),
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

    // A rent invoice spawns its paired commission invoice (فاتورة عمولة) only
    // once APPROVED — not at draft — so the commission surfaces alongside an
    // actually-issued rent invoice and is linked to it via billingReference.
    // Best-effort: never block the approval if the commission step fails.
    let commission: any = null;
    if (doc.kind !== "commission" && doc.contractId && ((doc.paymentIds && doc.paymentIds.length) || doc.paymentId)) {
      try { commission = await this.maybeCreateCommissionInvoice(uid, doc, Number(doc.contractId)); }
      catch { /* ignore — rent invoice already approved */ }
    }
    return { ...updated, commission };
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
    // NB: a fully-collected invoice carries a paidDate/receiptNumber, but a
    // debit note can later raise its total — so "already collected" is decided
    // by the remaining-balance check below (doc.total − collected), NOT by the
    // presence of a paid stamp.

    const paidDate = body?.paidDate || today();
    // Per-account sequential receipt-voucher number (RV-000001…) — count the
    // vouchers already issued for this account, not the global invoice id.
    const [rvCount] = await this.db.select({ c: count() }).from(simpleInvoicesTable)
      .where(and(eq(simpleInvoicesTable.userId, uid), ilike(simpleInvoicesTable.receiptNumber, "RV-%")));
    const voucher = `RV-${String(Number(rvCount?.c ?? 0) + 1).padStart(6, "0")}`;
    const method = body?.method ?? "bank_transfer";
    const receipt = (body?.receiptNumber && String(body.receiptNumber).trim()) || voucher;
    const ids = (doc.paymentIds && doc.paymentIds.length) ? doc.paymentIds : (doc.paymentId ? [doc.paymentId] : []);
    // Cap at what's still uncollected on this invoice (supports partial).
    const [priorAgg] = await this.db.select({ total: sum(paymentCollectionsTable.amount) })
      .from(paymentCollectionsTable).where(eq(paymentCollectionsTable.invoiceId, doc.id));
    const alreadyCollected = round2(Number(priorAgg?.total ?? 0));
    const invoiceRemaining = round2(round2(Number(doc.total)) - alreadyCollected);
    if (invoiceRemaining <= 0.01) throw new BadRequestException("تم تحصيل هذه الفاتورة بالكامل");
    let toCollect = body?.amount != null ? round2(Number(body.amount)) : invoiceRemaining;
    if (toCollect > invoiceRemaining + 0.01) throw new BadRequestException(`مبلغ التحصيل يتجاوز المتبقي (${invoiceRemaining.toFixed(2)})`);

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

    // Invoices not backed by an installment (commission / free invoices) still
    // record a collection — against the invoice only — so their collected
    // amount is consistent with the "paid" stamp (no "paid but collected = 0").
    if (!ids.length) {
      const collectAmt = body?.amount != null ? round2(Number(body.amount)) : invoiceRemaining;
      if (collectAmt > 0.01) {
        await this.db.insert(paymentCollectionsTable).values({
          paymentId: null, userId: uid, amount: collectAmt.toFixed(2), collectedDate: paidDate,
          method, receiptNumber: receipt, invoiceId: doc.id,
          notes: body?.notes ?? `فاتورة ${doc.number}`,
        } as any);
      }
    }

    // Only mark the invoice fully collected when prior + this collection cover
    // the total; a partial collection keeps it confirmed (collectible again).
    const collectedNow = body?.amount != null ? round2(Number(body.amount)) : invoiceRemaining;
    const fullyCollected = round2(alreadyCollected + collectedNow) >= round2(Number(doc.total)) - 0.01;
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
