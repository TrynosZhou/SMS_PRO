import { DataSource } from 'typeorm';

/** Ensures settings.bankingDetails exists when migrations were not applied (e.g. sync-schema dev DB). */
export async function ensureBankingDetailsColumn(dataSource: DataSource): Promise<void> {
  await dataSource.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "bankingDetails" json`);
}
