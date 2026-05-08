import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { User } from '../src/entities/User';
import { Teacher } from '../src/entities/Teacher';

async function diagnoseJimmyTeacher() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const userRepository = AppDataSource.getRepository(User);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Find the jimmy2025 user
    const user = await userRepository.findOne({
      where: [
        { email: 'jimmy2025' },
        { username: 'jimmy2025' }
      ],
      relations: ['teacher']
    });

    if (!user) {
      console.log('❌ User jimmy2025 not found!');
      await AppDataSource.destroy();
      process.exit(1);
    }

    console.log('✅ User Found:');
    console.log('================');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Username:', user.username);
    console.log('Role:', user.role);
    console.log('Has teacher relation:', user.teacher ? 'Yes' : 'No');
    
    if (user.teacher) {
      console.log('\nTeacher Profile:');
      console.log('  ID:', user.teacher.id);
      console.log('  Name:', user.teacher.firstName, user.teacher.lastName);
      console.log('  Teacher ID:', user.teacher.teacherId);
    }

    // Find all teachers
    const allTeachers = await teacherRepository.find({
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    console.log('\n\n📋 All Teachers in Database:');
    console.log('============================');
    allTeachers.forEach((teacher, index) => {
      const isLinked = teacher.userId ? '✓' : '✗';
      const isJimmy = teacher.userId === user.id ? '👈 THIS IS JIMMY' : '';
      console.log(`${index + 1}. [${isLinked}] ${teacher.firstName} ${teacher.lastName}`);
      console.log(`   Teacher ID: ${teacher.teacherId}`);
      console.log(`   User ID: ${teacher.userId || 'NOT LINKED'} ${isJimmy}`);
      console.log('');
    });

    // Check if any teacher has a name similar to "Jimmy"
    const possibleMatches = allTeachers.filter(t => 
      t.firstName.toLowerCase().includes('jimmy') || 
      t.lastName.toLowerCase().includes('jimmy') ||
      !t.userId
    );

    if (possibleMatches.length > 0) {
      console.log('\n💡 Possible Teachers to Link:');
      console.log('=============================');
      possibleMatches.forEach((teacher, index) => {
        console.log(`${index + 1}. ${teacher.firstName} ${teacher.lastName} (${teacher.teacherId})`);
        console.log(`   ID: ${teacher.id}`);
        console.log(`   Currently linked to: ${teacher.userId || 'NO USER'}`);
        console.log('');
      });
    }

    console.log('\n📝 To link jimmy2025 to a teacher, run:');
    console.log('=========================================');
    console.log(`UPDATE teachers SET "userId" = '${user.id}' WHERE id = '<TEACHER_ID_FROM_ABOVE>';`);
    console.log('\nOR create a new teacher:');
    console.log(`INSERT INTO teachers (id, "firstName", "lastName", "teacherId", "isActive", "userId")`);
    console.log(`VALUES (gen_random_uuid(), 'Jimmy', 'Teacher', 'JPST' || LPAD(FLOOR(RANDOM() * 10000000)::text, 7, '0'), true, '${user.id}');`);

    await AppDataSource.destroy();
    console.log('\n✓ Diagnosis complete');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Diagnosis failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

diagnoseJimmyTeacher();

