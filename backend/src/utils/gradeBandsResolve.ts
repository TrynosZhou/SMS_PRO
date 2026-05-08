import { Settings } from '../entities/Settings';

export type GradeBandRow = { minPercent: number; label: string };

const LEGACY_KEYS = ['veryGood', 'good', 'satisfactory', 'needsImprovement', 'basic'] as const;

/** Ordered highest → lowest minPercent. */
export function resolveGradeBands(settings: Settings | null | undefined): GradeBandRow[] {
  const raw = settings?.gradeBands;
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
      return legacyBandsFromThresholds(settings);
    }
    cleaned.sort((a, b) => b.minPercent - a.minPercent);
    return cleaned;
  }
  return legacyBandsFromThresholds(settings);
}

function legacyBandsFromThresholds(settings: Settings | null | undefined): GradeBandRow[] {
  const th = settings?.gradeThresholds || {};
  const gl = settings?.gradeLabels || {};
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

export function getFailLabel(settings: Settings | null | undefined): string {
  const f = settings?.gradeLabels?.fail;
  return (f && String(f).trim()) || 'UNCLASSIFIED';
}

/**
 * Label + key for analytics. Keys stay compatible for the first five bands; extra bands use band5, band6, ...
 */
export function getGradeInfoFromSettings(
  percentage: number | null | undefined,
  settings: Settings | null | undefined
): { key: string; label: string } {
  const fail = getFailLabel(settings);
  if (percentage === null || percentage === undefined || !Number.isFinite(Number(percentage))) {
    return { key: 'fail', label: fail };
  }
  const pct = Number(percentage);
  if (pct === 0) {
    return { key: 'fail', label: fail };
  }
  const bands = resolveGradeBands(settings);
  for (let i = 0; i < bands.length; i++) {
    if (pct >= bands[i].minPercent) {
      const key = i < LEGACY_KEYS.length ? LEGACY_KEYS[i] : `band${i}`;
      return { key, label: bands[i].label };
    }
  }
  return { key: 'fail', label: fail };
}

export function getGradeLabelOnly(
  percentage: number | null | undefined,
  settings: Settings | null | undefined
): string {
  return getGradeInfoFromSettings(percentage, settings).label;
}

/** "Subjects passed" style threshold: same rule as middle legacy band (satisfactory index). */
export function getPassThresholdPercentForMarkSheet(settings: Settings | null | undefined): number {
  const bands = resolveGradeBands(settings);
  if (bands.length === 0) return 40;
  const idx = Math.min(2, bands.length - 1);
  return Math.max(0, Math.min(100, bands[idx]!.minPercent));
}

const LEGACY_KEYS_FOR_POINTS = ['veryGood', 'good', 'satisfactory', 'needsImprovement', 'basic'] as const;

export type StandardGradePoints = {
  excellent?: number;
  veryGood?: number;
  good?: number;
  satisfactory?: number;
  needsImprovement?: number;
  basic?: number;
  fail?: number;
};

export type ResolvedGradePointsDefaults = {
  excellent: number;
  veryGood: number;
  good: number;
  satisfactory: number;
  needsImprovement: number;
  basic: number;
  fail: number;
};

/** Map dynamic grade key (including band5, band6, …) to a legacy gradePoints slot for upper-form totals. */
export function gradeKeyToLegacyPointsKey(gradeKey: string): keyof ResolvedGradePointsDefaults {
  if (gradeKey === 'fail') return 'fail';
  if (gradeKey === 'excellent') return 'excellent';
  const i = LEGACY_KEYS_FOR_POINTS.indexOf(gradeKey as (typeof LEGACY_KEYS_FOR_POINTS)[number]);
  if (i >= 0) return LEGACY_KEYS_FOR_POINTS[i];
  const m = /^band(\d+)$/.exec(gradeKey);
  if (m) {
    const bandIdx = parseInt(m[1], 10);
    const j = Math.min(bandIdx, LEGACY_KEYS_FOR_POINTS.length - 1);
    return LEGACY_KEYS_FOR_POINTS[j];
  }
  return 'fail';
}

export function getGradePointValue(
  gradeKey: string,
  gradePoints: StandardGradePoints | null | undefined,
  defaults: ResolvedGradePointsDefaults
): number {
  const pk = gradeKeyToLegacyPointsKey(gradeKey);
  const raw = gradePoints?.[pk] ?? defaults[pk];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function sanitizeGradeBandsPayload(input: unknown): GradeBandRow[] | null {
  if (!Array.isArray(input)) return null;
  const cleaned = input
    .map((r: any) => ({
      minPercent: Math.round(Number(r?.minPercent)),
      label: String(r?.label ?? '').trim(),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.minPercent) &&
        r.minPercent >= 0 &&
        r.minPercent <= 100 &&
        r.label.length > 0 &&
        r.label.length <= 80
    );
  if (cleaned.length === 0) return null;
  cleaned.sort((a, b) => b.minPercent - a.minPercent);
  for (let i = 0; i < cleaned.length - 1; i++) {
    if (cleaned[i].minPercent <= cleaned[i + 1].minPercent) {
      return null;
    }
  }
  return cleaned;
}

/** Maps the top five bands (after sort desc) onto legacy keys for older code paths. */
export function legacyThresholdsAndLabelsFromBands(
  bands: GradeBandRow[],
  failLabel: string
): {
  gradeThresholds: Record<string, number>;
  gradeLabels: Record<string, string>;
} {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const gradeThresholds: Record<string, number> = {};
  const gradeLabels: Record<string, string> = { fail: failLabel };
  LEGACY_KEYS.forEach((k, i) => {
    if (i < sorted.length) {
      gradeThresholds[k] = sorted[i].minPercent;
      gradeLabels[k] = sorted[i].label;
    }
  });
  return { gradeThresholds, gradeLabels };
}
