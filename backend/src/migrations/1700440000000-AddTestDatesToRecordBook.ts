import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTestDatesToRecordBook1700440000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add date columns for each test (test1Date through test10Date)
    for (let i = 1; i <= 10; i++) {
      const col = `test${i}Date`;
      const has = await queryRunner.hasColumn('record_books', col);
      if (has) continue;
      await queryRunner.addColumn(
        'record_books',
        new TableColumn({
          name: col,
          type: 'date',
          isNullable: true
        })
      );
    }

    console.log('✓ Added test date columns (test1Date through test10Date) to record_books table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove date columns for each test
    for (let i = 1; i <= 10; i++) {
      await queryRunner.dropColumn('record_books', `test${i}Date`);
    }

    console.log('✓ Removed test date columns from record_books table');
  }
}

