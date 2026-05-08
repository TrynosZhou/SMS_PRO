import { DataSource } from 'typeorm';

/**
 * Drops legacy unique constraints on (teacher|class)+day+period so admins can stack
 * lessons when ignoring collisions. Safe to run every boot (IF EXISTS).
 */
export async function ensureTimetableSlotNoUniqueCollision(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(
      `ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "UQ_timetable_slots_teacher_day_period"`
    );
    await dataSource.query(
      `ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "UQ_timetable_slots_class_day_period"`
    );
    await dataSource.query(
      `CREATE INDEX IF NOT EXISTS "IDX_timetable_slots_ver_teacher_day_period" ON "timetable_slots" ("versionId", "teacherId", "dayOfWeek", "periodNumber")`
    );
    await dataSource.query(
      `CREATE INDEX IF NOT EXISTS "IDX_timetable_slots_ver_class_day_period" ON "timetable_slots" ("versionId", "classId", "dayOfWeek", "periodNumber")`
    );
  } catch (e: any) {
    console.warn('[ensureTimetableSlotNoUniqueCollision]', e?.message || e);
  }
}
