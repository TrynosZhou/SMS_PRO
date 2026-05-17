import { DataSource } from 'typeorm';
import { AcademicTerm } from '../entities/AcademicTerm';
import { termsLooselyMatch } from './termMatch';

export type TermPeriodType = 'regular' | 'vacation' | 'short';

export function formatAcademicTermLabel(term: { termNumber: number; year: number }): string {
  return `Term ${term.termNumber} ${term.year}`;
}

export async function resolveTermPeriodType(
  ds: DataSource,
  termLabel: string
): Promise<TermPeriodType> {
  const label = (termLabel || '').trim();
  if (!label) return 'regular';

  const all = await ds.getRepository(AcademicTerm).find();
  const match = all.find((t) => termsLooselyMatch(label, formatAcademicTermLabel(t)));
  const raw = String(match?.periodType || 'regular')
    .trim()
    .toLowerCase();
  if (raw === 'vacation') return 'vacation';
  if (raw === 'short') return 'short';
  return 'regular';
}

/** Fee catalog / settings labels that belong to vacation school billing. */
const VACATION_FEE_RX =
  /\bvacation\b|\bvac(?:ation)?\s*school\b|\bholiday\s*school\b|\bvac\s*fees?\b/i;

export function isVacationFeeLabel(text: string | null | undefined): boolean {
  return VACATION_FEE_RX.test(String(text || ''));
}

/** Regular and short terms exclude vacation-school fee rows. */
export function shouldIncludeFeeForTermPeriod(
  label: string,
  termPeriodType: TermPeriodType | undefined
): boolean {
  if (termPeriodType === 'vacation') return true;
  return !isVacationFeeLabel(label);
}
