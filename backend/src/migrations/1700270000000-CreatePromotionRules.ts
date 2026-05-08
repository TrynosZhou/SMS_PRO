import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromotionRules1700270000000 implements MigrationInterface {
  name = 'CreatePromotionRules1700270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotion_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fromClassId" uuid NOT NULL,
        "toClassId" uuid,
        "isFinalClass" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotion_rules_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promotion_rules_fromClassId" UNIQUE ("fromClassId"),
        CONSTRAINT "FK_promotion_rules_fromClass" FOREIGN KEY ("fromClassId") 
          REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_promotion_rules_toClass" FOREIGN KEY ("toClassId") 
          REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_promotion_rules_not_same_class" CHECK ("fromClassId" != "toClassId")
      )
    `);

    // Create index on fromClassId (already unique, but explicit)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_promotion_rules_fromClassId" 
      ON "promotion_rules"("fromClassId")
    `);

    // Create index on isActive for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_promotion_rules_isActive" 
      ON "promotion_rules"("isActive")
    `);

    // Seed default promotion rules
    // Note: This will only work if the classes exist. If classes don't exist yet,
    // the seed will be skipped and can be run manually later.
    await seedDefaultPromotionRules(queryRunner);
  }
  
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_promotion_rules_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_promotion_rules_fromClassId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotion_rules"`);
  }
}

async function seedDefaultPromotionRules(queryRunner: QueryRunner): Promise<void> {
  try {
    // Define the default promotion rules
    const defaultRules = [
      { from: 'Stage 2', to: 'Stage 3', isFinal: false },
      { from: 'ECD A', to: 'ECD B', isFinal: false },
      { from: 'ECD B', to: 'Stage 1A', isFinal: false },
      { from: 'Stage 1A', to: 'Stage 1B', isFinal: false },
      { from: 'Stage 1B', to: 'Stage 2', isFinal: false },
      { from: 'Stage 3', to: 'Stage 4', isFinal: false },
      { from: 'Stage 4', to: 'Stage 5', isFinal: false },
      { from: 'Stage 6', to: null, isFinal: true }
    ];

    for (const rule of defaultRules) {
      // Try to find classes by name or form
      const fromClassResult = await queryRunner.query(`
        SELECT id FROM classes 
        WHERE name = $1 OR form = $1 
        LIMIT 1
      `, [rule.from]);

      if (fromClassResult.length === 0) {
        console.log(`Skipping rule ${rule.from} → ${rule.to || 'Completed'}: From class not found`);
        continue;
      }

      const fromClassId = fromClassResult[0].id;
      let toClassId: string | null = null;

      if (rule.to && !rule.isFinal) {
        const toClassResult = await queryRunner.query(`
          SELECT id FROM classes 
          WHERE name = $1 OR form = $1 
          LIMIT 1
        `, [rule.to]);

        if (toClassResult.length > 0) {
          toClassId = toClassResult[0].id;
        } else {
          console.log(`Warning: To class "${rule.to}" not found for rule ${rule.from} → ${rule.to}`);
        }
      }

      // Check if rule already exists
      const existingRule = await queryRunner.query(`
        SELECT id FROM promotion_rules 
        WHERE "fromClassId" = $1
      `, [fromClassId]);

      if (existingRule.length > 0) {
        console.log(`Skipping rule ${rule.from} → ${rule.to || 'Completed'}: Rule already exists`);
        continue;
      }

      // Insert the rule
      await queryRunner.query(`
        INSERT INTO promotion_rules ("fromClassId", "toClassId", "isFinalClass", "isActive")
        VALUES ($1, $2, $3, $4)
      `, [fromClassId, toClassId, rule.isFinal, true]);

      console.log(`Created promotion rule: ${rule.from} → ${rule.to || 'Completed'}`);
    }
  } catch (error: any) {
    console.error('Error seeding default promotion rules:', error);
    // Don't throw - allow migration to complete even if seeding fails
    console.log('Continuing migration despite seeding error...');
  }
}

