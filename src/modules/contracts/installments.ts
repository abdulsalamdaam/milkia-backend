export type FeeEntry = { id: string; name: string; amount: string; recurrence: string; dueDate: string; paymentMethod: string };
export type InstallmentRow = { contractId: number; userId: number; amount: string; dueDate: string; status: "pending"; description: string | null; isDemo: boolean };

export function buildInstallments(
  contractId: number,
  userId: number,
  startDate: string,
  endDate: string,
  monthlyRent: string,
  paymentFrequency: string,
  additionalFees?: FeeEntry[] | null,
): InstallmentRow[] {
  const monthly = parseFloat(monthlyRent) || 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rows: InstallmentRow[] = [];

  let stepMonths = 1;
  let rentAmount = monthly;
  if (paymentFrequency === "quarterly") { stepMonths = 3; rentAmount = monthly * 3; }
  else if (paymentFrequency === "semi_annual") { stepMonths = 6; rentAmount = monthly * 6; }
  else if (paymentFrequency === "annual" || paymentFrequency === "yearly") { stepMonths = 12; rentAmount = monthly * 12; }

  let cursor = new Date(start);
  while (cursor <= end) {
    rows.push({
      contractId, userId,
      amount: rentAmount.toFixed(2),
      dueDate: cursor.toISOString().split("T")[0]!,
      status: "pending",
      description: null,
      isDemo: false,
    });
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }

  if (additionalFees && additionalFees.length > 0) {
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
          amount: feeAmt.toFixed(2),
          dueDate: d.toISOString().split("T")[0]!,
          status: "pending",
          description: fee.name,
          isDemo: false,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const dc = a.dueDate.localeCompare(b.dueDate);
    if (dc !== 0) return dc;
    if (a.description === null && b.description !== null) return -1;
    if (a.description !== null && b.description === null) return 1;
    return 0;
  });

  return rows;
}
