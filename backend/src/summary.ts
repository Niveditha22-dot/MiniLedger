export interface LoanLike { amount: number; dueDate: Date; repaidAt: Date | null }

export function computeSummary(loans: LoanLike[], now = new Date()) {
  let totalLent = 0, totalRepaid = 0, overdue = 0;
  for (const l of loans) {
    totalLent += l.amount;
    if (l.repaidAt) totalRepaid += l.amount;
    else if (l.dueDate < now) overdue += l.amount;
  }
  return { totalLent, totalRepaid, outstanding: totalLent - totalRepaid, overdue };
}
