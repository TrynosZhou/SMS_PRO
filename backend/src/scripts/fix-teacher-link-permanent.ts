import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { User } from '../entities/User';

async function fixTeacherLinkPermanent() {
  await AppDataSource.initialize();
  
  // Find user by username (case insensitive)
  const user = await AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .where('LOWER(user.username) = LOWER(:username)', { username: 'JPST9397313' })
    .getOne();
  
  if (!user) {
    console.log('User not found');
    await AppDataSource.destroy();
    return;
  }
  
  console.log('User found:', user.username, 'ID:', user.id);
  
  // Find the correct teacher (Jimmy Makwanda)
  const correctTeacher = await AppDataSource.getRepository(Teacher)
    .createQueryBuilder('teacher')
    .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: 'JPST9397313' })
    .andWhere("teacher.firstName != 'Teacher'")
    .andWhere("teacher.lastName != 'Account'")
    .getOne();
  
  if (!correctTeacher) {
    console.log('Correct teacher not found');
    await AppDataSource.destroy();
    return;
  }
  
  console.log('Correct teacher found:', correctTeacher.firstName, correctTeacher.lastName);
  console.log('  UUID:', correctTeacher.id);
  console.log('  Current userId:', correctTeacher.userId);
  
  // Find wrong teacher (if any)
  const wrongTeacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { userId: user.id }
  });
  
  if (wrongTeacher && wrongTeacher.id !== correctTeacher.id) {
    console.log('\n⚠️ Wrong teacher linked to user:');
    console.log('  UUID:', wrongTeacher.id);
    console.log('  Name:', wrongTeacher.firstName, wrongTeacher.lastName);
    console.log('\n🔧 Unlinking wrong teacher...');
    wrongTeacher.userId = null;
    await AppDataSource.getRepository(Teacher).save(wrongTeacher);
    console.log('✓ Wrong teacher unlinked');
  }
  
  // Link user to correct teacher
  if (correctTeacher.userId !== user.id) {
    console.log('\n🔧 Linking user to correct teacher...');
    correctTeacher.userId = user.id;
    await AppDataSource.getRepository(Teacher).save(correctTeacher);
    console.log('✓ User linked to correct teacher');
  } else {
    console.log('\n✓ User is already linked to correct teacher');
  }
  
  // Verify
  const verifyTeacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { userId: user.id }
  });
  
  if (verifyTeacher) {
    console.log('\n✓ Verification:');
    console.log('  Teacher UUID:', verifyTeacher.id);
    console.log('  Teacher Name:', verifyTeacher.firstName, verifyTeacher.lastName);
    console.log('  TeacherID:', verifyTeacher.teacherId);
  }
  
  await AppDataSource.destroy();
}

fixTeacherLinkPermanent().catch(console.error);

