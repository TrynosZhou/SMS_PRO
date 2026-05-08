import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Persist line-item breakdown when invoices are built from Finance → Manage → Fees. */
export class AddFeeLineItemsToInvoices1776770000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('invoices');
    if (table?.findColumnByName('feeLineItems')) return;

    await queryRunner.addColumn(
      'invoices',
      new TableColumn({
        name: 'feeLineItems',
        type: 'json',
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('invoices');
    if (table?.findColumnByName('feeLineItems')) {
      await queryRunner.dropColumn('invoices', 'feeLineItems');
    }
  }
}
