/**
 * Utility function to reset demo data on login
 * This ensures each demo user login gets a clean state
 */

import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Parent } from '../entities/Parent';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Exam } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { Attendance } from '../entities/Attendance';
import { Message } from '../entities/Message';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { DeepPartial } from 'typeorm';
import bcrypt from 'bcryptjs';

export async function resetDemoDataForLogin() {
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
    return; // Demo user doesn't exist, skip reset
  }

  // Delete all non-demo data
  // Delete invoices
  await AppDataSource.getRepository(InvoiceUniformItem).delete({});
  await invoiceRepository.delete({});
  
  // Delete marks
  await marksRepository.delete({});
  
  // Delete exams
  await examRepository.delete({});
  
  // Delete students (and their associated users if not demo)
  const students = await studentRepository.find({ relations: ['user'] });
  for (const student of students) {
    if (student.user && !student.user.isDemo) {
      await userRepository.remove(student.user);
    }
    await studentRepository.remove(student);
  }
  
  // Delete teachers (and their associated users if not demo)
  const teachers = await teacherRepository.find({ relations: ['user'] });
  for (const teacher of teachers) {
    if (teacher.user && !teacher.user.isDemo) {
      await userRepository.remove(teacher.user);
    }
    await teacherRepository.remove(teacher);
  }
  
  // Delete parents (and their associated users if not demo)
  const parents = await parentRepository.find({ relations: ['user'] });
  for (const parent of parents) {
    if (parent.user && !parent.user.isDemo) {
      await userRepository.remove(parent.user);
    }
    await parentRepository.remove(parent);
  }
  
  // Delete all non-demo users (except demo user)
  await userRepository.delete({ isDemo: false });
  
  // Delete classes
  await classRepository.delete({});
  
  // Delete subjects
  await subjectRepository.delete({});

  await AppDataSource.getRepository(Message).delete({});
  await AppDataSource.getRepository(Attendance).delete({});
  await AppDataSource.getRepository(UniformItem).delete({});
  await AppDataSource.getRepository(ReportCardRemarks).delete({});
  
  // Reset settings to default (but keep school name as "Demo School")
  const settingsList = await settingsRepository.find({
    order: { createdAt: 'DESC' },
    take: 1
  });
  const existingSettings = settingsList.length > 0 ? settingsList[0] : null;
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
      currencySymbol: '$'
    });
    await settingsRepository.save(defaultSettings);
  }
  
  // Ensure demo user password is correct
  const hashedPassword = await bcrypt.hash('Demo@123', 10);
  demoUser.password = hashedPassword;
  demoUser.isActive = true;
  demoUser.mustChangePassword = false;
  demoUser.isTemporaryAccount = false;
  await userRepository.save(demoUser);
  
  // Create sample demo data
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
  
  // Create sample subjects
  const subjects = [
    { name: 'Mathematics', code: 'MATH001', shortTitle: 'Math', description: 'Mathematics - Demo' },
    { name: 'English', code: 'ENG001', shortTitle: 'Eng', description: 'English Language - Demo' },
    { name: 'Science', code: 'SCI001', shortTitle: 'Sci', description: 'General Science - Demo' },
    { name: 'Kiswahili', code: 'SWA001', shortTitle: 'Swahili', description: 'Kiswahili - Demo' },
    { name: 'Social Studies', code: 'SOC001', shortTitle: 'SocStud', description: 'Social Studies - Demo' },
  ];
  const createdSubjects = subjects.map(subj => subjectRepository.create(subj));
  await subjectRepository.save(createdSubjects);
  
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
    teacherId: 'T001',
    phoneNumber: '+254700000001',
    address: 'Demo Address',
    dateOfBirth: new Date('1980-01-01'),
    isActive: true,
    userId: teacher1User.id
  });
  teacher1.subjects = [createdSubjects[0], createdSubjects[2]]; // Math and Science
  teacher1.classes = [form1Class, form2Class];
  await teacherRepository.save(teacher1);
  
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
    const studentUserData: DeepPartial<User> = {
      email: `student${i + 1}@demo.school.com`,
      username: `student${i + 1}@demo.school.com`,
      password: await bcrypt.hash('Student@123', 10),
      role: UserRole.STUDENT,
      isActive: true,
      isDemo: true,
      mustChangePassword: false,
      isTemporaryAccount: false
    };
    const studentUser = userRepository.create(studentUserData);
    await userRepository.save(studentUser);
    
    const studentData: DeepPartial<Student> = {
      firstName: studentNames[i].first,
      lastName: studentNames[i].last,
      studentNumber: studentNumbers[i],
      dateOfBirth: new Date(2008 + i, 0, 1),
      gender: i % 2 === 0 ? 'Male' : 'Female',
      address: 'Demo Address',
      phoneNumber: `+2547000000${10 + i}`,
      studentType: 'Day Scholar',
      usesTransport: false,
      usesDiningHall: false,
      isStaffChild: false,
      isActive: true,
      enrollmentStatus: 'Not Enrolled',
      userId: studentUser.id
    };
    const student = studentRepository.create(studentData);
    await studentRepository.save(student);
  }
}

