import { AppDataSource } from '../src/config/database';

async function createEnrollmentTable() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    // Check if table already exists
    const tableExists = await queryRunner.hasTable('student_enrollments');
    
    if (tableExists) {
      console.log('✓ student_enrollments table already exists');
      await queryRunner.release();
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log('📋 Creating student_enrollments table...');

    // Create table
    await queryRunner.query(`
      CREATE TABLE "student_enrollments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "enrollmentDate" date NOT NULL,
        "withdrawalDate" date,
        "isActive" boolean NOT NULL DEFAULT true,
        "enrolledByUserId" uuid NOT NULL,
        "withdrawnByUserId" uuid,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_student_enrollments_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_student_enrollments_student_date" 
      ON "student_enrollments"("studentId", "enrollmentDate")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_student_enrollments_class" 
      ON "student_enrollments"("classId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_student_enrollments_active" 
      ON "student_enrollments"("isActive")
    `);

    // Create foreign keys
    await queryRunner.query(`
      ALTER TABLE "student_enrollments" 
      ADD CONSTRAINT "FK_student_enrollments_student" 
      FOREIGN KEY ("studentId") 
      REFERENCES "students"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "student_enrollments" 
      ADD CONSTRAINT "FK_student_enrollments_class" 
      FOREIGN KEY ("classId") 
      REFERENCES "classes"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "student_enrollments" 
      ADD CONSTRAINT "FK_student_enrollments_enrolled_by" 
      FOREIGN KEY ("enrolledByUserId") 
      REFERENCES "users"("id") 
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "student_enrollments" 
      ADD CONSTRAINT "FK_student_enrollments_withdrawn_by" 
      FOREIGN KEY ("withdrawnByUserId") 
      REFERENCES "users"("id") 
      ON DELETE SET NULL
    `);

    // Record migration in migrations table
    await queryRunner.query(`
      INSERT INTO "migrations" ("timestamp", "name") 
      VALUES (1767000000000, 'CreateStudentEnrollmentTable1767000000000')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.release();
    
    console.log('✅ student_enrollments table created successfully!');
    
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

createEnrollmentTable();

