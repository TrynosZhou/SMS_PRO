import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { TeacherClass } from '../entities/TeacherClass';

async function checkTeacherByUUID() {
  await AppDataSource.initialize();
  
  const uuidFromConsole = '9a05a891-792b-4f0a-8ab0-c528dbca318e';
  
  // Check if this UUID exists
  const teacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { id: uuidFromConsole }
  });
  
  if (teacher) {
    console.log('Found teacher with UUID from console:');
    console.log('  UUID:', teacher.id);
    console.log('  TeacherID:', teacher.teacherId);
    console.log('  Name:', teacher.firstName, teacher.lastName);
    
    // Check junction table
    const teacherClasses = await AppDataSource.getRepository(TeacherClass).find({
      where: { teacherId: teacher.id },
      relations: ['class']
    });
    
    console.log('\nJunction table entries:', teacherClasses.length);
    teacherClasses.forEach((tc, idx) => {
      console.log(`  ${idx + 1}. ${tc.class.name} (Active: ${tc.class.isActive})`);
    });
  } else {
    console.log('No teacher found with UUID:', uuidFromConsole);
    
    // Check all teachers with teacherId JPST9397313
    const allTeachers = await AppDataSource.getRepository(Teacher).find({
      where: { teacherId: 'JPST9397313' }
    });
    
    console.log('\nAll teachers with teacherId JPST9397313:');
    allTeachers.forEach((t, idx) => {
      console.log(`  ${idx + 1}. UUID: ${t.id}, Name: ${t.firstName} ${t.lastName}`);
    });
  }
  
  // Also check the correct teacher
  console.log('\n=== Correct Teacher (by teacherId) ===');
  const correctTeacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { teacherId: 'JPST9397313' }
  });
  
  if (correctTeacher) {
    console.log('  UUID:', correctTeacher.id);
    console.log('  Name:', correctTeacher.firstName, correctTeacher.lastName);
    
    const classes = await AppDataSource.getRepository(TeacherClass).find({
      where: { teacherId: correctTeacher.id },
      relations: ['class']
    });
    console.log('  Classes:', classes.length);
  }
  
  await AppDataSource.destroy();
}

checkTeacherByUUID().catch(console.error);

