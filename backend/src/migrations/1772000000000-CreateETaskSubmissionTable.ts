import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateETaskSubmissionTable1772000000000 implements MigrationInterface {
  name = 'CreateETaskSubmissionTable1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "e_task_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "eTaskId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "fileUrl" character varying NOT NULL,
        "note" text,
        "submittedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_e_task_submissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_e_task_submissions_task_student" UNIQUE ("eTaskId", "studentId")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class r ON c.conrelid = r.oid
          JOIN pg_namespace n ON r.relnamespace = n.oid
          WHERE n.nspname = 'public' AND r.relname = 'e_task_submissions' AND c.conname = 'FK_e_task_submissions_task'
        ) THEN
          ALTER TABLE "e_task_submissions"
          ADD CONSTRAINT "FK_e_task_submissions_task"
          FOREIGN KEY ("eTaskId") REFERENCES "e_tasks"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class r ON c.conrelid = r.oid
          JOIN pg_namespace n ON r.relnamespace = n.oid
          WHERE n.nspname = 'public' AND r.relname = 'e_task_submissions' AND c.conname = 'FK_e_task_submissions_student'
        ) THEN
          ALTER TABLE "e_task_submissions"
          ADD CONSTRAINT "FK_e_task_submissions_student"
          FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ETASK_SUB_TASK" ON "e_task_submissions" ("eTaskId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ETASK_SUB_STUDENT" ON "e_task_submissions" ("studentId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('e_task_submissions');
  }
}
