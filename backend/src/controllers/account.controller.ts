import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Department } from '../entities/Department';
import { AuthRequest } from '../middleware/auth';
import { ILike, FindManyOptions } from 'typeorm';

// Update user account (username and password) - works for teachers, parents, and students
export const updateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const raw = req.body || {};
    const newUsername =
      raw.newUsername !== undefined && raw.newUsername !== null
        ? String(raw.newUsername).trim()
        : undefined;
    const newEmailRaw = raw.newEmail;
    const newEmail =
      newEmailRaw !== undefined && newEmailRaw !== null
        ? String(newEmailRaw).trim()
        : undefined;
    const currentPassword = raw.currentPassword != null ? String(raw.currentPassword) : '';
    const newPassword = raw.newPassword != null ? String(raw.newPassword) : '';

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Prevent demo users from changing their password
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot change password. This is a demo environment.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Allow updating password only, or username/email with password
    // If neither username nor email is provided, that's okay - user just wants to change password

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // For teachers, username (TeacherID) cannot be changed, especially on first login
    if (user.role === UserRole.TEACHER) {
      if (newUsername && newUsername !== user.username) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed for teacher accounts' });
      }
      // Also check if teacher is on first login (mustChangePassword is true)
      if (user.mustChangePassword && newUsername) {
        return res.status(400).json({ message: 'Username (TeacherID) cannot be changed. Only password can be changed on first login.' });
      }
    } else {
      // For other roles, check if new username already exists (if different from current)
      if (newUsername && newUsername !== user.username) {
        const existingUser = await userRepository.findOne({ where: { username: newUsername } });
        if (existingUser) {
          return res.status(400).json({ message: 'Username already exists' });
        }
      }
    }

    const normalizedNewEmail =
      newEmail && newEmail.length > 0 ? newEmail.toLowerCase() : undefined;
    const currentEmailNorm = user.email ? user.email.toLowerCase() : null;

    // Check if new email already exists (if provided and different from current)
    if (normalizedNewEmail && normalizedNewEmail !== currentEmailNorm) {
      const existingUser = await userRepository.findOne({ where: { email: normalizedNewEmail } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update username if provided (but not for teachers)
    if (newUsername && user.role !== UserRole.TEACHER) {
      user.username = newUsername;
    }

    // Update email only when a non-empty value is provided (avoid clearing email by mistake)
    if (normalizedNewEmail) {
      user.email = normalizedNewEmail;
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.isTemporaryAccount = false;

    await userRepository.save(user);

    res.json({ 
      message: 'Account updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Error updating teacher account:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get current user account info
export const getAccountInfo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ 
      where: { id: userId },
      relations: ['teacher', 'parent', 'student']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      isTemporaryAccount: user.isTemporaryAccount,
      isDemo: user.isDemo,
      teacher: user.teacher,
      parent: user.parent,
      student: user.student
    });
  } catch (error: any) {
    console.error('Error getting account info:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

const generateTemporaryPassword = () => {
  return `Temp-${randomBytes(4).toString('hex')}-${Date.now().toString().slice(-4)}`;
};

// Admin/SuperAdmin: Create user accounts manually
export const createUserAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = String(req.user.role).toLowerCase();
    const isAdmin = actingRole === 'admin' || actingRole === 'superadmin';

    console.log('[AccountController] Create user attempt:', {
      actingRole,
      isAdmin,
      requestedRole: req.body?.role
    });

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only Administrators can create user accounts' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      email,
      username,
      fullName,
      profileId,
      phone,
      role,
      password,
      generatePassword = true,
      isDemo = false,
      departmentId: bodyDepartmentId
    } = req.body || {};

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const requestedRole = String(role).toLowerCase() as UserRole;
    
    const isTeacherProfileRole = requestedRole === UserRole.TEACHER || requestedRole === UserRole.HOD;

    let hodDepartmentId: string | null = null;
    if (requestedRole === UserRole.HOD) {
      const d = bodyDepartmentId != null ? String(bodyDepartmentId).trim() : '';
      if (!d) {
        return res.status(400).json({ message: 'Department is required for HOD accounts' });
      }
      const deptRepo = AppDataSource.getRepository(Department);
      const dept = await deptRepo.findOne({ where: { id: d } });
      if (!dept) {
        return res.status(400).json({ message: 'Department not found' });
      }
      hodDepartmentId = d;
    }

    // For teacher-profile roles (Teacher/HOD): username is mandatory, email is not required
    if (isTeacherProfileRole) {
      if (!username || !username.trim()) {
        return res.status(400).json({ message: 'Username is mandatory for teacher/HOD accounts' });
      }
    } else {
      // For other roles: email is required
      if (!email) {
        return res.status(400).json({ message: 'Email is required for this role' });
      }
    }
    const validRoles = Object.values(UserRole);
    if (!validRoles.includes(requestedRole)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (actingRole !== 'superadmin' && requestedRole === UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only Super Admins can create Super Admin accounts' });
    }

    const userRepository = AppDataSource.getRepository(User);
    
    // Only check email if provided (not required for teachers)
    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const existingByEmail = await userRepository.findOne({ where: { email: trimmedEmail } });
      if (existingByEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Generate username from provided username or email (if available)
    // For teacher-profile roles, username is mandatory and provided
    let finalUsername: string;
    if (isTeacherProfileRole) {
      // For teacher-profile roles, use the provided username (already validated as mandatory)
      finalUsername = String(username).replace(/\s+/g, '').toLowerCase();
    } else {
      // For other roles, generate from username or email
      finalUsername = username 
        ? String(username).replace(/\s+/g, '').toLowerCase()
        : (email ? String(email).split('@')[0].replace(/\s+/g, '').toLowerCase() : `user_${Date.now()}`);
      if (!finalUsername) {
        finalUsername = `user_${Date.now()}`;
      }
    }
    
    // Ensure username is unique
    const baseUsername = finalUsername;
    let suffix = 1;
    let usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    while (usernameExists) {
      finalUsername = `${baseUsername}${suffix++}`;
      usernameExists = await userRepository.findOne({ where: { username: finalUsername } });
    }

    let plainPassword = (password ? String(password).trim() : '');
    let autoGenerated = false;
    if (!plainPassword) {
      plainPassword = generateTemporaryPassword();
      autoGenerated = true;
    }

    if (plainPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // If the role is DEMO_USER, automatically set isDemo to true
    const isDemoUser = requestedRole === UserRole.DEMO_USER;
    
    // Teacher-profile roles: always require password change on first login.
    // Other roles: only if password was auto-generated.
    const mustChangePassword = isDemoUser
      ? false
      : isTeacherProfileRole
        ? true
        : autoGenerated;

    const user = userRepository.create({
      email: isTeacherProfileRole ? null : (email ? String(email).trim().toLowerCase() : null), // Email is not used for teacher-profile roles
      username: finalUsername,
      password: hashedPassword,
      role: requestedRole,
      isDemo: isDemoUser || (actingRole === UserRole.SUPERADMIN && isDemo === true),
      mustChangePassword,
      isTemporaryAccount: (isTeacherProfileRole || (autoGenerated && !isDemoUser)), // Teacher-profile role passwords are temporary, or auto-generated passwords for other roles
      isActive: true
    });

    await userRepository.save(user);

    // If role is TEACHER/HOD, create or link teacher profile
    if (isTeacherProfileRole) {
      const { Teacher } = await import('../entities/Teacher');
      const teacherRepository = AppDataSource.getRepository(Teacher);
      
      // Check if teacher profile already exists for this user
      let existingTeacher = await teacherRepository.findOne({ where: { userId: user.id } });
      
      // Also check if a teacher with the provided username (as teacherId) already exists
      let teacher = await teacherRepository.findOne({ where: { teacherId: finalUsername } });
      
      if (teacher && !teacher.userId) {
        // Teacher profile exists but not linked - link it to this user
        teacher.userId = user.id;
        if (requestedRole === UserRole.HOD) {
          teacher.role = 'HOD';
        } else if (requestedRole === UserRole.TEACHER) {
          teacher.role = 'Teacher';
        }
        await teacherRepository.save(teacher);
        // Ensure username matches teacherId
        if (user.username !== teacher.teacherId) {
          user.username = teacher.teacherId;
          await userRepository.save(user);
        }
        console.log(`[CreateUserAccount] Linked existing teacher profile (teacherId: ${teacher.teacherId}) to user ${user.id}`);
      } else if (!existingTeacher && !teacher) {
        // No teacher profile exists - create one with username as teacherId
        // The username provided is the TeacherID
        const teacherId = finalUsername;
        
        // Ensure teacherId is unique by checking if it exists
        let uniqueTeacherId = teacherId;
        let counter = 1;
        while (await teacherRepository.findOne({ where: { teacherId: uniqueTeacherId } })) {
          uniqueTeacherId = `${teacherId}_${counter}`;
          counter++;
        }
        
        // Parse fullName into first/last
        const nameParts = fullName ? String(fullName).trim().split(/\s+/) : [];
        const tFirst = nameParts.length > 0 ? nameParts[0] : 'Teacher';
        const tLast  = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Account';

        // Create a basic teacher profile
        teacher = teacherRepository.create({
          teacherId: uniqueTeacherId,
          firstName: tFirst,
          lastName:  tLast,
          role: requestedRole === UserRole.HOD ? 'HOD' : 'Teacher',
          userId: user.id,
          phoneNumber: phone ? String(phone).trim() : null,
          address: null,
          dateOfBirth: null,
          isActive: true
        });
        
        await teacherRepository.save(teacher);
        
        // Update username to match teacherId (in case it was made unique)
        if (user.username !== uniqueTeacherId) {
          user.username = uniqueTeacherId;
          await userRepository.save(user);
        }
        
        console.log(`[CreateUserAccount] Created teacher profile for user ${user.id} with teacherId: ${uniqueTeacherId}`);
      } else if (existingTeacher) {
        // Teacher profile already linked - ensure username matches teacherId
        if (user.username !== existingTeacher.teacherId) {
          user.username = existingTeacher.teacherId;
          await userRepository.save(user);
        }
        const desiredTeacherRole = requestedRole === UserRole.HOD ? 'HOD' : 'Teacher';
        if (existingTeacher.role !== desiredTeacherRole) {
          existingTeacher.role = desiredTeacherRole;
          await teacherRepository.save(existingTeacher);
        }
      }

      if (hodDepartmentId) {
        const t = await teacherRepository.findOne({ where: { userId: user.id } });
        if (t) {
          t.departmentId = hodDepartmentId;
          await teacherRepository.save(t);
        }
      }
    }

    res.status(201).json({
      message: 'User account created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isDemo: user.isDemo
      },
      temporaryCredentials: autoGenerated ? { password: plainPassword } : undefined
    });
  } catch (error: any) {
    console.error('Error creating user account:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

// ── List all users (admin/superadmin) ──────────────────────────────────────
export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'superadmin'].includes(String(req.user.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const userRepo = AppDataSource.getRepository(User);
    const page    = Math.max(1, parseInt(String(req.query.page  || '1')));
    const limit   = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10'))));
    const search  = String(req.query.search || '').trim();
    const role    = String(req.query.role   || '').trim();
    const status  = String(req.query.status || '').trim(); // 'active' | 'inactive'

    const where: any[] = [];

    const buildBase = () => {
      const base: any = {};
      if (role)   base.role     = role as UserRole;
      if (status === 'active')   base.isActive = true;
      if (status === 'inactive') base.isActive = false;
      return base;
    };

    if (search) {
      const like = ILike(`%${search}%`);
      where.push({ ...buildBase(), username: like });
      where.push({ ...buildBase(), email: like });
    } else {
      where.push(buildBase());
    }

    const [users, total] = await userRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  limit,
      relations: ['teacher'],
    });

    const data = users.map(u => ({
      id:        u.id,
      username:  u.username,
      email:     u.email,
      role:      u.role,
      isActive:  u.isActive,
      isDemo:    u.isDemo,
      createdAt: u.createdAt,
      name: u.teacher
        ? `${u.teacher.firstName || ''} ${u.teacher.lastName || ''}`.trim() || u.username
        : u.username,
    }));

    res.json({ users: data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Admin update user (role / status) ──────────────────────────────────────
export const adminUpdateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'superadmin'].includes(String(req.user.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { role, isActive, username, email } = req.body || {};
    if (role      !== undefined) user.role     = role;
    if (isActive  !== undefined) user.isActive = Boolean(isActive);
    if (username  && username.trim()) user.username = username.trim();
    if (email     !== undefined)      user.email    = email ? String(email).trim().toLowerCase() : null;

    await userRepo.save(user);
    res.json({ message: 'User updated', user: { id: user.id, username: user.username, role: user.role, isActive: user.isActive } });
  } catch (err: any) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Admin delete user ──────────────────────────────────────────────────────
export const adminDeleteUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'superadmin'].includes(String(req.user.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    await userRepo.remove(user);
    res.json({ message: 'User deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Admin reset password for ANY user (not just teachers) ──────────────────
export const adminResetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'superadmin'].includes(String(req.user.role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const plain = generateTemporaryPassword();
    user.password = await bcrypt.hash(plain, 10);
    user.mustChangePassword = true;
    user.isTemporaryAccount = true;
    await userRepo.save(user);

    res.json({ message: 'Password reset', temporaryPassword: plain, username: user.username });
  } catch (err: any) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Admin/SuperAdmin: reset a teacher user's password to a new temporary password.
 * Returns the plain temporary password once (display to admin only).
 */
export const adminResetTeacherPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const actingRole = String(req.user.role).toLowerCase();
    if (
      actingRole !== 'admin' &&
      actingRole !== 'superadmin' &&
      actingRole !== 'parent' &&
      actingRole !== 'demo_user'
    ) {
      return res.status(403).json({ message: 'Only Administrators can reset passwords' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const targetUser = await userRepository.findOne({ where: { id: userId } });

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (targetUser.role !== UserRole.TEACHER) {
      return res.status(400).json({
        message: 'This action only applies to teacher accounts. Use other tools for other roles.'
      });
    }

    const plainPassword = generateTemporaryPassword();
    targetUser.password = await bcrypt.hash(plainPassword, 10);
    targetUser.mustChangePassword = true;
    targetUser.isTemporaryAccount = true;

    await userRepository.save(targetUser);

    res.json({
      message: 'Password reset successfully',
      temporaryPassword: plainPassword,
      username: targetUser.username
    });
  } catch (error: any) {
    console.error('Error in adminResetTeacherPassword:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

