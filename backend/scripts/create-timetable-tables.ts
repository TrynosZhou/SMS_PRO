import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function createTimetableTables() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log('\nCreating timetable tables...');

      // Check if tables already exist
      const timetableConfigsExists = await queryRunner.hasTable('timetable_configs');
      const timetableVersionsExists = await queryRunner.hasTable('timetable_versions');
      const timetableSlotsExists = await queryRunner.hasTable('timetable_slots');

      if (timetableConfigsExists && timetableVersionsExists && timetableSlotsExists) {
        console.log('✓ Timetable tables already exist');
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        await AppDataSource.destroy();
        process.exit(0);
      }

      // Create timetable_configs table
      if (!timetableConfigsExists) {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS timetable_configs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            "periodsPerDay" INTEGER DEFAULT 8,
            "schoolStartTime" VARCHAR DEFAULT '08:00',
            "schoolEndTime" VARCHAR DEFAULT '16:00',
            "periodDurationMinutes" INTEGER DEFAULT 40,
            "breakPeriods" JSON,
            "lessonsPerWeek" JSON,
            "daysOfWeek" JSON,
            "additionalPreferences" JSON,
            "isActive" BOOLEAN DEFAULT true,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✓ Created timetable_configs table');
      }

      // Create timetable_versions table
      if (!timetableVersionsExists) {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS timetable_versions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR NOT NULL,
            description TEXT,
            "configId" UUID,
            "isActive" BOOLEAN DEFAULT false,
            "isPublished" BOOLEAN DEFAULT false,
            "createdBy" UUID,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✓ Created timetable_versions table');
      }

      // Create timetable_slots table
      if (!timetableSlotsExists) {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS timetable_slots (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            "versionId" UUID NOT NULL,
            "teacherId" UUID NOT NULL,
            "classId" UUID NOT NULL,
            "subjectId" UUID NOT NULL,
            "dayOfWeek" VARCHAR NOT NULL,
            "periodNumber" INTEGER NOT NULL,
            "startTime" VARCHAR,
            "endTime" VARCHAR,
            room VARCHAR,
            "isBreak" BOOLEAN DEFAULT false,
            "isManuallyEdited" BOOLEAN DEFAULT false,
            "editedAt" TIMESTAMP,
            "editedBy" UUID
          )
        `);
        console.log('✓ Created timetable_slots table');

        // Add foreign keys
        await queryRunner.query(`
          ALTER TABLE timetable_slots
          ADD CONSTRAINT FK_timetable_slots_version
          FOREIGN KEY ("versionId") REFERENCES timetable_versions(id) ON DELETE CASCADE
        `).catch(() => console.log('  (FK for versionId may already exist)'));

        await queryRunner.query(`
          ALTER TABLE timetable_slots
          ADD CONSTRAINT FK_timetable_slots_teacher
          FOREIGN KEY ("teacherId") REFERENCES teachers(id) ON DELETE CASCADE
        `).catch(() => console.log('  (FK for teacherId may already exist)'));

        await queryRunner.query(`
          ALTER TABLE timetable_slots
          ADD CONSTRAINT FK_timetable_slots_class
          FOREIGN KEY ("classId") REFERENCES classes(id) ON DELETE CASCADE
        `).catch(() => console.log('  (FK for classId may already exist)'));

        await queryRunner.query(`
          ALTER TABLE timetable_slots
          ADD CONSTRAINT FK_timetable_slots_subject
          FOREIGN KEY ("subjectId") REFERENCES subjects(id) ON DELETE CASCADE
        `).catch(() => console.log('  (FK for subjectId may already exist)'));

        // Add indexes
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS IDX_timetable_slots_version_day_period
          ON timetable_slots ("versionId", "dayOfWeek", "periodNumber")
        `).catch(() => {});

        // Add unique constraints
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS UQ_timetable_slots_teacher_day_period
          ON timetable_slots ("versionId", "teacherId", "dayOfWeek", "periodNumber")
        `).catch(() => console.log('  (Unique constraint for teacher may already exist)'));

        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS UQ_timetable_slots_class_day_period
          ON timetable_slots ("versionId", "classId", "dayOfWeek", "periodNumber")
        `).catch(() => console.log('  (Unique constraint for class may already exist)'));
      }

      await queryRunner.commitTransaction();
      console.log('\n✅ All timetable tables created successfully!');
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await AppDataSource.destroy();
    console.log('✓ Database connection closed');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error creating timetable tables:');
    console.error('Message:', error.message);
    if (error.query) {
      console.error('Failed query:', error.query);
    }
    process.exit(1);
  }
}

createTimetableTables();

