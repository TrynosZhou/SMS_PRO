/**
 * Script to create an administrator account
 * Usage: 
 *   ts-node scripts/create-admin.ts <username> <password> <email>
 *   or
 *   npm run create-admin <username> <password> <email>
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User, UserRole } from '../src/entities/User';
import bcrypt from 'bcryptjs';

dotenv.config();

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: ts-node scripts/create-admin.ts <username> <password> <email>');
    console.log('Example: ts-node scripts/create-admin.ts admin admin123 admin@school.com');
    process.exit(1);
  }

  const [username, password, email] = args;

  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    // Use loaded metadata target to avoid class identity mismatches
    // when DataSource entities are loaded from dist/*.js in production.
    const userMetadata = AppDataSource.entityMetadatas.find(
      (meta) => meta.name === 'User' || meta.tableName === 'users'
    );
    if (!userMetadata) {
      throw new Error('User entity metadata not found in DataSource');
    }
    const userRepository = AppDataSource.getRepository(userMetadata.target as typeof User);

    // Check if admin already exists
    const existingUser = await userRepository.findOne({
      where: [
        { username },
        { email }
      ]
    });

    if (existingUser) {
      if (existingUser.username === username) {
        console.error(`❌ Username "${username}" already exists`);
      }
      if (existingUser.email === email) {
        console.error(`❌ Email "${email}" already exists`);
      }
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = userRepository.create({
      username,
      email,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true
    });

    await userRepository.save(admin);

    console.log('\n✅ Admin account created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: Admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nYou can now login with:');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);
    console.log(`  OR Email: ${email}`);
    console.log(`  Password: ${password}\n`);

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating admin account:', error.message);
    if (error.code === '23505') {
      console.error('   Duplicate username or email');
    }
    process.exit(1);
  }
}

createAdmin();
