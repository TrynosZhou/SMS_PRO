import { DataSource } from 'typeorm';

/**
 * Ensures `e_tasks` exists. The server skips migrations on boot; many deployments
 * never run migrations manually, which caused POST/GET /api/etasks to return 500.
 */
export async function ensureETaskTable(dataSource: DataSource): Promise<void> {
  const q = await dataSource.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'e_tasks'
    ) AS exists
  `);
  if (q?.[0]?.exists) {
    return;
  }

  console.log('[ensureETaskTable] Table e_tasks missing — creating...');

  const createSql = (idDefaultSql: string) => `
    CREATE TABLE IF NOT EXISTS "e_tasks" (
      "id" uuid NOT NULL DEFAULT ${idDefaultSql},
      "title" character varying NOT NULL,
      "description" text,
      "taskType" character varying(20) NOT NULL,
      "teacherId" uuid NOT NULL,
      "classId" uuid NOT NULL,
      "attachmentUrl" character varying,
      "dueDate" date,
      "sentAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_e_tasks_id" PRIMARY KEY ("id")
    )
  `;

  try {
    await dataSource.query(createSql('gen_random_uuid()'));
  } catch (e: any) {
    console.warn('[ensureETaskTable] gen_random_uuid() failed, trying uuid-ossp:', e?.message || e);
    try {
      await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    } catch (extErr: any) {
      console.warn('[ensureETaskTable] uuid-ossp:', extErr?.message || extErr);
    }
    await dataSource.query(createSql('uuid_generate_v4()'));
  }

  await dataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_e_tasks_teacher'
      ) THEN
        ALTER TABLE "e_tasks"
        ADD CONSTRAINT "FK_e_tasks_teacher"
        FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await dataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_e_tasks_class'
      ) THEN
        ALTER TABLE "e_tasks"
        ADD CONSTRAINT "FK_e_tasks_class"
        FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_E_TASKS_CLASS" ON "e_tasks" ("classId");
  `);
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_E_TASKS_TEACHER" ON "e_tasks" ("teacherId");
  `);

  console.log('[ensureETaskTable] ✓ Table e_tasks is ready');
}
