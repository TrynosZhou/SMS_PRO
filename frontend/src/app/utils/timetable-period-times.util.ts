import { TimetableConfig } from '../services/timetable.service';

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function calculateNaiveTeachingPeriodSlots(config: TimetableConfig): Array<{ startTime: string; endTime: string }> {
  const slots: Array<{ startTime: string; endTime: string }> = [];
  const startMinutes = timeStrToMinutes(config.schoolStartTime);
  const periodDuration = config.periodDurationMinutes || 40;
  for (let i = 0; i < config.periodsPerDay; i++) {
    const slotStart = startMinutes + i * periodDuration;
    const slotEnd = slotStart + periodDuration;
    slots.push({
      startTime: minutesToTimeStr(slotStart),
      endTime: minutesToTimeStr(slotEnd),
    });
  }
  return slots;
}

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

/** Align with backend `calculateTeachingPeriodTimes` (break-aware headers). */
export function calculateTeachingPeriodTimesFromConfig(
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
