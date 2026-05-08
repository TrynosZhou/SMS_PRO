import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';

async function testTeacherResponse() {
  await AppDataSource.initialize();
  
  const teacher = await AppDataSource.getRepository(Teacher).findOne({
    where: { teacherId: 'JPST9397313' }
  });
  
  if (!teacher) {
    console.log('Teacher not found');
    await AppDataSource.destroy();
    return;
  }
  
  // Simulate what getCurrentTeacher returns
  const teacherResponse: any = {
    ...teacher,
    fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher'
  };
  
  console.log('Teacher Response Object:');
  console.log(JSON.stringify(teacherResponse, null, 2));
  console.log('\nFullName:', teacherResponse.fullName);
  console.log('FirstName:', teacherResponse.firstName);
  console.log('LastName:', teacherResponse.lastName);
  
  await AppDataSource.destroy();
}

testTeacherResponse().catch(console.error);

