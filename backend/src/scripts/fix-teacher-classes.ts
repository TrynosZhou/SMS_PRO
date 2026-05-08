import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { TeacherClass } from '../entities/TeacherClass';
import { User } from '../entities/User';

async function fixTeacherClasses() {
  await AppDataSource.initialize();
  
  const username = 'JPST9397313';
  
  // Find user by username
  const user = await AppDataSource.getRepository(User).findOne({
    where: { username: username }
  });
  
  if (!user) {
    console.log('User not found with username:', username);
    await AppDataSource.destroy();
    return;
  }
  
  console.log('User found:');
  console.log('  User ID:', user.id);
  console.log('  Username:', user.username);
  console.log('  Role:', user.role);
  
  // Find teacher linked to this user
  const teacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { userId: user.id }
  });
  
  if (teacher) {
    console.log('\nTeacher linked to user:');
    console.log('  Teacher UUID:', teacher.id);
    console.log('  TeacherID:', teacher.teacherId);
    console.log('  Name:', teacher.firstName, teacher.lastName);
    
    // Check current classes
    const currentClasses = await AppDataSource.getRepository(TeacherClass).find({
      where: { teacherId: teacher.id },
      relations: ['class']
    });
    
    console.log('\nCurrent classes in junction table:', currentClasses.length);
    currentClasses.forEach((tc, idx) => {
      console.log(`  ${idx + 1}. ${tc.class.name}`);
    });
    
    // Find the correct teacher (Jimmy Makwanda)
    const correctTeacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { teacherId: 'JPST9397313' }
    });
    
    if (correctTeacher && correctTeacher.id !== teacher.id) {
      console.log('\n⚠️ MISMATCH DETECTED!');
      console.log('  User is linked to teacher:', teacher.id, '(' + teacher.firstName + ')');
      console.log('  But correct teacher is:', correctTeacher.id, '(' + correctTeacher.firstName + ')');
      
      // Check correct teacher's classes
      const correctClasses = await AppDataSource.getRepository(TeacherClass).find({
        where: { teacherId: correctTeacher.id },
        relations: ['class']
      });
      
      console.log('\nCorrect teacher has', correctClasses.length, 'classes:');
      correctClasses.forEach((tc, idx) => {
        console.log(`  ${idx + 1}. ${tc.class.name}`);
      });
      
      console.log('\n=== FIX OPTIONS ===');
      console.log('1. Link user to correct teacher (Jimmy Makwanda)');
      console.log('2. Copy classes from correct teacher to current teacher');
      console.log('3. Delete wrong teacher record');
      
      // Option 1: Link user to correct teacher
      if (correctTeacher.userId !== user.id) {
        console.log('\n🔧 Fixing: Linking user to correct teacher...');
        correctTeacher.userId = user.id;
        await AppDataSource.getRepository(Teacher).save(correctTeacher);
        console.log('✓ User linked to correct teacher');
      }
      
      // Option 2: Remove all classes from wrong teacher and copy from correct teacher
      if (currentClasses.length > 2) {
        console.log('\n🔧 Fixing: Removing incorrect class assignments...');
        await AppDataSource.getRepository(TeacherClass).delete({
          teacherId: teacher.id
        });
        console.log('✓ Removed', currentClasses.length, 'incorrect class assignments');
      }
    }
  } else {
    console.log('\nNo teacher linked to user. Finding correct teacher...');
    const correctTeacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { teacherId: 'JPST9397313' }
    });
    
    if (correctTeacher) {
      console.log('Found correct teacher:', correctTeacher.firstName, correctTeacher.lastName);
      console.log('Linking user to correct teacher...');
      correctTeacher.userId = user.id;
      await AppDataSource.getRepository(Teacher).save(correctTeacher);
      console.log('✓ User linked to correct teacher');
    }
  }
  
  await AppDataSource.destroy();
}

fixTeacherClasses().catch(console.error);

