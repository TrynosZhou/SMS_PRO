import { AppDataSource } from '../config/database';
import { TimetableConfig } from '../entities/TimetableConfig';

const MIN_LPW = 1;
const MAX_LPW = 50;

/**
 * Merge one subject's lessons-per-week into the active timetable config (same store as /timetable/manage/config).
 */
export async function mergeSubjectLessonsPerWeekForActiveConfig(
  subjectId: string,
  lessonsPerWeek: number
): Promise<TimetableConfig> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const repo = AppDataSource.getRepository(TimetableConfig);
  let config = await repo.findOne({ where: { isActive: true } });

  if (!config) {
    config = repo.create({
      periodsPerDay: 8,
      schoolStartTime: '08:00',
      schoolEndTime: '16:00',
      periodDurationMinutes: 40,
      breakPeriods: [],
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      lessonsPerWeek: {},
      additionalPreferences: {},
      isActive: true,
    });
  }

  const n = Number(lessonsPerWeek);
  const v = Number.isFinite(n) ? Math.round(n) : 3;
  const clamped = Math.max(MIN_LPW, Math.min(MAX_LPW, v || 3));

  const prev =
    config.lessonsPerWeek && typeof config.lessonsPerWeek === 'object'
      ? { ...(config.lessonsPerWeek as Record<string, number>) }
      : {};

  prev[String(subjectId)] = clamped;
  config.lessonsPerWeek = prev as any;

  await repo.save(config);
  return config;
}
