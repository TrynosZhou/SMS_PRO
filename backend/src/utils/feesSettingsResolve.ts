import { parseAmount } from './numberUtils';

/** Normalize DB / API fee settings (handles JSON string edge cases). */
export function normalizeFeesSettingsObject(raw: unknown): Record<string, any> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return null;
}

/**
 * Resolves day-scholar and boarder tuition from fees JSON, including legacy `tuitionFee`
 * and fields that were never migrated because only one of the split keys was present.
 */
export function resolveTuitionFees(fees: any): { dayScholar: number; boarder: number } {
  if (!fees || typeof fees !== 'object') {
    return { dayScholar: 0, boarder: 0 };
  }

  const legacy = parseAmount((fees as any).tuitionFee);
  const rawDay = fees.dayScholarTuitionFee;
  const rawBoarder = fees.boarderTuitionFee;

  let dayScholar = parseAmount(rawDay);
  let boarder = parseAmount(rawBoarder);

  const dayMissing = rawDay === undefined || rawDay === null;
  const boarderMissing = rawBoarder === undefined || rawBoarder === null;

  if (legacy > 0) {
    if (dayMissing && boarderMissing) {
      dayScholar = legacy;
      boarder = legacy;
    } else if (dayMissing) {
      dayScholar = legacy;
    } else if (boarderMissing) {
      boarder = legacy;
    }
  }

  // Split fields present but both 0 while legacy tuitionFee still holds the real amount (common after partial migrations / form defaults).
  if (legacy > 0 && dayScholar === 0 && boarder === 0 && !dayMissing && !boarderMissing) {
    dayScholar = legacy;
    boarder = legacy;
  }

  return { dayScholar, boarder };
}

/** True when student should use boarder tuition from settings (label variations). */
export function isBoarderStudent(studentType: string | undefined | null): boolean {
  const t = String(studentType || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return t === 'boarder' || t === 'board' || t === 'boarding';
}
