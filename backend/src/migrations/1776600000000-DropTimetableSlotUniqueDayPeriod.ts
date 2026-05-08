import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow multiple timetable_slots with the same (versionId, teacherId, day, period) or
 * (versionId, classId, day, period) when an administrator explicitly ignores collisions
 * (e.g. joint lessons: same teacher with 1 Blue and 1 White in one period).
 */
export class DropTimetableSlotUniqueDayPeriod1776600000000 implements MigrationInterface {
  name = 'DropTimetableSlotUniqueDayPeriod1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "UQ_timetable_slots_teacher_day_period"`
    );
    await queryRunner.query(
      `ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "UQ_timetable_slots_class_day_period"`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_timetable_slots_ver_teacher_day_period" ON "timetable_slots" ("versionId", "teacherId", "dayOfWeek", "periodNumber")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_timetable_slots_ver_class_day_period" ON "timetable_slots" ("versionId", "classId", "dayOfWeek", "periodNumber")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timetable_slots_ver_teacher_day_period"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timetable_slots_ver_class_day_period"`);
    await queryRunner.query(`
      DELETE FROM "timetable_slots" a USING "timetable_slots" b
      WHERE a.id > b.id
        AND a."versionId" = b."versionId"
        AND a."teacherId" = b."teacherId"
        AND a."dayOfWeek" = b."dayOfWeek"
        AND a."periodNumber" = b."periodNumber"
    `);
    await queryRunner.query(`
      DELETE FROM "timetable_slots" a USING "timetable_slots" b
      WHERE a.id > b.id
        AND a."versionId" = b."versionId"
        AND a."classId" = b."classId"
        AND a."dayOfWeek" = b."dayOfWeek"
        AND a."periodNumber" = b."periodNumber"
    `);
    await queryRunner.query(`
      ALTER TABLE "timetable_slots" ADD CONSTRAINT "UQ_timetable_slots_teacher_day_period"
      UNIQUE ("versionId", "teacherId", "dayOfWeek", "periodNumber")
    `);
    await queryRunner.query(`
      ALTER TABLE "timetable_slots" ADD CONSTRAINT "UQ_timetable_slots_class_day_period"
      UNIQUE ("versionId", "classId", "dayOfWeek", "periodNumber")
    `);
  }
}
