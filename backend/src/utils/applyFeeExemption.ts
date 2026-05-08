import { roundMoney } from './numberUtils';
import type { StudentFeeExemption } from '../entities/StudentFeeExemption';

export type FeeLine = { description: string; amount: number };

/**
 * Managed-fee / settings line descriptions that are fully waived for Finance → **Staff sibling** exemption
 * (no tuition, desk, registration, or enrolment levy).
 */
export const STAFF_SIBLING_WAIVED_FEE_LINE_RX =
  /\b(tuition|desk|registration|enrol|enroll|enrolment|enrollment|school\s*fees?|term\s*fees?)\b/i;

export function lineMatchesStaffSiblingWaivedFee(description: string | null | undefined): boolean {
  return STAFF_SIBLING_WAIVED_FEE_LINE_RX.test(String(description || ''));
}

/**
 * Applies the student's active Finance exemption to managed-fee lines (Manage Fees catalog).
 */
export function applyActiveFeeExemptionToManagedLines(
  lines: FeeLine[],
  total: number,
  exemption: StudentFeeExemption | null | undefined
): { lines: FeeLine[]; total: number } {
  if (!exemption || exemption.isActive === false) {
    return { lines, total };
  }

  const descSuffix = exemption.description?.trim()
    ? ` (${exemption.description.trim()})`
    : '';

  switch (exemption.exemptionType) {
    case 'percentage': {
      const pct = Math.min(100, Math.max(0, Number(exemption.value) || 0));
      const factor = (100 - pct) / 100;
      const newLines = lines.map((l) => ({
        ...l,
        amount: roundMoney(l.amount * factor),
      }));
      return {
        lines: newLines,
        total: roundMoney(newLines.reduce((s, l) => s + l.amount, 0)),
      };
    }
    case 'staff_sibling': {
      const newLines = lines
        .map((l) =>
          lineMatchesStaffSiblingWaivedFee(l.description)
            ? { ...l, amount: 0 }
            : l
        )
        .filter((l) => l.amount > 0.001);
      return {
        lines: newLines,
        total: roundMoney(newLines.reduce((s, l) => s + l.amount, 0)),
      };
    }
    case 'fixed':
    default: {
      const fix = Math.max(0, Number(exemption.value) || 0);
      const sub = Math.min(roundMoney(fix), roundMoney(total));
      if (sub <= 0.001) {
        return { lines, total };
      }
      const newLines: FeeLine[] = [
        ...lines,
        {
          description: `Fee exemption${descSuffix}`,
          amount: roundMoney(-sub),
        },
      ];
      return {
        lines: newLines,
        total: roundMoney(Math.max(0, total - sub)),
      };
    }
  }
}
