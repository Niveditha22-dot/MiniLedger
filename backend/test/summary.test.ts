import { describe, it, expect } from 'vitest';
import { computeSummary } from '../src/summary';

const now = new Date('2026-10-21');
const d = (s: string) => new Date(s);

describe('computeSummary', () => {
  it('handles empty list', () => {
    expect(computeSummary([], now)).toEqual({ totalLent: 0, totalRepaid: 0, outstanding: 0, overdue: 0 });
  });
  it('totals lent, repaid and overdue', () => {
    const r = computeSummary([
      { amount: 1000, dueDate: d('2026-10-01'), repaidAt: null },
      { amount: 500, dueDate: d('2026-10-01'), repaidAt: d('2026-10-05') },
      { amount: 200, dueDate: d('2026-12-01'), repaidAt: null },
    ], now);
    expect(r).toEqual({ totalLent: 1700, totalRepaid: 500, outstanding: 1200, overdue: 1000 });
  });
  it('repaid loans are never overdue', () => {
    expect(computeSummary([{ amount: 50, dueDate: d('2020-01-01'), repaidAt: d('2020-01-02') }], now).overdue).toBe(0);
  });
});
