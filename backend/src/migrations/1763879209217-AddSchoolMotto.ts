import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolMotto1763879209217 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('settings');
    const column = table?.findColumnByName('schoolMotto');
    
    if (!column) {
      await queryRunner.query(`
        ALTER TABLE "settings" 
        ADD COLUMN "schoolMotto" text
      `);
      console.log('✓ Added schoolMotto column to settings table');
    } else {
      console.log('✓ schoolMotto column already exists');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the column
    await queryRunner.query(`
      ALTER TABLE "settings" 
      DROP COLUMN IF EXISTS "schoolMotto"
    `);
    console.log('✓ Removed schoolMotto column from settings table');
  }
}

