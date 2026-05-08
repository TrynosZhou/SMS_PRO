import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finance → Exemptions: one active exemption per student applies to managed-fee billing.
 */
export class CreateStudentFeeExemptionsTable1776800000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_fee_exemptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "exemptionType" varchar(32) NOT NULL,
        "value" decimal(10,2) NOT NULL DEFAULT 0,
        "description" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_dde0e5f8_student_fee_exemptions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_student_fee_exemptions_studentId"
      ON "student_fee_exemptions" ("studentId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "student_fee_exemptions"
          ADD CONSTRAINT "FK_student_fee_exemptions_student"
          FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "student_fee_exemptions"`);
  }
}
