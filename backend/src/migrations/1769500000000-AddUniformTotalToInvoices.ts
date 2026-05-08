import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Ensures invoices.uniformTotal exists (decimal subtotal for school uniform lines).
 * Display logic also sums invoice_uniform_items; this column keeps PDFs and legacy queries consistent.
 */
export class AddUniformTotalToInvoices1769500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('invoices');
    const columnExists = table?.findColumnByName('uniformTotal');

    if (!columnExists) {
      await queryRunner.addColumn(
        'invoices',
        new TableColumn({
          name: 'uniformTotal',
          type: 'decimal',
          precision: 10,
          scale: 2,
          default: '0',
          isNullable: false
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('invoices');
    if (table?.findColumnByName('uniformTotal')) {
      await queryRunner.dropColumn('invoices', 'uniformTotal');
    }
  }
}
