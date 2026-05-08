import { DataSource } from 'typeorm';

/**
 * Ensures `e_task_submissions` exists (boot-time safety when migrations are not run).
 */
export async function ensureETaskSubmissionTable(dataSource: DataSource): Promise<void> {
  const q = await dataSource.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'e_task_submissions'
    ) AS exists
  `);
  if (q?.[0]?.exists) {
    return;
  }

  console.log('[ensureETaskSubmissionTable] Table e_task_submissions missing — creating...');

  const createSql = (idDefaultSql: string) => `
    CREATE TABLE IF NOT EXISTS "e_task_submissions" (
      "id" uuid NOT NULL DEFAULT ${idDefaultSql},
      "eTaskId" uuid NOT NULL,
      "studentId" uuid NOT NULL,
      "fileUrl" character varying NOT NULL,
      "note" text,
      "submittedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_e_task_submissions_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_e_task_submissions_task_student" UNIQUE ("eTaskId", "studentId")
    )
  `;

  try {
    await dataSource.query(createSql('gen_random_uuid()'));
  } catch (e: any) {
    console.warn('[ensureETaskSubmissionTable] gen_random_uuid() failed, trying uuid-ossp:', e?.message || e);
    try {
      await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    } catch (extErr: any) {
      console.warn('[ensureETaskSubmissionTable] uuid-ossp:', extErr?.message || extErr);
    }
    await dataSource.query(createSql('uuid_generate_v4()'));
  }

  await dataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_e_task_submissions_task'
      ) THEN
        ALTER TABLE "e_task_submissions"
        ADD CONSTRAINT "FK_e_task_submissions_task"
        FOREIGN KEY ("eTaskId") REFERENCES "e_tasks"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await dataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_e_task_submissions_student'
      ) THEN
        ALTER TABLE "e_task_submissions"
        ADD CONSTRAINT "FK_e_task_submissions_student"
        FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_ETASK_SUB_TASK" ON "e_task_submissions" ("eTaskId");
  `);
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_ETASK_SUB_STUDENT" ON "e_task_submissions" ("studentId");
  `);

  console.log('[ensureETaskSubmissionTable] ✓ Table e_task_submissions is ready');
}
