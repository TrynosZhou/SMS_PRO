import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes e-learning task tables (ETask / submissions). Feature removed from the app.
 */
export class DropETaskTables1776830000000 implements MigrationInterface {
  name = 'DropETaskTables1776830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "e_task_submissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "e_tasks" CASCADE`);
  }

  public async down(): Promise<void> {
    // Intentionally empty: restoring dropped feature would require recreating schema + data.
  }
}
