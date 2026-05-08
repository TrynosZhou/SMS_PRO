import { AppDataSource } from '../src/config/database';
import { User } from '../src/entities/User';
import { School } from '../src/entities/School';
import bcrypt from 'bcryptjs';

async function checkUserLogin() {
  try {
    await AppDataSource.initialize();
    
    const username = process.argv[2] || 'admin123';
    const email = process.argv[3] || 'admin123@gmail.com';
    const schoolCode = process.argv[4] || 'JUNIOR';
    
    console.log('\n🔍 Checking login credentials...\n');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`School Code: ${schoolCode}\n`);
    
    const schoolRepository = AppDataSource.getRepository(School);
    const userRepository = AppDataSource.getRepository(User);
    
    // Check if school exists
    const school = await schoolRepository
      .createQueryBuilder('school')
      .where('LOWER(school.schoolid) = :code', { code: schoolCode.toLowerCase() })
      .getOne();
    
    if (!school) {
      console.log('❌ School not found with schoolid:', schoolCode);
      console.log('\nAvailable schools:');
      const allSchools = await schoolRepository.find();
      allSchools.forEach(s => {
        console.log(`  - ${s.schoolid} (${s.name}) - Active: ${s.isActive}`);
      });
      return;
    }
    
    console.log(`✅ School found: ${school.name} (ID: ${school.id})`);
    console.log(`   School Active: ${school.isActive}\n`);
    
    // Check if user exists
    const user = await userRepository
      .createQueryBuilder('user')
      .where(
        '(LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)) AND user.schoolId = :schoolId',
        { identifier: username, schoolId: school.id }
      )
      .getOne();
    
    if (!user) {
      console.log('❌ User not found with these credentials in this school');
      
      // Check if user exists in any school
      const userAnySchool = await userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)', 
          { identifier: username })
        .getOne();
      
      if (userAnySchool) {
        const userSchool = await schoolRepository.findOne({ where: { id: userAnySchool.schoolId } });
        console.log(`\n⚠️  User exists but belongs to school: ${userSchool?.schoolid || 'unknown'}`);
        console.log(`   User's schoolId: ${userAnySchool.schoolId}`);
        console.log(`   Expected schoolId: ${school.id}`);
      }
      
      console.log('\nUsers in this school:');
      const usersInSchool = await userRepository.find({ where: { schoolId: school.id } });
      usersInSchool.forEach(u => {
        console.log(`  - ${u.username || 'N/A'} / ${u.email} (Role: ${u.role}, Active: ${u.isActive})`);
      });
      
      return;
    }
    
    console.log(`✅ User found: ${user.username || 'N/A'} / ${user.email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   School ID: ${user.schoolId}`);
    console.log(`   Password Hash: ${user.password.substring(0, 20)}...`);
    
    // Test password
    const testPassword = process.argv[5] || 'admin123';
    console.log(`\n🔐 Testing password: ${testPassword}`);
    const passwordMatch = await bcrypt.compare(testPassword, user.password);
    
    if (passwordMatch) {
      console.log('✅ Password matches!');
    } else {
      console.log('❌ Password does NOT match!');
      console.log('\nTo fix, you can:');
      console.log('1. Run: node scripts/hash-password.js <new-password>');
      console.log('2. Update the user password in the database with the new hash');
    }
    
    console.log('\n✅ Login should work if all checks pass!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

checkUserLogin();

