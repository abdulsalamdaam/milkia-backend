export type FeeEntry = { id: string; name: string; amount: string; recurrence: string; dueDate: string; paymentMethod: string };
/** Per-year rent override — `year` is 1-based (year 1, 2, 3, …). */
export type RentTerm = { year: number; amount: number };
/** One hand-built rent installment for a custom payment schedule. */
export type CustomScheduleEntry = { dueDate: string; amount: number | string };
export type InstallmentRow = { contractId: number; userId: number; amount: string; dueDate: string; status: "pending"; description: string | null; isDemo: boolean };

export const VAT_RATE = 0.15;
/** Round to 2 decimals without binary-float drift (e.g. 0.1 + 0.2). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function buildInstallments(
  contractId: number,
  userId: number,
  startDate: string,
  endDate: string,
  monthlyRent: string,
  paymentFrequency: string,
  additionalFees?: FeeEntry[] | null,
  vatEnabled = false,
  escalationRate = 0,
  escalationType = "percent",
  rentTerms?: RentTerm[] | null,
  prepaidRent = 0,
  customSchedule?: CustomScheduleEntry[] | null,
): InstallmentRow[] {
  const monthly = parseFloat(monthlyRent) || 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rows: InstallmentRow[] = [];

  // ── Custom payment schedule ──────────────────────────────────────────
  // When the cycle is "custom", the rent rows come straight from the
  // user-laid-out list (date + amount each). VAT, when on, is added on top
  // of each entered amount, mirroring the periodic path. Prepaid rent and
  // additional fees are still applied below via a shared exit.
  if (paymentFrequency === "custom" && customSchedule && customSchedule.length > 0) {
    const rentStart = rows.length;
    for (const e of customSchedule) {
      const base = Number(e.amount) || 0;
      if (!e.dueDate || base <= 0) continue;
      const amount = vatEnabled ? base * (1 + VAT_RATE) : base;
      rows.push({
        contractId, userId,
        amount: round2(amount).toFixed(2),
        dueDate: new Date(e.dueDate).toISOString().split("T")[0]!,
        status: "pending",
        description: null,
        isDemo: false,
      });
    }
    applyPrepaid(rows, rentStart, prepaidRent);
    appendFees(rows, contractId, userId, start, end, additionalFees);
    return sortRows(rows);
  }

  let stepMonths = 1;
  if (paymentFrequency === "quarterly") stepMonths = 3;
  else if (paymentFrequency === "semi_annual") stepMonths = 6;
  else if (paymentFrequency === "annual" || paymentFrequency === "yearly") stepMonths = 12;
  // Base annual rent; the per-period figure is a fraction of it.
  const baseAnnual = monthly * 12;
  const periodFrac = stepMonths / 12;
  // 'percent' → compound a rate; 'amount' → add a fixed yearly SAR amount.
  const escRate = escalationType === "amount" ? 0 : (Number(escalationRate) || 0) / 100;
  const escAmountAnnual = escalationType === "amount" ? (Number(escalationRate) || 0) : 0;
  // Per-year overrides — keyed by 1-based contract year.
  const termMap = new Map<number, number>();
  for (const t of rentTerms || []) {
    const y = Number(t.year), a = Number(t.amount);
    if (Number.isFinite(y) && y > 0 && Number.isFinite(a) && a > 0) termMap.set(y, a);
  }

  // Rent rows first (so prepaid can be applied to the earliest ones).
  const rentStart = rows.length;
  const cursor = new Date(start);
  while (cursor <= end) {
    // Contract-year index (0-based) → escalation / per-year overrides.
    const monthsSince = (cursor.getFullYear() - start.getFullYear()) * 12 + (cursor.getMonth() - start.getMonth());
    const year = Math.max(0, Math.floor(monthsSince / 12));
    // An explicit per-year rate wins; otherwise the escalated base rent.
    const annualForYear = termMap.has(year + 1)
      ? termMap.get(year + 1)!
      : baseAnnual * Math.pow(1 + escRate, year) + escAmountAnnual * year;
    let amount = annualForYear * periodFrac;
    if (vatEnabled) amount = amount * (1 + VAT_RATE);
    rows.push({
      contractId, userId,
      amount: round2(amount).toFixed(2),
      dueDate: cursor.toISOString().split("T")[0]!,
      status: "pending",
      description: null,
      isDemo: false,
    });
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }

  applyPrepaid(rows, rentStart, prepaidRent);
  appendFees(rows, contractId, userId, start, end, additionalFees);
  return sortRows(rows);
}

/** Deduct prepaid rent from the earliest rent installment(s), in place. */
function applyPrepaid(rows: InstallmentRow[], rentStart: number, prepaidRent: number) {
  let leftover = round2(Number(prepaidRent) || 0);
  for (let i = rentStart; i < rows.length && leftover > 0; i++) {
    const amt = Number(rows[i]!.amount);
    const ded = Math.min(leftover, amt);
    rows[i]!.amount = round2(amt - ded).toFixed(2);
    leftover = round2(leftover - ded);
  }
}

/** Append additional-fee installments across the contract span, in place. */
function appendFees(
  rows: InstallmentRow[], contractId: number, userId: number,
  start: Date, end: Date, additionalFees?: FeeEntry[] | null,
) {
  if (!additionalFees || additionalFees.length === 0) return;
  const totalMonths = Math.max(1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  );
  const contractYears = Math.max(1, Math.ceil(totalMonths / 12));

  for (const fee of additionalFees) {
    const feeAmt = parseFloat(fee.amount) || 0;
    if (feeAmt <= 0) continue;

    const dates: Date[] = [];

    if (fee.recurrence === "one_time" || fee.recurrence === "once") {
      dates.push(fee.dueDate ? new Date(fee.dueDate) : new Date(start));
    } else if (fee.recurrence === "annual") {
      for (let y = 0; y < contractYears; y++) {
        const d = new Date(start);
        d.setFullYear(d.getFullYear() + y);
        if (d <= end) dates.push(d);
      }
    } else if (fee.recurrence === "semi_annual") {
      let d = new Date(start);
      while (d <= end) { dates.push(new Date(d)); d.setMonth(d.getMonth() + 6); }
    } else if (fee.recurrence === "quarterly") {
      let d = new Date(start);
      while (d <= end) { dates.push(new Date(d)); d.setMonth(d.getMonth() + 3); }
    } else {
      let d = new Date(start);
      while (d <= end) { dates.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
    }

    for (const d of dates) {
      rows.push({
        contractId, userId,
        amount: round2(feeAmt).toFixed(2),
        dueDate: d.toISOString().split("T")[0]!,
        status: "pending",
        description: fee.name,
        isDemo: false,
      });
    }
  }
}

/** Sort by due date, with rent rows (null description) before fee rows. */
function sortRows(rows: InstallmentRow[]): InstallmentRow[] {
  rows.sort((a, b) => {
    const dc = a.dueDate.localeCompare(b.dueDate);
    if (dc !== 0) return dc;
    if (a.description === null && b.description !== null) return -1;
    if (a.description !== null && b.description === null) return 1;
    return 0;
  });
  return rows;
}
