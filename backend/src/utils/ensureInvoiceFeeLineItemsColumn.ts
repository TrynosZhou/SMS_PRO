import { DataSource } from 'typeorm';

/**
 * Adds invoices.feeLineItems when migrations are skipped (matches Invoice entity JSON column).
 * Without this, listing invoices returns 500: column does not exist.
 */
export async function ensureInvoiceFeeLineItemsColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "invoices"
      ADD COLUMN IF NOT EXISTS "feeLineItems" json
    `);
  } catch (e: any) {
    console.warn('[ensureInvoiceFeeLineItemsColumn]', e?.message || e);
  }
}
