import { DataSource } from 'typeorm';

/** Ensures teachers.gender exists (boot-time safety when migrations are not run). */
export async function ensureTeacherGenderColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "gender" character varying(20)
    `);
  } catch (e: any) {
    console.warn('[ensureTeacherGenderColumn]', e?.message || e);
  }
}
