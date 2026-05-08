import { DataSource } from 'typeorm';

/** Ensures settings.gradeBands exists when migrations were not applied (e.g. sync-schema dev DB). */
export async function ensureGradeBandsColumn(dataSource: DataSource): Promise<void> {
  await dataSource.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gradeBands" json`);
}
