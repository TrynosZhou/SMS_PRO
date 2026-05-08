import { DataSource } from 'typeorm';

/** Ensures subjects.shortTitle exists (boot-time safety when migrations are not run). */
export async function ensureSubjectShortTitleColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "shortTitle" character varying(40)
    `);
  } catch (e: any) {
    console.warn('[ensureSubjectShortTitleColumn]', e?.message || e);
  }
}
