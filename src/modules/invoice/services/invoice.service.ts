import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq, and, isNull, desc, ilike, count } from "drizzle-orm";
import {
  invoicesTable,
  invoiceLinesTable,
  type Invoice,
  type InvoiceLine,
  type SellerSnapshot,
  type BuyerSnapshot,
  zatcaCredentialsTable,
  ZATCA_INITIAL_PIH,
} from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../../database/database.module";
import { InvoiceBuilderService, type InvoiceLineInput, todayIsoDate, todayIsoTime } from "./invoice-builder.service";
import { InvoiceSignerService } from "./invoice-signer.service";
import { ZatcaApiService } from "./zatca-api.service";
import { ZatcaOnboardingService } from "./zatca-onboarding.service";

export interface CreateInvoiceDto {
  invoiceNumber: string;
  profile: "standard" | "simplified";
  docType?: "invoice" | "credit" | "debit";
  language?: "ar" | "en";
  currency?: string;
  contractId?: number | null;
  paymentId?: number | null;
  buyer?: BuyerSnapshot | null;
  lines: InvoiceLineInput[];
  /** For credit/debit notes: original invoice ID + reason. */
  billingReferenceId?: string | null;
  instructionNote?: string | null;
  paymentMeansCode?: string;
  notes?: string | null;
  /** Submission target for first dispatch. Auto-derived from profile if absent. */
  submitTo?: "compliance" | "clearance" | "reporting";
  isDemo?: boolean;
}

export interface IssueResult {
  invoice: Invoice;
  lines: InvoiceLine[];
}

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Drizzle,
    private readonly builder: InvoiceBuilderService,
    private readonly signer: InvoiceSignerService,
    private readonly api: ZatcaApiService,
    private readonly onboarding: ZatcaOnboardingService,
  ) {}

  /**
   * Issue (build → sign → submit → store) a new invoice for the given user.
   *
   * Wraps the entire flow:
   *   1. fetch active env credentials and current ICV/PIH chain head
   *   2. assemble the unsigned UBL using the seller snapshot from creds
   *   3. sign (XAdES) + compute QR
   *   4. submit to ZATCA (compliance/clearance/reporting)
   *   5. write invoice + invoice_lines rows
   *   6. update PIH chain head + ICV
   *
   * Failures at step 4 still write a row with status="error" so the caller
   * can retry submission later via `resubmit()`.
   */
  async issue(userId: number, dto: CreateInvoiceDto): Promise<IssueResult> {
    if (!dto.lines?.length) throw new BadRequestException("invoice must have at least one line");
    if (!dto.invoiceNumber) throw new BadRequestException("invoiceNumber required");

    // Reject duplicate invoice number early for a clean error.
    const [existing] = await this.db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.userId, userId),
          eq(invoicesTable.invoiceNumber, dto.invoiceNumber),
          isNull(invoicesTable.deletedAt),
        ),
      );
    if (existing) throw new ConflictException(`Invoice number ${dto.invoiceNumber} already exists`);

    const { creds, decrypted } = await this.onboarding.getActiveCredentials(userId);
    const nextIcv = decrypted.icv + 1;
    const issueDate = todayIsoDate();
    const issueTime = todayIsoTime();

    const sellerSnapshot: SellerSnapshot = {
      name: creds.sellerName,
      nameAr: creds.sellerNameAr,
      vat: creds.sellerVatNumber,
      crn: creds.sellerCrn,
      street: creds.sellerStreet,
      buildingNo: creds.sellerBuildingNo,
      district: creds.sellerDistrict,
      city: creds.sellerCity,
      postalZone: creds.sellerPostalZone,
      additionalNo: creds.sellerAdditionalNo,
    };

    const built = this.builder.build({
      profile: dto.profile,
      docType: dto.docType ?? "invoice",
      invoiceId: dto.invoiceNumber,
      icv: nextIcv,
      pih: decrypted.pih,
      issueDate,
      issueTime,
      seller: sellerSnapshot,
      buyer: dto.buyer ?? null,
      lines: dto.lines,
      billingReference: dto.billingReferenceId ? { id: dto.billingReferenceId } : undefined,
      instructionNote: dto.instructionNote ?? undefined,
      paymentMeansCode: dto.paymentMeansCode,
      currency: dto.currency,
    });

    const signed = await this.signer.signInvoice({
      invoiceXml: built.xml,
      privateKeyPem: decrypted.privateKeyPem,
      certPem: decrypted.certPem,
      profile: dto.profile,
      qrFields: {
        sellerName: sellerSnapshot.name,
        vatNumber: sellerSnapshot.vat,
        timestamp: `${issueDate}T${issueTime}`,
        totalWithVat: built.totals.taxInclusive.toFixed(2),
        vatTotal: built.totals.taxAmount.toFixed(2),
      },
    });

    // Pick endpoint
    const submitTo: "compliance" | "clearance" | "reporting" =
      dto.submitTo
        ?? (decrypted.environment === "production"
          ? dto.profile === "standard"
            ? "clearance"
            : "reporting"
          : "compliance");

    const submission =
      submitTo === "clearance"
        ? this.api.clearInvoice
        : submitTo === "reporting"
          ? this.api.reportInvoice
          : this.api.complianceInvoice;
    let resp;
    try {
      resp = await submission.call(this.api, {
        binarySecurityToken: decrypted.binarySecurityToken,
        secret: decrypted.secret,
        invoiceHash: signed.invoiceHashBase64,
        uuid: built.uuid,
        signedXml: signed.signedXml,
        environment: decrypted.environment,
      });
    } catch (e) {
      resp = { status: 0, raw: (e as Error).message, json: null, headers: {} };
    }

    const status = this.deriveStatus(resp);
    const clearedXml =
      submitTo === "clearance" && (resp.json as any)?.clearedInvoice
        ? Buffer.from(String((resp.json as any).clearedInvoice), "base64").toString("utf8")
        : null;

    const [invoice] = await this.db
      .insert(invoicesTable)
      .values({
        userId,
        invoiceNumber: dto.invoiceNumber,
        uuid: built.uuid,
        contractId: dto.contractId ?? null,
        paymentId: dto.paymentId ?? null,
        profile: dto.profile,
        docType: dto.docType ?? "invoice",
        language: dto.language ?? "ar",
        currency: dto.currency ?? "SAR",
        issueDate,
        issueTime,
        icv: nextIcv,
        pih: decrypted.pih,
        environment: decrypted.environment,
        billingReferenceId: dto.billingReferenceId ?? null,
        instructionNote: dto.instructionNote ?? null,
        paymentMeansCode: dto.paymentMeansCode ?? "10",
        sellerSnapshot,
        buyerSnapshot: dto.buyer ?? null,
        totals: built.totals,
        unsignedXml: built.xml,
        signedXml: signed.signedXml,
        invoiceHash: signed.invoiceHashBase64,
        qrBase64: signed.qrBase64,
        signatureValue: signed.signatureValueBase64,
        status,
        submittedTo: submitTo,
        httpStatus: resp.status || null,
        zatcaResponse: (resp.json ?? null) as any,
        submittedAt: new Date(),
        clearedXml,
        notes: dto.notes ?? null,
        isDemo: dto.isDemo ?? false,
      })
      .returning();

    const linesRows = await this.db
      .insert(invoiceLinesTable)
      .values(
        built.computedLines.map((l, i) => ({
          invoiceId: invoice.id,
          lineNumber: i + 1,
          externalId: l.id,
          name: l.name,
          unitCode: l.unitCode,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          vatCategory: l.vatCategory,
          vatPercent: String(l.vatPercent ?? 0),
          lineNet: l._lineNet.toFixed(2),
          lineVat: l._lineVat.toFixed(2),
          lineTotalIncVat: l._lineTotalIncVat.toFixed(2),
        })),
      )
      .returning();

    // Always advance PIH if we produced a valid signed hash, regardless of
    // ZATCA acceptance — the chain is local and re-submitting the same
    // invoice will use the same hash anyway.
    await this.onboarding.commitInvoiceState(
      userId,
      decrypted.environment,
      nextIcv,
      signed.invoiceHashBase64,
    );

    return { invoice, lines: linesRows };
  }

  /* ─── Read APIs ─────────────────────────────────────────────────────── */

  async list(userId: number, opts: { limit?: number; offset?: number } = {}): Promise<Invoice[]> {
    return this.db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.userId, userId), isNull(invoicesTable.deletedAt)))
      .orderBy(desc(invoicesTable.createdAt))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
  }

  /** Paginated + invoice-number search — returns rows plus the total count. */
  async listPaged(
    userId: number,
    opts: { page: number; pageSize: number; search?: string },
  ): Promise<{ data: Invoice[]; total: number }> {
    const conds = [eq(invoicesTable.userId, userId), isNull(invoicesTable.deletedAt)];
    if (opts.search) conds.push(ilike(invoicesTable.invoiceNumber, `%${opts.search}%`));
    const where = and(...conds);
    const [rows, totalRow] = await Promise.all([
      this.db.select().from(invoicesTable).where(where)
        .orderBy(desc(invoicesTable.createdAt))
        .limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize),
      this.db.select({ total: count() }).from(invoicesTable).where(where),
    ]);
    return { data: rows, total: Number(totalRow[0]?.total ?? 0) };
  }

  async getOneWithLines(userId: number, id: number): Promise<{ invoice: Invoice; lines: InvoiceLine[] }> {
    const [invoice] = await this.db
      .select()
      .from(invoicesTable)
      .where(
        and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId), isNull(invoicesTable.deletedAt)),
      );
    if (!invoice) throw new NotFoundException("Invoice not found");
    const lines = await this.db
      .select()
      .from(invoiceLinesTable)
      .where(eq(invoiceLinesTable.invoiceId, id))
      .orderBy(invoiceLinesTable.lineNumber);
    return { invoice, lines };
  }

  async softDelete(userId: number, id: number) {
    const r = await this.db
      .update(invoicesTable)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId), isNull(invoicesTable.deletedAt)),
      )
      .returning({ id: invoicesTable.id });
    if (!r.length) throw new NotFoundException("Invoice not found");
    return { ok: true };
  }

  /**
   * Resubmit an invoice (e.g. after a transient ZATCA outage). The signed
   * XML is re-used as-is — re-signing would invalidate the hash chain.
   */
  async resubmit(userId: number, id: number) {
    const { invoice } = await this.getOneWithLines(userId, id);
    if (!invoice.signedXml || !invoice.invoiceHash) {
      throw new BadRequestException("Invoice has no signed XML to resubmit");
    }
    const { decrypted } = await this.onboarding.getActiveCredentials(userId);
    const submitTo = (invoice.submittedTo ?? "compliance") as "compliance" | "clearance" | "reporting";
    const submission =
      submitTo === "clearance"
        ? this.api.clearInvoice
        : submitTo === "reporting"
          ? this.api.reportInvoice
          : this.api.complianceInvoice;
    const resp = await submission.call(this.api, {
      binarySecurityToken: decrypted.binarySecurityToken,
      secret: decrypted.secret,
      invoiceHash: invoice.invoiceHash,
      uuid: invoice.uuid,
      signedXml: invoice.signedXml,
      environment: invoice.environment,
    });
    const newStatus = this.deriveStatus(resp);
    const clearedXml =
      submitTo === "clearance" && (resp.json as any)?.clearedInvoice
        ? Buffer.from(String((resp.json as any).clearedInvoice), "base64").toString("utf8")
        : invoice.clearedXml;
    const [updated] = await this.db
      .update(invoicesTable)
      .set({
        status: newStatus,
        httpStatus: resp.status,
        zatcaResponse: (resp.json ?? null) as any,
        submittedAt: new Date(),
        clearedXml,
      })
      .where(eq(invoicesTable.id, invoice.id))
      .returning();
    return updated;
  }

  private deriveStatus(resp: { status: number; json: any | null }): Invoice["status"] {
    if (resp.status === 0) return "error";
    const j = resp.json;
    if (j?.clearanceStatus === "CLEARED") return "cleared";
    if (j?.reportingStatus === "REPORTED") return "reported";
    if (resp.status >= 400) {
      if (j?.validationResults?.errorMessages?.length) return "rejected";
      return "error";
    }
    if (resp.status >= 200 && resp.status < 300) return "submitted";
    return "submitted";
  }
}
