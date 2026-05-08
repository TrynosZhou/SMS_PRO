import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsLockedToTimetableSlots1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('timetable_slots');
    if (!table?.findColumnByName('isLocked')) {
      await queryRunner.query(
        `ALTER TABLE "timetable_slots" ADD COLUMN "isLocked" boolean NOT NULL DEFAULT false`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "timetable_slots" DROP COLUMN IF EXISTS "isLocked"`);
  }
}
