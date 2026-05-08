/**
 * Reset a user's password by username (case-insensitive).
 * Usage: npx ts-node scripts/reset-user-password.ts <username> <newPassword>
 * Example: npx ts-node scripts/reset-user-password.ts zhout admin12345
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { User } from '../src/entities/User';
import bcrypt from 'bcryptjs';

async function main() {
  const username = (process.argv[2] || '').trim();
  const plainPassword = process.argv[3] || '';

  if (!username) {
    console.error('Usage: npx ts-node scripts/reset-user-password.ts <username> <newPassword>');
    process.exit(1);
  }

  if (!plainPassword || plainPassword.length < 8) {
    console.error('Password is required and must be at least 8 characters.');
    process.exit(1);
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const repo = AppDataSource.getRepository(User);
  const user = await repo
    .createQueryBuilder('u')
    .where('LOWER(u.username) = LOWER(:username)', { username })
    .getOne();

  if (!user) {
    console.error('User not found for username:', username);
    await AppDataSource.destroy();
    process.exit(1);
  }

  console.log('Found user:', {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive
  });

  user.password = await bcrypt.hash(plainPassword, 10);
  user.mustChangePassword = false;
  user.isTemporaryAccount = false;
  await repo.save(user);

  console.log('Password has been reset successfully.');
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
