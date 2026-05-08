/**
 * Script to create a demo account for testing
 * Usage: 
 *   ts-node scripts/create-demo.ts
 *   or
 *   npm run create-demo
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User, UserRole } from '../src/entities/User';
import { School } from '../src/entities/School';
import bcrypt from 'bcryptjs';

dotenv.config();

async function createDemo() {
  const demoEmail = 'demo@school.com';
  const demoUsername = 'demo@school.com';
  const demoPassword = 'Demo@123';

  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    const userRepository = AppDataSource.getRepository(User);
    const schoolRepository = AppDataSource.getRepository(School);

    // Ensure demo school exists
    let demoSchool = await schoolRepository.findOne({ where: { code: 'demo' } });
    if (!demoSchool) {
      demoSchool = schoolRepository.create({
        name: 'Demo School',
        code: 'demo',
        isActive: true
      });
      await schoolRepository.save(demoSchool);
      console.log('✅ Demo school created with code: demo');
    }

    // Check if demo user already exists
    const existingUser = await userRepository.findOne({
      where: [
        { email: demoEmail },
        { username: demoUsername }
      ]
    });

    if (existingUser) {
      // Update existing user to ensure it's marked as demo
      existingUser.isDemo = true;
      existingUser.role = UserRole.ADMIN;
      existingUser.isActive = true;
      existingUser.mustChangePassword = false;
      existingUser.isTemporaryAccount = false;
      existingUser.schoolId = demoSchool.id;
      
      // Update password in case it was changed
      const hashedPassword = await bcrypt.hash(demoPassword, 10);
      existingUser.password = hashedPassword;
      
      await userRepository.save(existingUser);
      console.log('\n✅ Demo account updated successfully!');
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash(demoPassword, 10);

      // Create demo user
      const demoUser = userRepository.create({
        username: demoUsername,
        email: demoEmail,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isActive: true,
        isDemo: true,
        mustChangePassword: false,
        isTemporaryAccount: false,
        schoolId: demoSchool.id
      });

      await userRepository.save(demoUser);
      console.log('\n✅ Demo account created successfully!');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Demo Account Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email/Username:', demoEmail);
    console.log('Password:', demoPassword);
    console.log('Role: Administrator (Demo)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  Note: This is a demo account.');
    console.log('   - Can access all modules/features');
    console.log('   - Cannot change password');
    console.log('   - Cannot modify system settings');
    console.log('   - School name is always "Demo School"');
    console.log('   - Demo data resets nightly\n');

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating demo account:', error.message);
    if (error.code === '23505') {
      console.error('   Duplicate username or email');
    }
    process.exit(1);
  }
}

createDemo();

