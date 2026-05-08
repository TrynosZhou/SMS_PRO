import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultModuleAccess1700460000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if settings table has any records
    const settings = await queryRunner.query(`SELECT * FROM settings LIMIT 1`);
    
    const defaultModuleAccess = {
      teachers: {
        students: true,
        classes: true,
        subjects: true,
        exams: true,
        reportCards: true,
        rankings: true,
        finance: false, // Teachers cannot access finance by default
        settings: false,
        recordBook: true,
        attendance: true
      },
      parents: {
        reportCards: true,
        invoices: true,
        dashboard: true
      },
      accountant: {
        students: true,
        invoices: true,
        finance: true,
        dashboard: true,
        settings: false
      },
      admin: {
        students: true,
        teachers: true,
        classes: true,
        subjects: true,
        exams: true,
        reportCards: true,
        rankings: true,
        finance: true,
        attendance: true,
        settings: true,
        dashboard: true
      },
      demo_user: {
        dashboard: true,
        students: true,
        teachers: true,
        classes: true,
        subjects: true,
        exams: true,
        reportCards: true,
        rankings: true,
        finance: true,
        attendance: true,
        settings: false
      }
    };

    if (settings && settings.length > 0) {
      // Update existing settings record
      await queryRunner.query(
        `UPDATE settings SET "moduleAccess" = $1 WHERE "moduleAccess" IS NULL`,
        [JSON.stringify(defaultModuleAccess)]
      );
      console.log('✓ Added default module access to existing settings');
    } else {
      // Create new settings record with default module access
      await queryRunner.query(
        `INSERT INTO settings ("studentIdPrefix", "currencySymbol", "moduleAccess", "createdAt", "updatedAt") 
         VALUES ('JPS', 'KES', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [JSON.stringify(defaultModuleAccess)]
      );
      console.log('✓ Created settings record with default module access');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove module access settings
    await queryRunner.query(`UPDATE settings SET "moduleAccess" = NULL`);
    console.log('✓ Removed module access settings');
  }
}

