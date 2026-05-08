import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeEmailNullable1763891100027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique index on email
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email";
    `);

    // Make email column nullable
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
    `);

    // Create a new unique index that allows NULL values (PostgreSQL allows multiple NULLs)
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

