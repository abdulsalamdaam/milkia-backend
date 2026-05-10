import { Body, Controller, Get, Inject, Module, NotFoundException, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { paymentsTable, contractsTable } from "@milkia/database";
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
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.db
      .select({
        id: paymentsTable.id,
        contractId: paymentsTable.contractId,
        amount: paymentsTable.amount,
        dueDate: paymentsTable.dueDate,
        paidDate: paymentsTable.paidDate,
        status: paymentsTable.status,
        receiptNumber: paymentsTable.receiptNumber,
        description: paymentsTable.description,
        notes: paymentsTable.notes,
        createdAt: paymentsTable.createdAt,
        contractNumber: contractsTable.contractNumber,
        tenantName: contractsTable.tenantName,
      })
      .from(paymentsTable)
      .leftJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
      .where(and(eq(paymentsTable.userId, scopeId(user)), isNull(paymentsTable.deletedAt)))
      .orderBy(paymentsTable.dueDate);

    return rows.map(r => ({
      id: r.id,
      contractId: r.contractId,
      amount: r.amount,
      dueDate: r.dueDate,
      paidDate: r.paidDate,
      status: r.status,
      receiptNumber: r.receiptNumber,
      description: r.description,
      notes: r.notes,
      createdAt: r.createdAt,
      contract: r.contractNumber ? { contractNumber: r.contractNumber, tenantName: r.tenantName } : null,
    }));
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
    const fields = ["amount", "dueDate", "paidDate", "status", "receiptNumber", "notes"];
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
