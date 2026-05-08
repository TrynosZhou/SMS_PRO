import { DataSource } from 'typeorm';

/** Ensures classes.timeOffGrid exists (boot-time safety when migrations are not run). */
export async function ensureClassTimeOffGridColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "timeOffGrid" json
    `);
  } catch (e: any) {
    console.warn('[ensureClassTimeOffGridColumn]', e?.message || e);
  }
}
