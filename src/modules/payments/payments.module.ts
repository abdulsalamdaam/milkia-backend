import { Body, Controller, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc, sum } from "drizzle-orm";
import { paymentsTable, contractsTable } from "@milkia/database";
import { listQuerySchema } from "../../common/pagination";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";

@ApiTags("payments")
@ApiBearerAuth("user-jwt")
@Controller("payments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class PaymentsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PAYMENTS_VIEW)
  async list(@CurrentUser() user: AuthUser, @Query() rawQuery: any) {
    const status: string | undefined =
      typeof rawQuery?.status === "string" && ["paid", "pending", "overdue", "cancelled"].includes(rawQuery.status)
        ? rawQuery.status
        : undefined;
    const usePaginated = rawQuery && (rawQuery.page != null || rawQuery.pageSize != null || rawQuery.search != null || status != null);
    const q = listQuerySchema.parse(rawQuery ?? {});
    const baseWhere = and(eq(paymentsTable.userId, scopeId(user)), isNull(paymentsTable.deletedAt));
    const conds = [baseWhere];
    if (q.search) {
      conds.push(or(
        ilike(paymentsTable.receiptNumber, `%${q.search}%`),
        ilike(contractsTable.tenantName, `%${q.search}%`),
        ilike(contractsTable.contractNumber, `%${q.search}%`),
      ));
    }
    if (status) conds.push(eq(paymentsTable.status, status as any));
    const where = and(...conds);

    let rowsQ = this.db
      .select({
        id: paymentsTable.id,
        contractId: paymentsTable.contractId,
        amount: paymentsTable.amount,
        dueDate: paymentsTable.dueDate,
        paidDate: paymentsTable.paidDate,
        status: paymentsTable.status,
        receiptNumber: paymentsTable.receiptNumber,
        attachmentKey: paymentsTable.attachmentKey,
        description: paymentsTable.description,
        notes: paymentsTable.notes,
        createdAt: paymentsTable.createdAt,
        contractNumber: contractsTable.contractNumber,
        tenantName: contractsTable.tenantName,
      })
      .from(paymentsTable)
      .leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
      .where(where)
      .orderBy((q.order === "asc" ? asc : desc)(paymentsTable.dueDate))
      .$dynamic();
    if (usePaginated) rowsQ = rowsQ.limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [rows, totalRow, statsRows] = await Promise.all([
      rowsQ,
      usePaginated ? this.db.select({ total: count() }).from(paymentsTable)
        .leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
        .where(where) : Promise.resolve([{ total: 0 }]),
      // Status totals across ALL the user's payments (ignores search/status
      // filter) so the summary cards stay consistent while the table pages.
      usePaginated ? this.db.select({
        status: paymentsTable.status,
        cnt: count(),
        amount: sum(paymentsTable.amount),
      }).from(paymentsTable).where(baseWhere).groupBy(paymentsTable.status) : Promise.resolve([]),
    ]);

    const data = rows.map(r => ({
      id: r.id,
      contractId: r.contractId,
      amount: r.amount,
      dueDate: r.dueDate,
      paidDate: r.paidDate,
      status: r.status,
      receiptNumber: r.receiptNumber,
      attachmentKey: r.attachmentKey,
      description: r.description,
      notes: r.notes,
      createdAt: r.createdAt,
      contract: r.contractNumber ? { contractNumber: r.contractNumber, tenantName: r.tenantName } : null,
    }));
    if (!usePaginated) return data;

    const stats = { paid: 0, pending: 0, overdue: 0, cancelled: 0,
      paidCount: 0, pendingCount: 0, overdueCount: 0, cancelledCount: 0 };
    for (const s of statsRows as Array<{ status: string; cnt: number; amount: string | null }>) {
      const amt = Number(s.amount ?? 0);
      if (s.status === "paid")      { stats.paid = amt;      stats.paidCount = Number(s.cnt); }
      else if (s.status === "pending")   { stats.pending = amt;   stats.pendingCount = Number(s.cnt); }
      else if (s.status === "overdue")   { stats.overdue = amt;   stats.overdueCount = Number(s.cnt); }
      else if (s.status === "cancelled") { stats.cancelled = amt; stats.cancelledCount = Number(s.cnt); }
    }
    return { data, page: q.page, pageSize: q.pageSize, total: Number(totalRow[0]?.total ?? 0), stats };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PAYMENTS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const { contractId, amount, dueDate } = body;
    if (!contractId || !amount || !dueDate) throw new BadRequestException("رقم العقد والمبلغ وتاريخ الاستحقاق مطلوبة");

    const [payment] = await this.db.insert(paymentsTable).values({
      userId: scopeId(user),
      contractId,
      amount: String(amount),
      dueDate,
      paidDate: body.paidDate ?? null,
      status: body.status ?? "pending",
      receiptNumber: body.receiptNumber ?? null,
      notes: body.notes ?? null,
      isDemo: false,
    }).returning();
    return payment;
  }

  @Patch(":paymentId")
  @RequirePermissions(PERMISSIONS.PAYMENTS_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("paymentId") paymentId: string, @Body() body: any) {
    const id = parseInt(paymentId, 10);
    const fields = ["amount", "dueDate", "paidDate", "status", "receiptNumber", "attachmentKey", "notes"];
    const updateData: Record<string, unknown> = {};
    for (const f of fields) if (body[f] !== undefined) updateData[f] = body[f];
    const [payment] = await this.db.update(paymentsTable).set(updateData)
      .where(and(eq(paymentsTable.id, id), eq(paymentsTable.userId, scopeId(user)), isNull(paymentsTable.deletedAt)))
      .returning();
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }
}

@Module({ controllers: [PaymentsController] })
export class PaymentsModule {}
