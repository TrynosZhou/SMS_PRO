import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Teacher } from '../src/entities/Teacher';

async function linkJimmyToMakwanda() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const teacherRepository = AppDataSource.getRepository(Teacher);

    const jimmyUserId = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4';
    const jimmyMakwandaId = '6ea98a59-d81d-4177-a5b1-9cdd3a71bf7c';

    console.log('Linking jimmy2025 user to Jimmy Makwanda teacher...');
    
    await teacherRepository.update(jimmyMakwandaId, {
      userId: jimmyUserId
    });

    console.log('✓ Successfully linked!\n');

    // Verify the link
    const teacher = await teacherRepository.findOne({
      where: { id: jimmyMakwandaId },
      relations: ['classes', 'subjects']
    });

    if (teacher) {
      console.log('✅ Verification:');
      console.log('================');
      console.log('Teacher Name:', teacher.firstName, teacher.lastName);
      console.log('Teacher ID:', teacher.teacherId);
      console.log('Linked to User ID:', teacher.userId);
      console.log('Assigned Classes:', teacher.classes?.length || 0);
      console.log('Assigned Subjects:', teacher.subjects?.length || 0);
      
      if (teacher.classes && teacher.classes.length > 0) {
        console.log('\nClasses:');
        teacher.classes.forEach(cls => {
          console.log(`  - ${cls.name}`);
        });
      }
    }

    await AppDataSource.destroy();
    console.log('\n✓ Complete! jimmy2025 can now login with:');
    console.log('  Email: jimmy2025');
    console.log('  Password: (your password)');
    console.log('  Teacher ID: JPST9397313');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

linkJimmyToMakwanda();

