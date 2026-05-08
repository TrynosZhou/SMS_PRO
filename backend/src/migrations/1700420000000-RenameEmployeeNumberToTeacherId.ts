import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEmployeeNumberToTeacherId1700420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only rename if employeeNumber exists and teacherId does not.
    const employeeRows = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'teachers'
        AND column_name = 'employeeNumber'
      LIMIT 1
    `);

    const teacherIdRows = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'teachers'
        AND column_name = 'teacherId'
      LIMIT 1
    `);

    const hasEmployeeNumber = Array.isArray(employeeRows) && employeeRows.length > 0;
    const hasTeacherId = Array.isArray(teacherIdRows) && teacherIdRows.length > 0;

    if (!hasEmployeeNumber || hasTeacherId) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE teachers
      RENAME COLUMN "employeeNumber" TO "teacherId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Rename back to employeeNumber
    await queryRunner.query(`
      ALTER TABLE teachers 
      RENAME COLUMN "teacherId" TO "employeeNumber"
    `);

    console.log('✓ Reverted teacherId back to employeeNumber');
  }
}

