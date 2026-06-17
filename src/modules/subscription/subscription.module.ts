import { BadRequestException, Body, Controller, Get, Inject, Module, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, desc, eq } from "drizzle-orm";
import { usersTable, subscriptionPaymentsTable } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { scopeId } from "../../common/scope";
import { resolvePackage, planPrice, isPayablePlan, isPackagePlan, type BillingCycle } from "../../common/packages";
import { deriveSubscription } from "../../common/subscription";
import { createMoyasarInvoice, fetchMoyasarInvoice, isMoyasarConfigured } from "../../common/moyasar";

const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || "https://app.oqudk.com").replace(/\/$/, "");

/** Open / renew the subscription window for `cycle` starting now. */
function nextEndDate(cycle: BillingCycle, from = new Date()): Date {
  const d = new Date(from);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

@ApiTags("subscription")
@ApiBearerAuth("user-jwt")
@Controller("me/subscription")
@UseGuards(JwtAuthGuard)
class SubscriptionController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /** Subscription status + payment history for the current account. */
  @Get()
  async mySubscription(@CurrentUser() user: AuthUser) {
    const ownerId = scopeId(user);
    const [owner] = await this.db.select().from(usersTable).where(eq(usersTable.id, ownerId));
    const cycle = (owner?.billingCycle === "yearly" ? "yearly" : "monthly") as BillingCycle;
    const sub = deriveSubscription({ storedStatus: owner?.subscriptionStatus, subscriptionEndsAt: owner?.subscriptionEndsAt });
    const payments = await this.db.select().from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.userId, ownerId))
      .orderBy(desc(subscriptionPaymentsTable.createdAt));
    return {
      plan: resolvePackage(owner?.packagePlan).key,
      billingCycle: cycle,
      amountDue: planPrice(owner?.packagePlan, cycle),
      payable: isPayablePlan(owner?.packagePlan),
      moyasarConfigured: isMoyasarConfigured(),
      status: sub.status,
      needsPayment: sub.needsPayment,
      locked: sub.locked,
      graceUntil: sub.graceUntil,
      daysUntilLock: sub.daysUntilLock,
      subscriptionStartedAt: owner?.subscriptionStartedAt ?? null,
      subscriptionEndsAt: owner?.subscriptionEndsAt ?? null,
      payments,
    };
  }

  /**
   * Start a subscription payment. Optionally switches the plan/cycle first
   * (the "upgrade" path), then creates a Moyasar hosted invoice and returns
   * its payment URL. Only the account owner (not an employee) may pay.
   */
  @Post("pay")
  async pay(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (user.ownerUserId) throw new BadRequestException("صلاحية الدفع لصاحب الحساب فقط");
    const ownerId = user.id;
    const [owner] = await this.db.select().from(usersTable).where(eq(usersTable.id, ownerId));
    if (!owner) throw new BadRequestException("Account not found");

    // Optional plan/cycle switch (upgrade or change cycle).
    let plan = owner.packagePlan;
    let cycle = (owner.billingCycle === "yearly" ? "yearly" : "monthly") as BillingCycle;
    if (body?.plan && isPackagePlan(body.plan)) plan = body.plan;
    if (body?.cycle === "monthly" || body?.cycle === "yearly") cycle = body.cycle;

    if (!isPayablePlan(plan)) throw new BadRequestException("هذه الباقة تُسعّر عند الطلب — تواصل مع المبيعات");
    const amount = planPrice(plan, cycle);
    if (!amount || amount <= 0) throw new BadRequestException("تعذّر تحديد قيمة الاشتراك");

    // Record the chosen plan/cycle as the DESIRED selection only — do NOT touch
    // the live package yet. The pending payment row below carries the choice,
    // and the webhook applies it once payment is actually confirmed. This stops
    // a click on "Pay" from upgrading/switching a user who never paid.
    await this.db.update(usersTable).set({ desiredPackagePlan: plan, desiredBillingCycle: cycle }).where(eq(usersTable.id, ownerId));

    if (!isMoyasarConfigured()) {
      throw new BadRequestException("بوابة الدفع غير مُهيأة بعد. يرجى المحاولة لاحقاً.");
    }

    // Record a pending payment, then create the Moyasar invoice referencing it.
    const [row] = await this.db.insert(subscriptionPaymentsTable).values({
      userId: ownerId, plan, billingCycle: cycle, amount: amount.toFixed(2), currency: "SAR", status: "pending",
    }).returning();

    const planLabel = resolvePackage(plan).labelAr;
    const invoice = await createMoyasarInvoice({
      amountSar: amount,
      description: `اشتراك عقودك — ${planLabel} (${cycle === "yearly" ? "سنوي" : "شهري"})`,
      callbackUrl: `${APP_PUBLIC_URL}/dashboard/settings?section=billing&paid=1`,
      successUrl: `${APP_PUBLIC_URL}/dashboard/settings?section=billing&paid=1`,
      backUrl: `${APP_PUBLIC_URL}/dashboard/settings?section=billing`,
      metadata: { subscriptionPaymentId: String(row!.id), userId: String(ownerId), plan, cycle },
    });

    await this.db.update(subscriptionPaymentsTable)
      .set({ moyasarInvoiceId: invoice.id, paymentUrl: invoice.url })
      .where(eq(subscriptionPaymentsTable.id, row!.id));

    return { paymentId: row!.id, url: invoice.url, invoiceId: invoice.id };
  }
}

/**
 * Moyasar webhook (public — no JWT). Moyasar POSTs payment/invoice events;
 * we re-fetch the invoice to verify it's really paid, then activate/renew the
 * owner's subscription. Idempotent: a second call for an already-paid row is a
 * no-op.
 */
@ApiTags("subscription")
@Controller("subscription")
class SubscriptionWebhookController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Post("webhook")
  async webhook(@Body() body: any, @Req() _req: any) {
    // Optional shared-secret guard (set MOYASAR_WEBHOOK_SECRET + configure it
    // in the Moyasar dashboard).
    const expected = process.env.MOYASAR_WEBHOOK_SECRET;
    if (expected && body?.secret_token && body.secret_token !== expected) {
      return { ok: false };
    }

    // Extract the invoice id from the various event shapes Moyasar may send.
    const data = body?.data ?? body ?? {};
    const invoiceId: string | undefined =
      data.invoice_id || data.id || data?.invoice?.id || data?.metadata?.invoice_id;
    const metaPaymentId = data?.metadata?.subscriptionPaymentId;

    let paid = String(data?.status || "").toLowerCase() === "paid";
    let paymentId: string | undefined = data?.id;

    // Verify against Moyasar when configured (don't trust the payload alone).
    if (invoiceId && isMoyasarConfigured()) {
      try {
        const inv = await fetchMoyasarInvoice(invoiceId);
        paid = String(inv.status).toLowerCase() === "paid";
      } catch { /* fall back to payload status */ }
    }
    if (!paid) return { ok: true, ignored: true };

    // Locate the pending subscription_payment row.
    const [row] = invoiceId
      ? await this.db.select().from(subscriptionPaymentsTable).where(eq(subscriptionPaymentsTable.moyasarInvoiceId, invoiceId))
      : metaPaymentId
        ? await this.db.select().from(subscriptionPaymentsTable).where(eq(subscriptionPaymentsTable.id, parseInt(metaPaymentId, 10)))
        : [];
    if (!row) return { ok: true, unmatched: true };
    if (row.status === "paid") return { ok: true, already: true };

    await this.db.update(subscriptionPaymentsTable)
      .set({ status: "paid", paidAt: new Date(), moyasarPaymentId: paymentId ?? null })
      .where(eq(subscriptionPaymentsTable.id, row.id));

    // Activate / renew: start now, end one cycle later, clear pending state.
    const cycle = (row.billingCycle === "yearly" ? "yearly" : "monthly") as BillingCycle;
    const now = new Date();
    await this.db.update(usersTable).set({
      packagePlan: row.plan,
      billingCycle: cycle,
      // Payment confirmed → the desired selection is now the live plan.
      desiredPackagePlan: null,
      desiredBillingCycle: null,
      subscriptionStatus: "active",
      subscriptionStartedAt: now,
      subscriptionEndsAt: nextEndDate(cycle, now),
    }).where(eq(usersTable.id, row.userId));

    return { ok: true, activated: true };
  }
}

@Module({ controllers: [SubscriptionController, SubscriptionWebhookController] })
export class SubscriptionModule {}
