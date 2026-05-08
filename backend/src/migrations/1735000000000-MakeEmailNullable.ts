import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeEmailNullable1735000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make email column nullable
    await queryRunner.changeColumn(
      'users',
      'email',
      new TableColumn({
        name: 'email',
        type: 'varchar',
        isNullable: true,
      })
    );

    // Update the unique index to allow multiple NULL values
    // Drop the existing unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email";
    `);

    // Create a new unique index that allows NULL values
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") 
      WHERE "email" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the partial unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email";
    `);

    // Recreate the original unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email");
    `);

    // Make email NOT NULL again (this will fail if there are NULL values)
    await queryRunner.changeColumn(
      'users',
      'email',
      new TableColumn({
        name: 'email',
        type: 'varchar',
        isNullable: false,
      })
    );
  }
}

