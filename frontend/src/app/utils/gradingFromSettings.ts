/**
 * Client-side grading resolution — mirrors backend `gradeBandsResolve.ts`
 * so UI matches Academic Settings → Grading and report generation.
 */

export type GradeBandRow = { minPercent: number; label: string };

const LEGACY_KEYS = ['veryGood', 'good', 'satisfactory', 'needsImprovement', 'basic'] as const;

function legacyBandsFromThresholds(row: any): GradeBandRow[] {
  const th = row?.gradeThresholds || {};
  const gl = row?.gradeLabels || {};
  const rows: GradeBandRow[] = [
    {
      minPercent: Number(th.veryGood ?? 80),
      label: String(gl.veryGood || 'VERY HIGH').trim() || 'VERY HIGH',
    },
    {
      minPercent: Number(th.good ?? 60),
      label: String(gl.good || 'HIGH').trim() || 'HIGH',
    },
    {
      minPercent: Number(th.satisfactory ?? 40),
      label: String(gl.satisfactory || 'GOOD').trim() || 'GOOD',
    },
    {
      minPercent: Number(th.needsImprovement ?? 20),
      label: String(gl.needsImprovement || 'ASPIRING').trim() || 'ASPIRING',
    },
    {
      minPercent: Number(th.basic ?? 1),
      label: String(gl.basic || 'BASIC').trim() || 'BASIC',
    },
  ];
  for (const r of rows) {
    if (!Number.isFinite(r.minPercent)) r.minPercent = 0;
    r.minPercent = Math.max(0, Math.min(100, Math.round(r.minPercent)));
  }
  rows.sort((a, b) => b.minPercent - a.minPercent);
  return rows;
}

/** Ordered highest → lowest minPercent. */
export function resolveGradeBandsFromSettingsRow(row: any | null | undefined): GradeBandRow[] {
  if (!row || typeof row !== 'object') {
    return legacyBandsFromThresholds({});
  }
  const raw = row.gradeBands;
  if (Array.isArray(raw) && raw.length > 0) {
    const cleaned = raw
      .map((r: any) => ({
        minPercent: Math.round(Number(r?.minPercent)),
        label: String(r?.label ?? '').trim(),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.minPercent) &&
          r.minPercent >= 0 &&
          r.minPercent <= 100 &&
          r.label.length > 0
      );
    if (cleaned.length === 0) {
      return legacyBandsFromThresholds(row);
    }
    cleaned.sort((a, b) => b.minPercent - a.minPercent);
    return cleaned;
  }
  return legacyBandsFromThresholds(row);
}

export function getFailLabelFromSettingsRow(row: any | null | undefined): string {
  const f = row?.gradeLabels?.fail;
  return (f && String(f).trim()) || 'UNCLASSIFIED';
}

export function getGradeInfoFromSettingsRow(
  percentage: number | null | undefined,
  row: any | null | undefined
): { key: string; label: string } {
  const fail = getFailLabelFromSettingsRow(row);
  if (percentage === null || percentage === undefined || !Number.isFinite(Number(percentage))) {
    return { key: 'fail', label: fail };
  }
  const pct = Number(percentage);
  if (pct === 0) {
    return { key: 'fail', label: fail };
  }
  const bands = resolveGradeBandsFromSettingsRow(row);
  for (let i = 0; i < bands.length; i++) {
    if (pct >= bands[i].minPercent) {
      const key = i < LEGACY_KEYS.length ? LEGACY_KEYS[i] : `band${i}`;
      return { key, label: bands[i].label };
    }
  }
  return { key: 'fail', label: fail };
}

/** Raw score on [0, maxScore] → percentage 0–100 for grading resolution. */
export function scoreToPercent(score: number, maxScore: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return null;
  return (score / maxScore) * 100;
}
