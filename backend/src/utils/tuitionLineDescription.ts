export type TuitionLevelBand = 'O_LEVEL' | 'A_LEVEL' | 'UNKNOWN';

const TUITION_RX = /\btuition\b/i;

export function isTuitionFeeLabel(text: string | null | undefined): boolean {
  return TUITION_RX.test(String(text || ''));
}

/** e.g. Tuition (O Level fees for Term 2 2026) */
export function formatTuitionLineDescription(
  levelBand: TuitionLevelBand,
  termLabel: string
): string {
  const level = levelBand === 'A_LEVEL' ? 'A Level' : 'O Level';
  const term = (termLabel || '').trim();
  if (!term) return `Tuition (${level} fees)`;
  return `Tuition (${level} fees for ${term})`;
}
