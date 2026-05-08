import { AppDataSource } from '../src/config/database';

async function createTransferTable() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    // Check if table already exists
    const tableExists = await queryRunner.hasTable('student_transfers');
    
    if (tableExists) {
      console.log('✓ student_transfers table already exists');
      await queryRunner.release();
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log('📋 Creating student_transfers table...');

    // Create enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "student_transfers_transfertype_enum" AS ENUM('internal', 'external');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create table
    await queryRunner.query(`
      CREATE TABLE "student_transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "transferType" "student_transfers_transfertype_enum" NOT NULL DEFAULT 'internal',
        "previousClassId" uuid,
        "newClassId" uuid,
        "destinationSchool" character varying,
        "reason" text,
        "transferDate" date NOT NULL,
        "effectiveDate" date,
        "processedByUserId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "notes" text,
        CONSTRAINT "PK_student_transfers_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_student_transfers_student_date" 
      ON "student_transfers"("studentId", "transferDate")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_student_transfers_type" 
      ON "student_transfers"("transferType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_student_transfers_date" 
      ON "student_transfers"("transferDate")
    `);

    // Create foreign keys
    await queryRunner.query(`
      ALTER TABLE "student_transfers" 
      ADD CONSTRAINT "FK_student_transfers_student" 
      FOREIGN KEY ("studentId") 
      REFERENCES "students"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "student_transfers" 
      ADD CONSTRAINT "FK_student_transfers_previous_class" 
      FOREIGN KEY ("previousClassId") 
      REFERENCES "classes"("id") 
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "student_transfers" 
      ADD CONSTRAINT "FK_student_transfers_new_class" 
      FOREIGN KEY ("newClassId") 
      REFERENCES "classes"("id") 
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "student_transfers" 
      ADD CONSTRAINT "FK_student_transfers_processed_by" 
      FOREIGN KEY ("processedByUserId") 
      REFERENCES "users"("id") 
      ON DELETE RESTRICT
    `);

    // Record migration in migrations table
    await queryRunner.query(`
      INSERT INTO "migrations" ("timestamp", "name") 
      VALUES (1766000000000, 'CreateStudentTransferTable1766000000000')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.release();
    
    console.log('✅ student_transfers table created successfully!');
    
    await AppDataSource.destroy();
    console.log('✓ Connection closed');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.query) {
      console.error('Query:', error.query);
    }
    process.exit(1);
  }
}

createTransferTable();

