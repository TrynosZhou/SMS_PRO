import { DataSource } from 'typeorm';

/** Ensures settings.schoolMotto2 / schoolMotto3 exist when migrations were not applied (e.g. dev skips migration:run). */
export async function ensureSchoolMottoColumns(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "schoolMotto2" text`);
    await dataSource.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "schoolMotto3" text`);
  } catch (e: any) {
    console.warn('[ensureSchoolMottoColumns]', e?.message || e);
  }
}
