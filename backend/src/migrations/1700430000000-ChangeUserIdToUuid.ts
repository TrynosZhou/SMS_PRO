import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeUserIdToUuid1700430000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change userId column type from VARCHAR to UUID in teachers table
    await queryRunner.query(`
      ALTER TABLE teachers 
      ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid
    `);

    console.log('✓ Changed teachers.userId from VARCHAR to UUID');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Change back to VARCHAR
    await queryRunner.query(`
      ALTER TABLE teachers 
      ALTER COLUMN "userId" TYPE character varying USING "userId"::character varying
    `);

    console.log('✓ Reverted teachers.userId back to VARCHAR');
  }
}

