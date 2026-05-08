import { DataSource } from 'typeorm';

/** Ensures teachers.maritalStatus exists (boot-time safety when migrations are not run). */
export async function ensureTeacherMaritalStatusColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "maritalStatus" character varying(30)
    `);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[ensureTeacherMaritalStatusColumn]', msg);
  }
}
