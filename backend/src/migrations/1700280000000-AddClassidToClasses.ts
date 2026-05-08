import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassidToClasses1700280000000 implements MigrationInterface {
  name = 'AddClassidToClasses1700280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add classid column (nullable initially to allow existing records)
    await queryRunner.query(`
      ALTER TABLE "classes" 
      ADD COLUMN IF NOT EXISTS "classid" character varying(50)
    `);

    // Generate classid for existing classes based on name or form
    // This will create a unique identifier from the class name/form
    // First, generate base classids
    await queryRunner.query(`
      UPDATE "classes" 
      SET "classid" = UPPER(REGEXP_REPLACE(
        COALESCE("name", "form", 'CLASS' || "id"::text),
        '[^A-Z0-9]', '', 'g'
      ))
      WHERE "classid" IS NULL
    `);

    // Handle duplicates by appending a unique suffix
    // This query will find duplicates and append a number to make them unique
    await queryRunner.query(`
      WITH duplicates AS (
        SELECT id, classid, 
               ROW_NUMBER() OVER (PARTITION BY classid ORDER BY id) as rn
        FROM "classes"
        WHERE classid IN (
          SELECT classid 
          FROM "classes" 
          GROUP BY classid 
          HAVING COUNT(*) > 1
        )
      )
      UPDATE "classes" c
      SET classid = c.classid || CASE 
        WHEN d.rn > 1 THEN d.rn::text 
        ELSE '' 
      END
      FROM duplicates d
      WHERE c.id = d.id AND d.rn > 1
    `);

    // Make classid unique
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_classes_classid" 
      ON "classes"("classid")
    `);

    // Add NOT NULL constraint after populating all records
    await queryRunner.query(`
      ALTER TABLE "classes" 
      ALTER COLUMN "classid" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_classes_classid"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "classid"`);
  }
}

