import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveClassidFromClasses1700290000000 implements MigrationInterface {
  name = 'RemoveClassidFromClasses1700290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique index on classid
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_classes_classid"
    `);

    // Drop the classid column
    await queryRunner.query(`
      ALTER TABLE "classes" 
      DROP COLUMN IF EXISTS "classid"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add classid column (nullable initially)
    await queryRunner.query(`
      ALTER TABLE "classes" 
      ADD COLUMN IF NOT EXISTS "classid" character varying(50)
    `);

    // Generate classid for existing classes
    await queryRunner.query(`
      UPDATE "classes" 
      SET "classid" = UPPER(REGEXP_REPLACE(
        COALESCE("name", "form", 'CLASS' || "id"::text),
        '[^A-Z0-9]', '', 'g'
      ))
      WHERE "classid" IS NULL
    `);

    // Handle duplicates
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

    // Create unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_classes_classid" 
      ON "classes"("classid")
    `);

    // Set NOT NULL
    await queryRunner.query(`
      ALTER TABLE "classes" 
      ALTER COLUMN "classid" SET NOT NULL
    `);
  }
}

