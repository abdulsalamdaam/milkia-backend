/**
 * Server-side invoice / receipt-voucher HTML — a verbatim port of the web's
 * `lib/export-invoice.ts` template, so a PDF rendered here (headless Chromium)
 * is identical to the document the web prints. Receipt vouchers render as a
 * distinct document (no QR, "Received from", the RV number).
 */

export type InvoiceParty = {
  name?: string | null; phone?: string | null; email?: string | null; address?: string | null; vatNumber?: string | null; extra?: string | null;
};

type InvoiceDocData = {
  title: string; number: string; status: string;
  issueDate?: string | null; dueDate?: string | null; receiptNumber?: string | null; reference?: string | null;
  seller: InvoiceParty; client: InvoiceParty;
  items: Array<{ description: string; quantity: number; unitPrice: number; amount: number; vat?: boolean }>;
  subtotal: number; vat: number; total: number; vatApplies: boolean; vatRate: number; currency: string;
  notes?: string | null; qrSvg?: string; accent?: string;
  labels: Record<string, string>;
};

const esc = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

function partyBlock(p: InvoiceParty, L: Record<string, string>): string {
  const lines: string[] = [];
  if (p.extra) lines.push(`<div class="party-line">${esc(p.extra)}</div>`);
  if (p.address) lines.push(`<div class="party-line">${esc(p.address)}</div>`);
  if (p.phone) lines.push(`<div class="party-line">${esc(L.phone)}: <span dir="ltr">${esc(p.phone)}</span></div>`);
  if (p.email) lines.push(`<div class="party-line">${esc(L.email)}: <span dir="ltr">${esc(p.email)}</span></div>`);
  if (p.vatNumber) lines.push(`<div class="party-line">${esc(L.vatNumber)}: <span dir="ltr">${esc(p.vatNumber)}</span></div>`);
  return lines.join("") || `<div class="party-line muted">—</div>`;
}

function buildHtml(d: InvoiceDocData, rtl: boolean): string {
  const L = d.labels;
  const align = rtl ? "right" : "left";
  const opp = rtl ? "left" : "right";
  const rows = d.items.map((it, i) => {
    const net = it.amount;
    const itVat = (it.vat ?? d.vatApplies);
    const rate = itVat ? d.vatRate : 0;
    const lineVat = itVat ? Math.round((net * d.vatRate + Number.EPSILON) * 100) / 100 : 0;
    return `<tr>
      <td class="c-idx">${i + 1}</td>
      <td class="c-desc">${esc(it.description) || "—"}</td>
      <td class="c-num" dir="ltr">${esc(it.quantity)}</td>
      <td class="c-num" dir="ltr">${money(it.unitPrice)}</td>
      <td class="c-num" dir="ltr">${money(net)}</td>
      <td class="c-num" dir="ltr">${Math.round(rate * 100)}%</td>
      <td class="c-num" dir="ltr">${money(lineVat)}</td>
      <td class="c-num c-amount" dir="ltr">${money(net + lineVat)}</td>
    </tr>`;
  }).join("");
  const metaRow = (label: string, value: string) =>
    `<div class="meta-row"><span class="meta-k">${esc(label)}</span><span class="meta-v">${value}</span></div>`;

  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${rtl ? "ar" : "en"}"><head>
  <meta charset="utf-8"><title>${esc(d.title)} ${esc(d.number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'IBM Plex Sans Arabic','Noto Sans Arabic','Inter',system-ui,sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    .sheet { max-width: 760px; margin: 0 auto; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 18px; border-bottom: 3px solid #2563eb; }
    .brand { display: flex; gap: 14px; align-items: center; }
    .logo { width: 76px; height: 76px; border: 2px dashed #cbd5e1; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 10px; font-weight: 700; text-align: center; line-height: 1.2; background: #f8fafc; }
    .seller-name { font-size: 17px; font-weight: 800; color: #1e293b; }
    .party-line { color: #475569; font-size: 11px; margin-top: 2px; }
    .party-line.muted { color: #94a3b8; }
    .doc-title { text-align: ${opp}; }
    .doc-title h1 { font-size: 26px; margin: 0; color: #2563eb; letter-spacing: 0.5px; font-family: ui-monospace,monospace; }
    .badge { display: inline-block; margin-top: 8px; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .meta { min-width: 230px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
    .meta-row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; font-size: 11px; }
    .meta-k { color: #64748b; } .meta-v { font-weight: 700; color: #1e293b; }
    .mid { display: flex; justify-content: space-between; gap: 16px; margin: 18px 0; }
    .party { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin: 0 0 6px; }
    .party-name { font-size: 14px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { background: #1e293b; color: #fff; padding: 9px 10px; font-size: 11px; font-weight: 700; text-align: ${align}; }
    thead th.c-num { text-align: ${opp}; }
    tbody td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    .c-idx { color: #94a3b8; width: 28px; }
    .c-num { text-align: ${opp}; white-space: nowrap; }
    .c-amount { font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .bottom { margin-top: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .qr { width: 128px; height: 128px; border: 1px solid #e2e8f0; padding: 5px; background: #fff; overflow: hidden; }
    .qr svg { width: 100%; height: 100%; display: block; }
    .qr-title { font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center; }
    .totals-box { min-width: 280px; }
    .t-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 12px; }
    .t-grand { background: #2563eb; color: #fff; border-radius: 8px; font-weight: 800; font-size: 14px; padding: 10px 12px; margin-top: 4px; }
    .notes { margin-top: 22px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #92400e; font-size: 11px; }
    .foot { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style></head><body>
  <div class="sheet">
    <div class="top"${d.accent ? ` style="border-bottom-color:${esc(d.accent)}"` : ""}>
      <div class="brand">
        <div class="logo">${esc(L.logo)}</div>
        <div>
          <div class="seller-name">${esc(d.seller.name) || "—"}</div>
          ${d.seller.vatNumber ? `<div class="party-line">${esc(L.vatNumber)}: <span dir="ltr">${esc(d.seller.vatNumber)}</span></div>` : ""}
        </div>
      </div>
      <div class="doc-title">
        <h1${d.accent ? ` style="color:${esc(d.accent)}"` : ""}>${esc(d.number)}</h1>
        <div class="meta" style="margin-top:8px;text-align:${align};">
          ${metaRow(rtl ? "النوع" : "Type", esc(d.title))}
          ${metaRow(L.issueDate, esc(fmtDate(d.issueDate)))}
          ${d.dueDate ? metaRow(L.dueDate, esc(fmtDate(d.dueDate))) : ""}
          ${metaRow(L.status, esc(d.status))}
        </div>
      </div>
    </div>

    <div class="mid">
      <div class="party">
        <h3>${rtl ? "بيانات البائع" : "Seller"}</h3>
        <div class="party-name">${esc(d.seller.name) || "—"}</div>
        ${partyBlock(d.seller, L)}
      </div>
      <div class="party">
        <h3>${esc(L.billTo)}</h3>
        <div class="party-name">${esc(d.client.name) || "—"}</div>
        ${partyBlock(d.client, L)}
        ${d.receiptNumber ? `<div class="party-line">${esc(L.receipt)}: <b>${esc(d.receiptNumber)}</b></div>` : ""}
        ${d.reference ? `<div class="party-line">${esc(L.reference)}: <b>${esc(d.reference)}</b></div>` : ""}
      </div>
    </div>

    <table>
      <thead><tr>
        <th class="c-idx">#</th>
        <th class="c-desc">${esc(L.desc)}</th>
        <th class="c-num">${esc(L.qty)}</th>
        <th class="c-num">${esc(L.price)}</th>
        <th class="c-num">${esc(L.net)}</th>
        <th class="c-num">${esc(L.vatRate)}</th>
        <th class="c-num">${esc(L.lineVat)}</th>
        <th class="c-num">${esc(L.lineTotal)}</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:18px">—</td></tr>`}</tbody>
    </table>

    <div class="bottom">
      <div>${d.qrSvg ? `<div class="qr">${d.qrSvg}</div><div class="qr-title">${esc(L.qrTitle)}</div>` : ""}</div>
      <div class="totals-box">
        <div class="t-row"><span>${esc(L.totalExcl)}</span><span dir="ltr">${money(d.subtotal)} ${esc(d.currency)}</span></div>
        ${d.vat > 0.01 ? `<div class="t-row"><span>${esc(L.totalVat)} (${Math.round(d.vatRate * 100)}%)</span><span dir="ltr">${money(d.vat)} ${esc(d.currency)}</span></div>` : ""}
        <div class="t-row t-grand"><span>${esc(L.totalIncl)}</span><span dir="ltr">${money(d.total)} ${esc(d.currency)}</span></div>
      </div>
    </div>

    ${d.notes ? `<div class="notes"><strong>${esc(L.notes)}:</strong> ${esc(d.notes)}</div>` : ""}
    <div class="foot">${esc(d.seller.name) || ""} · ${esc(d.number)}</div>
  </div>
</body></html>`;
}

/** Normalised invoice shape (same fields the mobile invoices endpoint returns). */
export type SimpleInvoiceDoc = {
  number: string; type: string; isVoucher: boolean; buyerHasVat: boolean;
  subtotal: number; vat: number; total: number;
  items: Array<{ description?: string; quantity?: number; unitPrice?: number; amount?: number; vat?: boolean }>;
  issueDate?: string | null; dueDate?: string | null; paidDate?: string | null;
  receiptNumber?: string | null; billingReference?: string | null; notes?: string | null;
  seller: InvoiceParty; buyer: InvoiceParty; qrSvg?: string | null;
};

/** Build the print HTML for an invoice/voucher. `asVoucher` forces the
 *  receipt-voucher presentation even for a collected (kind-null) invoice. */
export function buildSimpleInvoiceHtml(inv: SimpleInvoiceDoc, ar: boolean, asVoucher = false): string {
  const isVoucher = asVoucher || inv.isVoucher;
  const accent = inv.type === "credit" ? "#E11D48" : inv.type === "debit" ? "#D97706" : "#2563eb";
  const title = isVoucher ? (ar ? "سند قبض" : "Receipt voucher")
    : inv.type === "credit" ? (ar ? "إشعار دائن" : "Credit Note")
    : inv.type === "debit" ? (ar ? "إشعار مدين" : "Debit Note")
    : inv.buyerHasVat ? (ar ? "فاتورة ضريبية" : "Tax Invoice")
    : (ar ? "فاتورة ضريبية مبسّطة" : "Simplified Tax Invoice");
  const status = inv.paidDate ? (ar ? "مدفوعة" : "Paid") : (ar ? "معتمدة" : "Approved");
  const doc: InvoiceDocData = {
    title,
    number: isVoucher ? (inv.receiptNumber || inv.number) : inv.number,
    status,
    issueDate: inv.issueDate, dueDate: isVoucher ? null : inv.dueDate,
    receiptNumber: isVoucher ? null : inv.receiptNumber, reference: inv.billingReference,
    seller: inv.seller ?? {}, client: inv.buyer ?? {},
    items: (inv.items ?? []).map((it) => ({
      description: it.description ?? "", quantity: it.quantity ?? 1,
      unitPrice: it.unitPrice ?? it.amount ?? 0, amount: it.amount ?? 0, vat: it.vat,
    })),
    subtotal: inv.subtotal ?? 0, vat: inv.vat ?? 0, total: inv.total ?? 0,
    vatApplies: (inv.vat ?? 0) > 0.01, vatRate: 0.15, currency: ar ? "ر.س" : "SAR",
    notes: inv.notes,
    qrSvg: isVoucher ? undefined : (inv.qrSvg || undefined),
    accent: accent !== "#2563eb" ? accent : undefined,
    labels: {
      logo: ar ? "الشعار" : "LOGO",
      billTo: isVoucher ? (ar ? "المستلَم منه" : "Received from") : (ar ? "بيانات العميل" : "Bill to"),
      desc: ar ? "البند" : "Item", qty: ar ? "الكمية" : "Qty", price: ar ? "السعر" : "Price",
      net: ar ? "الصافي" : "Net", vatRate: ar ? "ض%" : "VAT%", lineVat: ar ? "الضريبة" : "VAT", lineTotal: ar ? "الإجمالي" : "Total",
      totalExcl: ar ? "الإجمالي قبل الضريبة" : "Total excl. VAT", totalVat: ar ? "ضريبة القيمة المضافة" : "VAT", totalIncl: ar ? "الإجمالي شامل الضريبة" : "Total incl. VAT",
      qrTitle: ar ? "رمز الفاتورة الضريبية" : "Tax-invoice QR",
      issueDate: ar ? "تاريخ الإصدار" : "Issue date", dueDate: ar ? "تاريخ الاستحقاق" : "Due date", status: ar ? "الحالة" : "Status",
      receipt: ar ? "رقم السند" : "Voucher no.", reference: ar ? "مرجع" : "Reference",
      phone: ar ? "الجوال" : "Phone", email: ar ? "البريد" : "Email", address: ar ? "العنوان" : "Address",
      vatNumber: ar ? "الرقم الضريبي" : "VAT", notes: ar ? "ملاحظات" : "Notes",
    },
  };
  return buildHtml(doc, ar);
}
