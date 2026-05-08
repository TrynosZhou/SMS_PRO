import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { TeacherClass } from '../entities/TeacherClass';

async function checkTeacherClasses() {
  await AppDataSource.initialize();
  
  const teacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { teacherId: 'JPST9397313' }
  });
  
  if (!teacher) {
    console.log('Teacher not found');
    await AppDataSource.destroy();
    return;
  }
  
  console.log('Teacher UUID:', teacher.id);
  console.log('Teacher Name:', teacher.firstName, teacher.lastName);
  
  // Check junction table
  const teacherClasses = await AppDataSource.getRepository(TeacherClass).find({
    where: { teacherId: teacher.id },
    relations: ['class']
  });
  
  console.log('\n=== Junction Table Results ===');
  console.log('Total entries:', teacherClasses.length);
  console.log('\nAll classes:');
  teacherClasses.forEach((tc, idx) => {
    console.log(`  ${idx + 1}. ${tc.class.name} (ID: ${tc.class.id}, Active: ${tc.class.isActive})`);
  });
  
  const activeClasses = teacherClasses.filter(tc => tc.class.isActive === true);
  console.log('\nActive classes only:', activeClasses.length);
  activeClasses.forEach((tc, idx) => {
    console.log(`  ${idx + 1}. ${tc.class.name}`);
  });
  
  // Check with query builder (same as endpoint)
  console.log('\n=== Query Builder Results (with isActive filter) ===');
  const queryResult = await AppDataSource.getRepository(TeacherClass)
    .createQueryBuilder('tc')
    .innerJoinAndSelect('tc.class', 'class')
    .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
    .andWhere('class.isActive = :isActive', { isActive: true })
    .getMany();
  
  console.log('Query builder result count:', queryResult.length);
  queryResult.forEach((tc, idx) => {
    console.log(`  ${idx + 1}. ${tc.class.name}`);
  });
  
  // Check for duplicates
  console.log('\n=== Checking for Duplicates ===');
  const classIds = teacherClasses.map(tc => tc.class.id);
  const uniqueClassIds = [...new Set(classIds)];
  console.log('Total entries:', classIds.length);
  console.log('Unique class IDs:', uniqueClassIds.length);
  
  if (classIds.length !== uniqueClassIds.length) {
    console.log('⚠️ DUPLICATES FOUND!');
    const duplicates = classIds.filter((id, index) => classIds.indexOf(id) !== index);
    console.log('Duplicate class IDs:', [...new Set(duplicates)]);
  }
  
  await AppDataSource.destroy();
}

checkTeacherClasses().catch(console.error);

