import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { safeCreateForeignKey } from '../utils/migrationHelpers';

/** Run without a single wrapping transaction so duplicate FK errors can be ignored safely. */
export class CreatePaymentTable1700000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPayments = await queryRunner.hasTable('payments');
    if (!hasPayments) {
      await queryRunner.createTable(
        new Table({
          name: 'payments',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()'
            },
            {
              name: 'invoiceId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'studentId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 10,
              scale: 2,
              isNullable: false
            },
            {
              name: 'paymentMethod',
              type: 'enum',
              enum: ['cash', 'ecocash', 'innbucks', 'visa', 'mastercard', 'bank_transfer'],
              default: "'cash'"
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
              default: "'pending'"
            },
            {
              name: 'transactionId',
              type: 'varchar',
              isNullable: true
            },
            {
              name: 'referenceNumber',
              type: 'varchar',
              isNullable: true
            },
            {
              name: 'paymentDetails',
              type: 'text',
              isNullable: true
            },
            {
              name: 'gatewayResponse',
              type: 'text',
              isNullable: true
            },
            {
              name: 'processedAt',
              type: 'timestamp',
              isNullable: true
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP'
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP'
            }
          ]
        }),
        true
      );
    }

    await safeCreateForeignKey(
      queryRunner,
      'payments',
      new TableForeignKey({
        columnNames: ['invoiceId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'invoices',
        onDelete: 'CASCADE'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'payments',
      new TableForeignKey({
        columnNames: ['studentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'students',
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_INVOICE" ON "payments" ("invoiceId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_STUDENT" ON "payments" ("studentId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_TRANSACTION" ON "payments" ("transactionId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_STATUS" ON "payments" ("status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payments');
  }
}
