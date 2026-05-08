import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { TeacherClass } from '../entities/TeacherClass';
import { User } from '../entities/User';

/**
 * Fix all teacher-user links by matching username with teacherId
 * This applies the same logic used for Jimmy Makwanda to all teachers
 */
async function fixAllTeachers() {
  await AppDataSource.initialize();
  
  console.log('🔍 Starting comprehensive teacher-user link fix...\n');
  
  // Get all users with role='teacher'
  const teacherUsers = await AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .where("user.role = 'teacher'")
    .getMany();
  
  console.log(`Found ${teacherUsers.length} teacher user accounts\n`);
  
  let fixedCount = 0;
  let alreadyCorrectCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  
  for (const user of teacherUsers) {
    try {
      console.log(`\n--- Processing user: ${user.username || user.email} (ID: ${user.id}) ---`);
      
      if (!user.username) {
        console.log('⚠️  User has no username, skipping...');
        notFoundCount++;
        continue;
      }
      
      // Find the correct teacher by matching username with teacherId
      // Prioritize teachers with real names (not placeholders)
      const correctTeacher = await AppDataSource.getRepository(Teacher)
        .createQueryBuilder('teacher')
        .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: user.username })
        .andWhere("teacher.firstName != 'Teacher'")
        .andWhere("teacher.lastName != 'Account'")
        .getOne();
      
      if (!correctTeacher) {
        console.log(`⚠️  No valid teacher found with teacherId matching username: ${user.username}`);
        notFoundCount++;
        continue;
      }
      
      console.log(`✓ Found correct teacher: ${correctTeacher.firstName} ${correctTeacher.lastName}`);
      console.log(`  Teacher ID: ${correctTeacher.teacherId}`);
      console.log(`  Teacher UUID: ${correctTeacher.id}`);
      console.log(`  Current userId: ${correctTeacher.userId || 'NULL'}`);
      
      // Find any teacher currently linked to this user
      const currentLinkedTeacher = await AppDataSource.getRepository(Teacher).findOne({
        where: { userId: user.id }
      });
      
      // Check if user is already linked to the correct teacher
      if (currentLinkedTeacher && currentLinkedTeacher.id === correctTeacher.id) {
        console.log('✓ User is already linked to the correct teacher');
        alreadyCorrectCount++;
        continue;
      }
      
      // If user is linked to a wrong teacher, unlink it
      if (currentLinkedTeacher && currentLinkedTeacher.id !== correctTeacher.id) {
        console.log(`\n⚠️  MISMATCH DETECTED!`);
        console.log(`  User is linked to wrong teacher: ${currentLinkedTeacher.firstName} ${currentLinkedTeacher.lastName}`);
        console.log(`  Should be linked to: ${correctTeacher.firstName} ${correctTeacher.lastName}`);
        
        // Unlink wrong teacher
        console.log('🔧 Unlinking wrong teacher...');
        currentLinkedTeacher.userId = null;
        await AppDataSource.getRepository(Teacher).save(currentLinkedTeacher);
        console.log('✓ Wrong teacher unlinked');
        
        // Remove incorrect class assignments from wrong teacher if it has classes
        const wrongTeacherClasses = await AppDataSource.getRepository(TeacherClass).find({
          where: { teacherId: currentLinkedTeacher.id }
        });
        
        if (wrongTeacherClasses.length > 0) {
          console.log(`🔧 Removing ${wrongTeacherClasses.length} incorrect class assignments from wrong teacher...`);
          await AppDataSource.getRepository(TeacherClass).delete({
            teacherId: currentLinkedTeacher.id
          });
          console.log('✓ Removed incorrect class assignments');
        }
      }
      
      // Link user to correct teacher
      if (correctTeacher.userId !== user.id) {
        console.log('🔧 Linking user to correct teacher...');
        correctTeacher.userId = user.id;
        await AppDataSource.getRepository(Teacher).save(correctTeacher);
        console.log('✓ User linked to correct teacher');
        fixedCount++;
      }
      
      // Verify the link
      const verifyTeacher = await AppDataSource.getRepository(Teacher).findOne({
        where: { userId: user.id },
        relations: ['classes']
      });
      
      if (verifyTeacher) {
        const classCount = await AppDataSource.getRepository(TeacherClass).count({
          where: { teacherId: verifyTeacher.id }
        });
        console.log(`✓ Verification: Teacher ${verifyTeacher.firstName} ${verifyTeacher.lastName} is linked`);
        console.log(`  Classes assigned: ${classCount}`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing user ${user.username || user.email}:`, error);
      errorCount++;
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 FIX SUMMARY');
  console.log('='.repeat(60));
  console.log(`✓ Fixed (linked to correct teacher): ${fixedCount}`);
  console.log(`✓ Already correct: ${alreadyCorrectCount}`);
  console.log(`⚠️  Teacher not found: ${notFoundCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📝 Total processed: ${teacherUsers.length}`);
  console.log('='.repeat(60));
  
  // Final verification: Check for any remaining issues
  console.log('\n🔍 Final verification...\n');
  
  const unlinkedTeachers = await AppDataSource.getRepository(Teacher)
    .createQueryBuilder('teacher')
    .where('teacher.userId IS NULL')
    .andWhere("teacher.firstName != 'Teacher'")
    .andWhere("teacher.lastName != 'Account'")
    .getMany();
  
  if (unlinkedTeachers.length > 0) {
    console.log(`⚠️  Found ${unlinkedTeachers.length} teachers without user links:`);
    unlinkedTeachers.forEach((t, idx) => {
      console.log(`  ${idx + 1}. ${t.firstName} ${t.lastName} (TeacherID: ${t.teacherId})`);
    });
  } else {
    console.log('✓ All valid teachers are linked to user accounts');
  }
  
  const usersWithoutTeachers = await AppDataSource.getRepository(User)
    .createQueryBuilder('user')
    .leftJoin('user.teacher', 'teacher')
    .where("user.role = 'teacher'")
    .andWhere('teacher.id IS NULL')
    .getMany();
  
  if (usersWithoutTeachers.length > 0) {
    console.log(`\n⚠️  Found ${usersWithoutTeachers.length} teacher users without teacher profiles:`);
    usersWithoutTeachers.forEach((u, idx) => {
      console.log(`  ${idx + 1}. ${u.username || u.email} (ID: ${u.id})`);
    });
  } else {
    console.log('\n✓ All teacher users have linked teacher profiles');
  }
  
  await AppDataSource.destroy();
  console.log('\n✅ Fix completed!');
}

// Run the fix
fixAllTeachers().catch(console.error);

