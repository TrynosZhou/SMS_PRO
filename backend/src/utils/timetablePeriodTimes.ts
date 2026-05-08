import { TimetableConfig } from '../entities/TimetableConfig';

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Contiguous period times ignoring breaks (legacy behaviour). */
export function calculateNaiveTeachingPeriodSlots(
  config: TimetableConfig
): Array<{ startTime: string; endTime: string }> {
  const slots: Array<{ startTime: string; endTime: string }> = [];
  const startHour = parseInt(config.schoolStartTime.split(':')[0], 10);
  const startMinute = parseInt(config.schoolStartTime.split(':')[1], 10);
  let currentHour = startHour;
  let currentMinute = startMinute;
  const duration = config.periodDurationMinutes || 40;

  for (let i = 0; i < config.periodsPerDay; i++) {
    const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    currentMinute += duration;
    while (currentMinute >= 60) {
      currentMinute -= 60;
      currentHour += 1;
    }
    const endTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    slots.push({ startTime, endTime });
  }
  return slots;
}

/**
 * Matches preview/PDF break-column logic: find which naive period overlaps each configured break,
 * then pause the timeline after the preceding teaching period until break end.
 */
function buildResumeMinutesAfterPeriod(
  config: TimetableConfig,
  naiveSlots: Array<{ startTime: string; endTime: string }>
): Map<number, number> {
  const map = new Map<number, number>();
  if (!config.breakPeriods?.length) {
    return map;
  }

  for (const br of config.breakPeriods) {
    const bs = timeStrToMinutes(br.startTime);
    const be = timeStrToMinutes(br.endTime);
    for (let i = 0; i < naiveSlots.length; i++) {
      const ps = timeStrToMinutes(naiveSlots[i].startTime);
      const pe = timeStrToMinutes(naiveSlots[i].endTime);
      const overlaps =
        (bs >= ps && bs < pe) || (be > ps && be <= pe) || (bs <= ps && be >= pe);
      if (overlaps) {
        const pauseAfterPeriodNumber = i;
        const prev = map.get(pauseAfterPeriodNumber) || 0;
        map.set(pauseAfterPeriodNumber, Math.max(prev, be));
        break;
      }
    }
  }
  return map;
}

/**
 * Wall-clock start/end per teaching period so periods after a break do not overlap break times
 * (fixes headers like Period 5 starting when break starts).
 */
export function calculateTeachingPeriodTimes(
  config: TimetableConfig
): Array<{ startTime: string; endTime: string }> {
  const naive = calculateNaiveTeachingPeriodSlots(config);
  const resumeAfter = buildResumeMinutesAfterPeriod(config, naive);
  const duration = config.periodDurationMinutes || 40;
  let cursor = timeStrToMinutes(config.schoolStartTime);
  const out: Array<{ startTime: string; endTime: string }> = [];

  for (let p = 1; p <= config.periodsPerDay; p++) {
    const startM = cursor;
    const endM = cursor + duration;
    out.push({
      startTime: minutesToTimeStr(startM),
      endTime: minutesToTimeStr(endM),
    });
    cursor = endM;
    const jumpTo = resumeAfter.get(p);
    if (jumpTo != null && jumpTo > cursor) {
      cursor = jumpTo;
    }
  }

  return out;
}

/**
 * 1-based teaching period index `p` where period `p` and `p + 1` are **not** wall-clock contiguous
 * (a configured break sits between them). Double lessons must not use `(p, p+1)` for such `p`.
 */
export function teachingPeriodIndicesFollowedByConfiguredBreak(config: TimetableConfig): Set<number> {
  const times = calculateTeachingPeriodTimes(config);
  const out = new Set<number>();
  const n = config.periodsPerDay || 0;
  for (let p = 1; p < n; p++) {
    const endCur = timeStrToMinutes(times[p - 1].endTime);
    const startNext = timeStrToMinutes(times[p].startTime);
    if (startNext > endCur) {
      out.add(p);
    }
  }
  return out;
}
