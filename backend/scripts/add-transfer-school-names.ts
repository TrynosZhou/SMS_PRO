import { AppDataSource } from '../src/config/database';
import { StudentTransfer } from '../src/entities/StudentTransfer';

/**
 * Script to add fromSchoolName and toSchoolName columns to student_transfers table
 * Run with: npx ts-node scripts/add-transfer-school-names.ts
 */
async function addTransferSchoolNames() {
  try {
    console.log('Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Database connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Check if columns already exist
      const hasFromSchoolName = await queryRunner.hasColumn('student_transfers', 'fromSchoolName');
      const hasToSchoolName = await queryRunner.hasColumn('student_transfers', 'toSchoolName');

      if (hasFromSchoolName && hasToSchoolName) {
        console.log('✓ Columns fromSchoolName and toSchoolName already exist');
        return;
      }

      // Add fromSchoolName column if it doesn't exist
      if (!hasFromSchoolName) {
        console.log('Adding fromSchoolName column...');
        await queryRunner.query(`
          ALTER TABLE "student_transfers" 
          ADD COLUMN "fromSchoolName" character varying
        `);
        console.log('✓ fromSchoolName column added');
      }

      // Add toSchoolName column if it doesn't exist
      if (!hasToSchoolName) {
        console.log('Adding toSchoolName column...');
        await queryRunner.query(`
          ALTER TABLE "student_transfers" 
          ADD COLUMN "toSchoolName" character varying
        `);
        console.log('✓ toSchoolName column added');
      }

      // Update existing external transfers with school names
      console.log('Updating existing external transfers...');
      const { Settings } = await import('../src/entities/Settings');
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });
      const currentSchoolName = settings?.schoolName || 'Current School';

      const transferRepository = AppDataSource.getRepository(StudentTransfer);
      const externalTransfers = await transferRepository.find({
        where: { transferType: 'external' }
      });

      for (const transfer of externalTransfers) {
        if (!transfer.fromSchoolName) {
          transfer.fromSchoolName = currentSchoolName;
        }
        if (!transfer.toSchoolName && transfer.destinationSchool) {
          transfer.toSchoolName = transfer.destinationSchool;
        }
        await transferRepository.save(transfer);
      }

      console.log(`✓ Updated ${externalTransfers.length} external transfer records`);

      console.log('✓ Migration completed successfully');
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('✓ Database connection closed');
  } catch (error: any) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addTransferSchoolNames();

