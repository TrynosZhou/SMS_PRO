import { DataSource } from 'typeorm';

/** Adds attachmentUrl to messages if missing (no-op when column exists). */
export async function ensureMessageAttachmentUrlColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachmentUrl" character varying
    `);
  } catch (e: any) {
    console.warn('[ensureMessageAttachmentUrlColumn]', e?.message || e);
  }
}
