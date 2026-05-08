/**
 * Script to reset demo data to a clean initial state
 * This script should be run nightly via a cron job
 * Usage: 
 *   ts-node scripts/reset-demo-data.ts
 *   or
 *   npm run reset-demo-data
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User, UserRole } from '../src/entities/User';
import { Student } from '../src/entities/Student';
import { Teacher } from '../src/entities/Teacher';
import { Parent } from '../src/entities/Parent';
import { Class } from '../src/entities/Class';
import { Subject } from '../src/entities/Subject';
import { Exam } from '../src/entities/Exam';
import { Marks } from '../src/entities/Marks';
import { Invoice } from '../src/entities/Invoice';
import { Settings } from '../src/entities/Settings';
import bcrypt from 'bcryptjs';

dotenv.config();

async function resetDemoData() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    const demoEmail = 'demo@school.com';

    // Get repositories
    const userRepository = AppDataSource.getRepository(User);
    const studentRepository = AppDataSource.getRepository(Student);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const parentRepository = AppDataSource.getRepository(Parent);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Find demo user
    const demoUser = await userRepository.findOne({
      where: { email: demoEmail, isDemo: true }
    });

    if (!demoUser) {
      console.error('❌ Demo user not found. Please run create-demo script first.');
      await AppDataSource.destroy();
      process.exit(1);
    }

    console.log('🔄 Starting demo data reset...');

    // Step 1: Delete all invoices
    await invoiceRepository.delete({});
    console.log('✓ Deleted all invoices');

    // Step 2: Delete all marks
    await marksRepository.delete({});
    console.log('✓ Deleted all marks');

    // Step 3: Delete all exams
    await examRepository.delete({});
    console.log('✓ Deleted all exams');

    // Step 4: Delete all students (and their associated users if not demo)
    const students = await studentRepository.find({ relations: ['user'] });
    for (const student of students) {
      if (student.user && !student.user.isDemo) {
        await userRepository.remove(student.user);
      }
      await studentRepository.remove(student);
    }
    console.log('✓ Deleted all students');

    // Step 5: Delete all teachers (and their associated users if not demo)
    const teachers = await teacherRepository.find({ relations: ['user'] });
    for (const teacher of teachers) {
      if (teacher.user && !teacher.user.isDemo) {
        await userRepository.remove(teacher.user);
      }
      await teacherRepository.remove(teacher);
    }
    console.log('✓ Deleted all teachers');

    // Step 6: Delete all parents (and their associated users if not demo)
    const parents = await parentRepository.find({ relations: ['user'] });
    for (const parent of parents) {
      if (parent.user && !parent.user.isDemo) {
        await userRepository.remove(parent.user);
      }
      await parentRepository.remove(parent);
    }
    console.log('✓ Deleted all parents');

    // Step 7: Delete all non-demo users (except demo user)
    await userRepository.delete({ isDemo: false });
    console.log('✓ Deleted all non-demo users');

    // Step 8: Delete all classes
    await classRepository.delete({});
    console.log('✓ Deleted all classes');

    // Step 9: Delete all subjects
    await subjectRepository.delete({});
    console.log('✓ Deleted all subjects');

    // Step 10: Reset settings to default (but keep school name as "Demo School")
    const existingSettings = await settingsRepository.findOne({ where: {} });
    if (existingSettings) {
      existingSettings.schoolName = 'Demo School';
      existingSettings.schoolAddress = null;
      existingSettings.schoolPhone = null;
      existingSettings.schoolEmail = null;
      existingSettings.headmasterName = null;
      existingSettings.schoolLogo = null;
      existingSettings.schoolLogo2 = null;
      await settingsRepository.save(existingSettings);
    } else {
      const defaultSettings = settingsRepository.create({
        studentIdPrefix: 'DEMO',
        feesSettings: {
          dayScholarTuitionFee: 0,
          boarderTuitionFee: 0,
          registrationFee: 0,
          deskFee: 0,
          libraryFee: 0,
          sportsFee: 0,
          transportCost: 0,
          diningHallCost: 0,
          otherFees: []
        },
        gradeThresholds: {
          excellent: 90,
          veryGood: 80,
          good: 70,
          satisfactory: 60,
          needsImprovement: 50
        },
        schoolName: 'Demo School',
        academicYear: new Date().getFullYear().toString(),
        currentTerm: `Term 1 ${new Date().getFullYear()}`,
        currencySymbol: 'KES'
      });
      await settingsRepository.save(defaultSettings);
    }
    console.log('✓ Reset settings to default');

    // Step 11: Ensure demo user password is correct
    const hashedPassword = await bcrypt.hash('Demo@123', 10);
    demoUser.password = hashedPassword;
    demoUser.isActive = true;
    demoUser.mustChangePassword = false;
    demoUser.isTemporaryAccount = false;
    await userRepository.save(demoUser);
    console.log('✓ Reset demo user credentials');

    // Step 12: Create sample demo data
    console.log('\n📦 Creating sample demo data...');
    
    // Create sample classes
    const form1Class = classRepository.create({
      name: 'Form 1A',
      form: 'Form 1',
      description: 'Form 1 Class A - Demo',
      isActive: true
    });
    const form2Class = classRepository.create({
      name: 'Form 2A',
      form: 'Form 2',
      description: 'Form 2 Class A - Demo',
      isActive: true
    });
    await classRepository.save([form1Class, form2Class]);
    console.log('✓ Created sample classes');

    // Create sample subjects
    const subjects = [
      { name: 'Mathematics', code: 'MATH001', description: 'Mathematics - Demo' },
      { name: 'English', code: 'ENG001', description: 'English Language - Demo' },
      { name: 'Science', code: 'SCI001', description: 'General Science - Demo' },
      { name: 'Kiswahili', code: 'SWA001', description: 'Kiswahili - Demo' },
      { name: 'Social Studies', code: 'SOC001', description: 'Social Studies - Demo' }
    ];
    const createdSubjects = subjects.map(subj => subjectRepository.create(subj));
    await subjectRepository.save(createdSubjects);
    console.log('✓ Created sample subjects');

    // Create sample teachers
    const teacher1User = userRepository.create({
      email: 'teacher1@demo.school.com',
      username: 'teacher1@demo.school.com',
      password: await bcrypt.hash('Teacher@123', 10),
      role: UserRole.TEACHER,
      isActive: true,
      isDemo: true,
      mustChangePassword: false,
      isTemporaryAccount: false
    });
    await userRepository.save(teacher1User);

    const teacher1 = teacherRepository.create({
      firstName: 'John',
      lastName: 'Doe',
      employeeNumber: 'T001',
      phoneNumber: '+254700000001',
      address: 'Demo Address',
      dateOfBirth: new Date('1980-01-01'),
      isActive: true,
      userId: teacher1User.id
    });
    teacher1.subjects = [createdSubjects[0], createdSubjects[2]]; // Math and Science
    teacher1.classes = [form1Class, form2Class];
    await teacherRepository.save(teacher1);
    console.log('✓ Created sample teachers');

    // Create sample students
    const studentNumbers = ['DEMO001', 'DEMO002', 'DEMO003', 'DEMO004', 'DEMO005'];
    const studentNames = [
      { first: 'Alice', last: 'Smith' },
      { first: 'Bob', last: 'Johnson' },
      { first: 'Charlie', last: 'Williams' },
      { first: 'Diana', last: 'Brown' },
      { first: 'Edward', last: 'Jones' }
    ];

    for (let i = 0; i < studentNumbers.length; i++) {
      const studentUser = userRepository.create({
        email: `student${i + 1}@demo.school.com`,
        username: `student${i + 1}@demo.school.com`,
        password: await bcrypt.hash('Student@123', 10),
        role: UserRole.STUDENT,
        isActive: true,
        isDemo: true,
        mustChangePassword: false,
        isTemporaryAccount: false
      });
      await userRepository.save(studentUser);

      const student = studentRepository.create({
        firstName: studentNames[i].first,
        lastName: studentNames[i].last,
        studentNumber: studentNumbers[i],
        dateOfBirth: new Date(2008 + i, 0, 1),
        gender: i % 2 === 0 ? 'Male' : 'Female',
        address: 'Demo Address',
        phoneNumber: `+2547000000${10 + i}`,
        enrollmentDate: new Date('2024-01-01'),
        studentType: 'Day Scholar',
        usesTransport: false,
        usesDiningHall: false,
        isStaffChild: false,
        isActive: true,
        userId: studentUser.id,
        classId: i < 3 ? form1Class.id : form2Class.id
      });
      await studentRepository.save(student);
    }
    console.log('✓ Created sample students');

    console.log('\n✅ Demo data reset completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Demo account is ready for use:');
    console.log('  Email/Username: demo@school.com');
    console.log('  Password: Demo@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📊 Sample Data Created:');
    console.log('  - 2 Classes (Form 1A, Form 2A)');
    console.log('  - 5 Subjects (Math, English, Science, Kiswahili, Social Studies)');
    console.log('  - 1 Teacher (John Doe)');
    console.log('  - 5 Students (Alice, Bob, Charlie, Diana, Edward)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error resetting demo data:', error.message);
    console.error(error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

resetDemoData();

