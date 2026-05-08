import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeTestMarksToInteger1700450000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change test mark columns from DECIMAL to INTEGER
    for (let i = 1; i <= 10; i++) {
      await queryRunner.query(`
        ALTER TABLE record_books 
        ALTER COLUMN "test${i}" TYPE integer USING ROUND("test${i}")::integer
      `);
    }

    console.log('✓ Changed test mark columns from DECIMAL to INTEGER');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Change back to DECIMAL
    for (let i = 1; i <= 10; i++) {
      await queryRunner.query(`
        ALTER TABLE record_books 
        ALTER COLUMN "test${i}" TYPE decimal(5,2)
      `);
    }

    console.log('✓ Reverted test mark columns back to DECIMAL');
  }
}

