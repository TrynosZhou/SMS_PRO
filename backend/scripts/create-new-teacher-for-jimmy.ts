import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Teacher } from '../src/entities/Teacher';
import { generateTeacherId } from '../src/utils/teacherIdGenerator';

async function createTeacherForJimmy() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const teacherRepository = AppDataSource.getRepository(Teacher);

    const jimmyUserId = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4';

    console.log('Generating unique Teacher ID...');
    const teacherId = await generateTeacherId();
    console.log('✓ Generated Teacher ID:', teacherId);

    console.log('\nCreating new teacher profile for jimmy2025...');
    
    const newTeacher = teacherRepository.create({
      firstName: 'Jimmy',
      lastName: 'Teacher',
      teacherId: teacherId,
      phoneNumber: '+263771234567',
      address: 'Harare, Zimbabwe',
      dateOfBirth: new Date('1985-01-15'),
      isActive: true,
      userId: jimmyUserId
    });

    await teacherRepository.save(newTeacher);

    console.log('✓ Successfully created!\n');

    // Verify
    const teacher = await teacherRepository.findOne({
      where: { userId: jimmyUserId },
      relations: ['classes', 'subjects']
    });

    if (teacher) {
      console.log('✅ New Teacher Profile:');
      console.log('======================');
      console.log('ID:', teacher.id);
      console.log('Name:', teacher.firstName, teacher.lastName);
      console.log('Teacher ID:', teacher.teacherId);
      console.log('Phone:', teacher.phoneNumber);
      console.log('Linked to User ID:', teacher.userId);
      console.log('Assigned Classes:', teacher.classes?.length || 0);
      console.log('Assigned Subjects:', teacher.subjects?.length || 0);
    }

    await AppDataSource.destroy();
    console.log('\n✓ Complete! jimmy2025 can now login with:');
    console.log('  Email: jimmy2025');
    console.log('  Password: (your password)');
    console.log(`  Teacher ID: ${teacherId}`);
    console.log('\n⚠️  Note: You need to assign classes to this teacher in the admin panel.');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createTeacherForJimmy();

