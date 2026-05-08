import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHodRoleToUsers1776710000000 implements MigrationInterface {
  /** Enum ALTER + some PG versions disallow `ALTER TYPE ... ADD VALUE` inside a transaction. */
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'hod'
        ) THEN
          ALTER TYPE "users_role_enum" ADD VALUE 'hod';
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support removing enum values safely.
    // Leave 'hod' in place if migration is rolled back.
  }
}

