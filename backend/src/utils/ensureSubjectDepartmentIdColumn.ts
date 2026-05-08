import { DataSource } from 'typeorm';

/**
 * Ensures subjects.departmentId exists (boot-time safety when migrations are not run).
 * FK is optional here; migration adds the named constraint when present.
 */
export async function ensureSubjectDepartmentIdColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "departmentId" uuid NULL
    `);
  } catch (e: any) {
    console.warn('[ensureSubjectDepartmentIdColumn]', e?.message || e);
  }
}
