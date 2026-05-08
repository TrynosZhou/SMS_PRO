import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { TeacherClass } from '../entities/TeacherClass';
import { User } from '../entities/User';

async function fixTeacherIssue() {
  await AppDataSource.initialize();
  
  // Find all users with username containing JPST9397313 (case insensitive)
  const users = await AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .where('LOWER(user.username) = LOWER(:username)', { username: 'JPST9397313' })
    .getMany();
  
  console.log('Users found:', users.length);
  users.forEach((u, idx) => {
    console.log(`  ${idx + 1}. ID: ${u.id}, Username: ${u.username}, Role: ${u.role}`);
  });
  
  if (users.length === 0) {
    console.log('\nNo user found. Checking all teachers...');
    const allTeachers = await AppDataSource.getRepository(Teacher)
      .createQueryBuilder('teacher')
      .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: 'JPST9397313' })
      .getMany();
    
    console.log('Teachers found:', allTeachers.length);
    allTeachers.forEach((t, idx) => {
      console.log(`  ${idx + 1}. UUID: ${t.id}, TeacherID: ${t.teacherId}, Name: ${t.firstName} ${t.lastName}, UserID: ${t.userId || 'NULL'}`);
    });
    
    await AppDataSource.destroy();
    return;
  }
  
  const user = users[0];
  console.log('\nUsing user:', user.username);
  
  // Find teacher linked to this user
  let teacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { userId: user.id }
  });
  
  if (!teacher) {
    console.log('\nNo teacher linked to user. Finding by teacherId...');
    teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { teacherId: user.username }
    });
  }
  
  if (teacher) {
    console.log('\nCurrent teacher linked to user:');
    console.log('  UUID:', teacher.id);
    console.log('  TeacherID:', teacher.teacherId);
    console.log('  Name:', teacher.firstName, teacher.lastName);
    
    const classes = await AppDataSource.getRepository(TeacherClass).find({
      where: { teacherId: teacher.id },
      relations: ['class']
    });
    console.log('  Classes:', classes.length);
  }
  
  // Find the correct teacher (Jimmy Makwanda)
  const correctTeacher = await AppDataSource.getRepository(Teacher)
    .createQueryBuilder('teacher')
    .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: 'JPST9397313' })
    .andWhere("teacher.firstName != 'Teacher'")
    .andWhere("teacher.lastName != 'Account'")
    .getOne();
  
  if (correctTeacher) {
    console.log('\nCorrect teacher (Jimmy Makwanda):');
    console.log('  UUID:', correctTeacher.id);
    console.log('  TeacherID:', correctTeacher.teacherId);
    console.log('  Name:', correctTeacher.firstName, correctTeacher.lastName);
    
    const correctClasses = await AppDataSource.getRepository(TeacherClass).find({
      where: { teacherId: correctTeacher.id },
      relations: ['class']
    });
    console.log('  Classes:', correctClasses.length);
    correctClasses.forEach((tc, idx) => {
      console.log(`    ${idx + 1}. ${tc.class.name}`);
    });
    
    // Fix: Link user to correct teacher
    if (correctTeacher.userId !== user.id) {
      console.log('\n🔧 FIXING: Linking user to correct teacher...');
      correctTeacher.userId = user.id;
      await AppDataSource.getRepository(Teacher).save(correctTeacher);
      console.log('✓ User linked to correct teacher');
    }
    
    // Fix: Remove classes from wrong teacher if it exists
    if (teacher && teacher.id !== correctTeacher.id) {
      const wrongClasses = await AppDataSource.getRepository(TeacherClass).find({
        where: { teacherId: teacher.id }
      });
      
      if (wrongClasses.length > 0) {
        console.log(`\n🔧 FIXING: Removing ${wrongClasses.length} incorrect class assignments from wrong teacher...`);
        await AppDataSource.getRepository(TeacherClass).delete({
          teacherId: teacher.id
        });
        console.log('✓ Removed incorrect class assignments');
      }
    }
  }
  
  await AppDataSource.destroy();
}

fixTeacherIssue().catch(console.error);

