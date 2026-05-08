import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Parent } from '../entities/Parent';
import { UserActivityLog } from '../entities/UserActivityLog';
import { resetDemoDataForLogin } from '../utils/resetDemoData';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { AuthRequest } from '../middleware/auth';
import { IsNull, Repository } from 'typeorm';
import { ensureUserActivityLogTable } from '../utils/ensureUserActivityLogTable';
import { generateStudentId } from '../utils/studentIdGenerator';
import { calculateAge } from '../utils/ageUtils';

/** Only one student row may use a given login user (prevents wrong profile when IDs were shared). */
async function unlinkOtherStudentsFromUser(
  studentRepo: Repository<Student>,
  userId: string,
  keepStudentId: string
): Promise<void> {
  await studentRepo
    .createQueryBuilder()
    .update(Student)
    .set({ userId: null } as Record<string, unknown>)
    .where('userId = :uid', { uid: userId })
    .andWhere('id != :sid', { sid: keepStudentId })
    .execute();
}

/** One user ↔ one student; keep `users`→`students` join column aligned with `students.userId`. */
export async function persistStudentUserLink(
  studentRepo: Repository<Student>,
  userRepo: Repository<User>,
  user: User,
  student: Student
): Promise<void> {
  await unlinkOtherStudentsFromUser(studentRepo, user.id, student.id);
  student.userId = user.id;
  await studentRepo.save(student);
  await userRepo
    .createQueryBuilder()
    .relation(User, 'student')
    .of(user.id)
    .set(student.id);
}

export const login = async (req: Request, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { email, username, password, teacherId } = req.body;
    
    console.log('[Login] Request received:', { 
      hasEmail: !!email, 
      hasUsername: !!username, 
      hasPassword: !!password, 
      hasTeacherId: !!teacherId 
    });
    
    const userRepository = AppDataSource.getRepository(User);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Support username login (email is optional, mainly for non-teachers)
    // For teachers, only username is required
    const loginIdentifier = String(username || email || '').trim();
    if (!loginIdentifier || !password) {
      console.log('[Login] Missing credentials:', { loginIdentifier: !!loginIdentifier, password: !!password });
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check if this might be a student login (Student ID + DOB)
    // First, try to find a student with matching studentNumber
    const studentRepository = AppDataSource.getRepository(Student);
    let student = null;
    try {
      const trimmedIdentifier = loginIdentifier.trim();
      student = await studentRepository.findOne({
        where: { studentNumber: trimmedIdentifier },
        relations: ['classEntity']
      });
    } catch (studentError: any) {
      console.error('[Login] Error checking for student:', studentError);
      // Continue with regular login if student check fails
    }

    // If student found, verify DOB matches password
    if (student && student.isActive) {
      console.log('[Login] Potential student login detected, verifying DOB...');
      
      try {
        // Verify Date of Birth matches password
        // Password should be DOB in YYYY-MM-DD format
        const providedDOB = new Date(password);
        
        // Check if date is valid
        if (isNaN(providedDOB.getTime())) {
          console.log('[Login] Invalid date format in password, continuing with regular login');
          // Not a valid date, continue with regular login flow
        } else {
          const studentDOB = new Date(student.dateOfBirth);
          
          // Compare dates (ignore time)
          const providedDateStr = `${providedDOB.getFullYear()}-${String(providedDOB.getMonth() + 1).padStart(2, '0')}-${String(providedDOB.getDate()).padStart(2, '0')}`;
          const studentDateStr = `${studentDOB.getFullYear()}-${String(studentDOB.getMonth() + 1).padStart(2, '0')}-${String(studentDOB.getDate()).padStart(2, '0')}`;
          
          if (providedDateStr === studentDateStr) {
            console.log('[Login] Student login verified via Student ID + DOB');
            
            // Find or create user account for student
            let user = null;
            if (student.userId) {
              user = await userRepository.findOne({
                where: { id: student.userId },
                relations: ['student']
              });
            }

            // If no user exists, create one
            if (!user && !student.userId) {
              console.log('[Login] Creating user account for student:', student.studentNumber);
              
              // Use the exact Student ID (studentNumber) as username
              const studentUsername = student.studentNumber;
              
              // Check if username already exists
              let existingUser = await userRepository.findOne({ 
                where: { username: studentUsername } 
              });
              
              if (!existingUser) {
                existingUser = await userRepository
                  .createQueryBuilder('user')
                  .where('LOWER(user.username) = LOWER(:username)', { username: studentUsername })
                  .getOne();
              }
              
              if (existingUser) {
                const userRole = existingUser.role as string;
                if (userRole === UserRole.STUDENT || userRole === 'student') {
                  student.userId = existingUser.id;
                  await studentRepository.save(student);
                  user = existingUser;
                } else {
                  console.log('[Login] Username exists for different role');
                  return res.status(409).json({ 
                    message: 'Student ID is already in use by another account type.' 
                  });
                }
              } else {
                // Create new user with DOB as password (hashed)
                const hashedPassword = await bcrypt.hash(password, 10);
                user = userRepository.create({
                  username: studentUsername,
                  email: null,
                  password: hashedPassword,
                  role: UserRole.STUDENT as any,
                  isActive: true
                });
                await userRepository.save(user);
                
                // Link user to student
                student.userId = user.id;
                await studentRepository.save(student);
              }
            } else if (user) {
              // User exists, verify username matches Student ID
              if (user.username !== student.studentNumber) {
                user.username = student.studentNumber;
                await userRepository.save(user);
              }
            }

            if (!user || !user.isActive) {
              return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
            }

            await persistStudentUserLink(studentRepository, userRepository, user, student);

            // Generate JWT token
            const secret = process.env.JWT_SECRET;
            if (!secret) {
              return res.status(500).json({ message: 'Server configuration error' });
            }
            const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
            // @ts-ignore - expiresIn accepts string values like '7d' which is valid
            const token = jwt.sign(
              { userId: user.id, role: user.role, studentRecordId: student.id },
              secret,
              { expiresIn }
            );

            // Build response
            const response: any = {
              token,
              user: {
                id: user.id,
                username: user.username,
                role: user.role,
                student: {
                  id: student.id,
                  studentNumber: student.studentNumber,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  dateOfBirth: student.dateOfBirth,
                  classId: student.classId,
                  classEntity: student.classEntity ? {
                    id: student.classEntity.id,
                    name: student.classEntity.name,
                    form: student.classEntity.form
                  } : null
                }
              }
            };

            console.log('[Login] Student authenticated via regular login:', student.studentNumber);
            return res.json(response);
          } else {
            console.log('[Login] Student found but DOB mismatch, continuing with regular login');
            // Continue to regular login flow - might be a different user with same username
          }
        }
      } catch (dateError: any) {
        console.log('[Login] Error parsing date, continuing with regular login:', dateError.message);
        // Continue with regular login flow if date parsing fails
      }
    }

    // Regular login flow - try to find user by username or email
    const user = await userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.parent', 'parent')
      .where(
        'LOWER(user.username) = LOWER(:identifier) OR (user.email IS NOT NULL AND LOWER(user.email) = LOWER(:identifier))',
        { identifier: loginIdentifier }
      )
      .getOne();

    if (!user) {
      console.log('[Login] User not found for identifier:', loginIdentifier);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      console.log('[Login] User account is inactive:', user.id);
      return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
    }

    try {
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        console.log('[Login] Password mismatch for user:', user.id);
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } catch (passwordError: any) {
      console.error('[Login] Error comparing password:', passwordError);
      return res.status(500).json({ message: 'Server error during authentication' });
    }

    // Load teacher with classes if user is a teacher or HOD account
    if (user.role === UserRole.TEACHER || user.role === UserRole.HOD) {
      try {
        console.log('[Login] Teacher login detected, loading teacher profile...');
        
        // Step 1: Find teacher by userId (as per requirements)
        let teacher = await teacherRepository.findOne({
          where: { userId: user.id }
        });
        
        // Check if the found teacher is a placeholder (wrong teacher)
        const isPlaceholderTeacher = teacher && 
          (teacher.firstName === 'Teacher' || teacher.lastName === 'Account' ||
           (teacher.firstName === 'Teacher' && teacher.lastName === 'Account'));
        
        // If teacher is a placeholder or not found, try to find correct teacher by teacherId (username)
        if ((!teacher || isPlaceholderTeacher) && user.username) {
          if (isPlaceholderTeacher) {
            console.log('[Login] ⚠️ User is linked to placeholder teacher, finding correct teacher...');
            console.log('[Login] Placeholder teacher:', teacher.firstName, teacher.lastName, 'ID:', teacher.id);
          } else {
            console.log('[Login] Teacher not found by userId, trying by teacherId (username):', user.username);
          }
          
          // First try to find teacher with real name (not default placeholders) matching username
          const correctTeacher = await teacherRepository
            .createQueryBuilder('teacher')
            .where('LOWER(teacher.teacherId) = LOWER(:teacherId)', { teacherId: user.username })
            .andWhere("teacher.firstName != 'Teacher'")
            .andWhere("teacher.lastName != 'Account'")
            .getOne();
          
          if (correctTeacher) {
            console.log('[Login] ✓ Found correct teacher:', correctTeacher.firstName, correctTeacher.lastName);
            
            // If user was linked to wrong teacher, unlink it
            if (teacher && teacher.id !== correctTeacher.id) {
              console.log('[Login] 🔧 Unlinking wrong teacher (placeholder)...');
              teacher.userId = null;
              await teacherRepository.save(teacher);
              console.log('[Login] ✓ Wrong teacher unlinked');
            }
            
            // Link correct teacher to user
            if (correctTeacher.userId !== user.id) {
              console.log('[Login] 🔧 Linking correct teacher to user account...');
              correctTeacher.userId = user.id;
              await teacherRepository.save(correctTeacher);
              console.log('[Login] ✓ Correct teacher linked to user account');
            }
            
            teacher = correctTeacher;
          } else {
            // If not found with real name, try any teacher with matching teacherId (last resort)
            const anyTeacher = await teacherRepository.findOne({
              where: { teacherId: user.username }
            });
            
            if (anyTeacher && anyTeacher.id !== teacher?.id) {
              console.log('[Login] Found teacher by teacherId (may be placeholder):', anyTeacher.firstName, anyTeacher.lastName);
              
              // Unlink wrong teacher if exists
              if (teacher && teacher.id !== anyTeacher.id) {
                console.log('[Login] 🔧 Unlinking wrong teacher...');
                teacher.userId = null;
                await teacherRepository.save(teacher);
              }
              
              // Link this teacher (even if placeholder, better than nothing)
              if (anyTeacher.userId !== user.id) {
                anyTeacher.userId = user.id;
                await teacherRepository.save(anyTeacher);
                console.log('[Login] Teacher linked to user account');
              }
              
              teacher = anyTeacher;
            }
          }
        }
        
        // If teacher profile doesn't exist, create a minimal one and continue login.
        if (!teacher) {
          console.log('[Login] Teacher profile not found; creating minimal profile for userId:', user.id);
          const baseTeacherId = String(user.username || '').trim();
          let generatedTeacherId = baseTeacherId || `staff_${String(user.id || '').slice(0, 8)}`;
          let suffix = 1;
          while (await teacherRepository.findOne({ where: { teacherId: generatedTeacherId } })) {
            generatedTeacherId = `${baseTeacherId || 'staff'}_${suffix++}`;
          }
          const createdTeacher = teacherRepository.create({
            teacherId: generatedTeacherId,
            firstName: 'Teacher',
            lastName: 'Account',
            role: user.role === UserRole.HOD ? 'HOD' : 'Teacher',
            userId: user.id,
            isActive: true,
          });
          teacher = createdTeacher;
          await teacherRepository.save(createdTeacher);
          if (user.username !== generatedTeacherId) {
            user.username = generatedTeacherId;
            await userRepository.save(user);
          }
          console.log('[Login] ✓ Minimal teacher profile created with TeacherID:', generatedTeacherId);
        }
        
        // Log final teacher info
        console.log('[Login] Using teacher:', teacher.firstName, teacher.lastName, 'ID:', teacher.id, 'TeacherID:', teacher.teacherId);
        
        // Step 2: Build full name (LastName + FirstName)
        // Only use placeholder if both firstName and lastName are placeholders
        const hasValidName = teacher.firstName && 
                            teacher.firstName.trim() && 
                            teacher.firstName !== 'Teacher' && 
                            teacher.firstName !== 'Account' &&
                            teacher.lastName && 
                            teacher.lastName.trim() && 
                            teacher.lastName !== 'Teacher' && 
                            teacher.lastName !== 'Account';
        
        let fullName: string;
        if (hasValidName) {
          fullName = `${teacher.lastName.trim()} ${teacher.firstName.trim()}`.trim();
        } else {
          // If we have any valid part, use it; otherwise use placeholder
          const lastName = (teacher.lastName && teacher.lastName !== 'Teacher' && teacher.lastName !== 'Account') 
            ? teacher.lastName.trim() : '';
          const firstName = (teacher.firstName && teacher.firstName !== 'Teacher' && teacher.firstName !== 'Account') 
            ? teacher.firstName.trim() : '';
          
          if (lastName || firstName) {
            fullName = `${lastName} ${firstName}`.trim();
          } else {
            fullName = 'Teacher'; // Last resort placeholder
            console.log('[Login] ⚠️ Warning: Teacher has placeholder name, showing "Teacher"');
          }
        }
        
        console.log('[Login] Teacher full name:', fullName);
        console.log('[Login] Teacher firstName:', teacher.firstName, 'lastName:', teacher.lastName);
        
        // Step 3: Fetch active classes from junction table
        // Query: teacher_classes JOIN classes WHERE classes.isActive = TRUE
        const { TeacherClass } = await import('../entities/TeacherClass');
        const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
        
        let classes: any[] = [];
        
        try {
          // Query junction table joined with classes, filtering for active classes only
          const teacherClasses = await teacherClassRepository
            .createQueryBuilder('tc')
            .innerJoinAndSelect('tc.class', 'class')
            .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
            .andWhere('class.isActive = :isActive', { isActive: true })
            .getMany();
          
          // Extract class objects
          classes = teacherClasses.map(tc => ({
            id: tc.class.id,
            name: tc.class.name,
            form: tc.class.form,
            description: tc.class.description,
            isActive: tc.class.isActive
          }));
          
          console.log('[Login] ✓ Loaded', classes.length, 'active classes from junction table');
          console.log('[Login] Classes:', classes.map(c => c.name).join(', '));
        } catch (error: any) {
          console.error('[Login] Error fetching classes from junction table:', error.message);
          // Return empty array if query fails
          classes = [];
        }
        
      // Build teacher response object with fullName in LastName + FirstName format
      const teacherResponse = {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        fullName: fullName, // Already formatted as LastName + FirstName
        gender: teacher.gender ?? null,
        phoneNumber: teacher.phoneNumber,
        address: teacher.address,
        dateOfBirth: teacher.dateOfBirth,
        isActive: teacher.isActive
      };
        
        // Attach teacher and classes to user object
        (user as any).teacher = teacherResponse;
        (user as any).classes = classes;
        
        console.log('[Login] Teacher authenticated:', fullName, '- Classes:', classes.length);
        console.log('[Login] Teacher ID:', teacher.teacherId);
        console.log('[Login] Full Name:', fullName);
        console.log('[Login] Classes:', classes.length);
      } catch (teacherError: any) {
        console.error('[Login] Error loading teacher profile:', teacherError);
        console.error('[Login] Error stack:', teacherError.stack);
        // Don't fail login if teacher profile loading fails - just log it
        // The user can still log in, but teacher data won't be available
        console.log('[Login] Continuing login without teacher profile data');
      }
    }

    // Check if this is the demo account and ensure it's marked as demo
    const isDemoAccount = (user.email && user.email === 'demo@school.com') || user.username === 'demo@school.com';
    if (isDemoAccount) {
      if (!user.isDemo) {
        user.isDemo = true;
        await userRepository.save(user);
      }

      // Ensure demo data is available for the session
      try {
        console.log('[Auth] Demo login detected - ensuring demo data is available');
        await resetDemoDataForLogin();
        await ensureDemoDataAvailable();
        console.log('[Auth] Demo data ready');
      } catch (resetError) {
        console.error('[Auth] Error ensuring demo data:', (resetError as Error).message);
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || '30m';

    const jwtPayload: { userId: string; role: string; studentRecordId?: string } = {
      userId: user.id,
      role: user.role as string
    };

    let resolvedStudentProfile: Student | null = null;
    const roleLower = String(user.role || '').toLowerCase();
    if (roleLower === 'student') {
      const srepo = AppDataSource.getRepository(Student);
      const uname = (user.username || '').trim();
      // Prefer the row whose school Student ID matches the login username (avoids wrong child when userId pointed at another row).
      let sRow = uname
        ? await srepo.findOne({ where: { studentNumber: uname } })
        : null;
      if (!sRow && uname) {
        sRow = await srepo.findOne({
          where: { userId: user.id, studentNumber: uname }
        });
      }
      if (!sRow) {
        sRow = await srepo.findOne({ where: { userId: user.id } });
      }
      if (sRow) {
        await persistStudentUserLink(srepo, userRepository, user, sRow);
        jwtPayload.studentRecordId = sRow.id;
        resolvedStudentProfile = await srepo.findOne({
          where: { id: sRow.id },
          relations: ['classEntity']
        });
      }
    }

    // @ts-ignore - expiresIn accepts string values like '7d' which is valid
    const token = jwt.sign(jwtPayload, secret, { expiresIn });

    // Build response based on user role
    const response: any = {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        isTemporaryAccount: user.isTemporaryAccount,
        isDemo: user.isDemo
      }
    };

    // For teachers/HODs, include teacher object with full name and classes list
    if ((user.role === UserRole.TEACHER || user.role === UserRole.HOD) && user.teacher) {
      response.user.teacher = user.teacher;
      response.user.classes = (user as any).classes || [];
    } else {
      // For other roles, include their respective profiles
      if (resolvedStudentProfile) {
        const sp = resolvedStudentProfile;
        response.user.student = {
          id: sp.id,
          studentNumber: sp.studentNumber,
          firstName: sp.firstName,
          lastName: sp.lastName,
          dateOfBirth: sp.dateOfBirth,
          classId: sp.classId,
          classEntity: sp.classEntity
            ? {
                id: sp.classEntity.id,
                name: sp.classEntity.name,
                form: sp.classEntity.form
              }
            : null
        };
      } else if (user.student) {
        response.user.student = user.student;
      }
      if (user.parent) response.user.parent = user.parent;
    }

    // Record login activity for admin/accountant/superadmin
    if ([UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN].includes(user.role)) {
      try {
        await ensureUserActivityLogTable();

        const repo = AppDataSource.getRepository(UserActivityLog);

        // Close any previously active session for this user (should usually not happen)
        const previousActive = await repo.findOne({
          where: { userId: user.id, logoutAt: IsNull() },
          order: { loginAt: 'DESC' }
        });
        if (previousActive) {
          previousActive.logoutAt = new Date();
          await repo.save(previousActive);
        }

        const log = repo.create({
          userId: user.id,
          username: user.username,
          role: user.role,
          loginAt: new Date(),
          logoutAt: null,
          menusAccessed: null,
          lastMenuAccessed: null
        });

        await repo.save(log);
      } catch (activityErr: any) {
        // Do not block login if activity logging fails
        if (activityErr?.code === '42P01') {
          // Table missing even after ensure (very unlikely); ignore.
         // return; // patched: do not exit early
        }
        console.error('Login activity logging error:', activityErr?.message || activityErr);
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      email,
      username,
      password,
      firstName,
      lastName,
      phoneNumber,
      contactNumber,
      dateOfBirth,
      gender,
    } = req.body;

    // Some clients/proxies send role under alternate keys; support them all.
    const body = req.body as Record<string, unknown>;
    const rolesArr = body.roles;
    const roleFromRoles =
      Array.isArray(rolesArr) && rolesArr.length ? rolesArr[0] : undefined;
    const role =
      body.role ??
      body.userRole ??
      body.signupRole ??
      body.accountRole ??
      body.accountType ??
      body.type ??
      roleFromRoles;

    const userRepository = AppDataSource.getRepository(User);

    const roleLooksProvided = (() => {
      if (role === undefined || role === null) return false;
      if (typeof role === 'string') return role.trim().length > 0;
      if (typeof role === 'number') return true;
      if (Array.isArray(role)) return role.length > 0;
      if (typeof role === 'object') return true;
      return false;
    })();

    // Validate password length (minimum 8 characters)
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (!username || !String(username).trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!roleLooksProvided) {
      return res.status(400).json({
        message:
          'Missing role. For public sign-up send role (or userRole / signupRole): "student" or "parent". Administrator accounts are created by an existing administrator under Manage Accounts. Sign-in uses POST /auth/login with username/email and password.',
      });
    }

    /** Unwrap role from common client/proxy shapes (arrays, { value }, etc.). */
    const coercePublicSignupRole = (raw: unknown): unknown => {
      if (raw === undefined || raw === null) return null;
      if (Array.isArray(raw)) {
        return raw.length ? coercePublicSignupRole(raw[0]) : null;
      }
      if (typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o.role === 'string' || typeof o.role === 'number') return o.role;
        if (typeof o.value === 'string' || typeof o.value === 'number') return o.value;
        if (typeof o.name === 'string') return o.name;
        return null;
      }
      return raw;
    };

    /** Public signup — Student, Parent, Administrator only (matches login page). */
    const normalizePublicSelfRegistrationRole = (raw: unknown): UserRole | null => {
      const coerced = coercePublicSignupRole(raw);
      if (coerced === undefined || coerced === null || coerced === '') return null;
      const n = String(coerced).trim().toLowerCase();
      if (!n) return null;
      // Remove separators: "school_admin", "School Administrator", etc.
      const compact = n.replace(/[^a-z0-9]/g, '');

      if (n === 'student' || compact === 'student') return UserRole.STUDENT;
      if (n === 'parent' || compact === 'parent') return UserRole.PARENT;

      // Administrator (enum value is "admin") — include UI/proxy variants
      if (
        compact === 'admin' ||
        compact === 'administrator' ||
        compact === 'administrators' ||
        compact === 'schooladmin' ||
        compact === 'schooladministrator' ||
        compact === 'schooladministrators' ||
        compact === 'headmaster' ||
        compact === 'headteacher' ||
        compact === 'principal'
      ) {
        return UserRole.ADMIN;
      }

      return null;
    };

    const requestedRole = normalizePublicSelfRegistrationRole(role);

    if (!requestedRole) {
      console.warn('[Register] invalid or missing role', {
        role,
        bodyKeys: Object.keys(body).filter((k) => k !== 'password'),
      });
      return res.status(400).json({
        message:
          'Invalid role for self-registration. Only Student or Parent can sign up here. Administrator and other staff accounts are created under Manage Accounts.',
        receivedRole: role,
      });
    }

    console.log('[Register] public self-registration role resolved:', {
      received: role,
      requestedRole,
    });

    let userEmail: string | null = null;
    if (requestedRole === UserRole.PARENT) {
      if (!email || !String(email).trim()) {
        return res.status(400).json({ message: 'Email is required for this registration type' });
      }
      userEmail = String(email).trim();
    }

    if (requestedRole === UserRole.PARENT) {
      if (!gender || !String(gender).trim()) {
        return res.status(400).json({ message: 'Gender is required for parent registration' });
      }
    } else if (requestedRole === UserRole.STUDENT) {
      userEmail = `${String(username).trim()}@student.local`;
    }

    if (userEmail) {
      const existingUserByEmail = await userRepository.findOne({ where: { email: userEmail } });
      if (existingUserByEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    const existingUserByUsername = await userRepository.findOne({ where: { username: String(username).trim() } });
    if (existingUserByUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    if (requestedRole === UserRole.STUDENT) {
      if (!dateOfBirth) {
        return res.status(400).json({ message: 'Date of birth is required for student registration' });
      }
      if (!gender) {
        return res.status(400).json({ message: 'Gender is required for student registration' });
      }
      let parsedDateOfBirth: Date;
      if (typeof dateOfBirth === 'string') {
        parsedDateOfBirth = new Date(dateOfBirth);
        if (isNaN(parsedDateOfBirth.getTime())) {
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else {
        return res.status(400).json({ message: 'Invalid date of birth' });
      }
      const age = calculateAge(parsedDateOfBirth);
      if (age < 11 || age > 20) {
        return res.status(400).json({ message: 'Student age must be between 11 and 20 years' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = userRepository.create({
      email: userEmail,
      username: String(username).trim(),
      password: hashedPassword,
      role: requestedRole,
    });

    await userRepository.save(user);

    if (requestedRole === UserRole.STUDENT) {
      const studentRepository = AppDataSource.getRepository(Student);
      let parsedDateOfBirth: Date;
      if (typeof dateOfBirth === 'string') {
        parsedDateOfBirth = new Date(dateOfBirth);
      } else {
        parsedDateOfBirth = dateOfBirth as Date;
      }
      const studentNumber = await generateStudentId();
      const finalContact = contactNumber?.trim() || phoneNumber?.trim() || null;
      const student = studentRepository.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        studentNumber,
        dateOfBirth: parsedDateOfBirth,
        gender: String(gender).trim(),
        phoneNumber: finalContact,
        contactNumber: finalContact,
        userId: user.id,
        enrollmentStatus: 'Not Enrolled',
        studentType: 'Day Scholar',
        isActive: true,
      });
      await studentRepository.save(student);
    } else if (requestedRole === UserRole.PARENT) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const parent = parentRepository.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phoneNumber: phoneNumber?.trim() || contactNumber?.trim() || null,
        userId: user.id,
        email: userEmail,
        gender: String(gender).trim(),
      });
      await parentRepository.save(parent);
    }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const parentRepository = AppDataSource.getRepository(Parent);

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email (check both User.email and Parent.email)
    let user = await userRepository.findOne({ where: { email } });
    
    // If not found in User, check Parent entity
    if (!user) {
      const parent = await parentRepository.findOne({ where: { email } });
      if (parent) {
        user = await userRepository.findOne({ where: { id: parent.userId } });
      }
    }

    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }

    // Generate reset token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // In production, send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    // TODO: Send email with reset link: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}

    res.json({ 
      message: 'If the email exists, a password reset link has been sent',
      // In development, return token (remove in production)
      token: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error: any) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** Step 1: verify Student ID + DOB, return short-lived JWT for confirmPasswordReset */
export const verifyStudentPasswordReset = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentNumber, dateOfBirth } = req.body;

    if (!studentNumber || !dateOfBirth) {
      return res.status(400).json({ message: 'Student ID and date of birth are required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const userRepository = AppDataSource.getRepository(User);

    const trimmedId = String(studentNumber).trim();
    const student = await studentRepository.findOne({
      where: { studentNumber: trimmedId },
    });

    if (!student) {
      return res.status(400).json({ message: 'Invalid Student ID or date of birth' });
    }

    if (!student.isActive) {
      return res.status(400).json({ message: 'This student account is inactive. Please contact the school.' });
    }

    const providedDOB = new Date(dateOfBirth);
    if (isNaN(providedDOB.getTime())) {
      return res.status(400).json({ message: 'Invalid date of birth format' });
    }
    const studentDOB = new Date(student.dateOfBirth);
    const providedDateStr = `${providedDOB.getFullYear()}-${String(providedDOB.getMonth() + 1).padStart(2, '0')}-${String(providedDOB.getDate()).padStart(2, '0')}`;
    const studentDateStr = `${studentDOB.getFullYear()}-${String(studentDOB.getMonth() + 1).padStart(2, '0')}-${String(studentDOB.getDate()).padStart(2, '0')}`;

    if (providedDateStr !== studentDateStr) {
      return res.status(400).json({ message: 'Invalid Student ID or date of birth' });
    }

    if (!student.userId) {
      return res.status(400).json({
        message: 'No login account is linked to this student. Please contact the school.',
      });
    }

    const user = await userRepository.findOne({ where: { id: student.userId } });
    if (!user || user.role !== UserRole.STUDENT) {
      return res.status(400).json({ message: 'Invalid account for student password reset' });
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'Account is inactive. Please contact the administrator.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      jwtSecret,
      { expiresIn: '30m' }
    );

    res.json({
      message: 'Identity verified. You can set a new password.',
      token: resetToken,
    });
  } catch (error: any) {
    console.error('verifyStudentPasswordReset error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** Step 1: verify Employee ID (teacherId), return short-lived JWT for confirmPasswordReset */
export const verifyTeacherPasswordReset = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { teacherId } = req.body;

    if (!teacherId || !String(teacherId).trim()) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const trimmed = String(teacherId).trim();
    let teacher = await teacherRepository.findOne({
      where: { teacherId: trimmed },
    });

    if (!teacher) {
      teacher = await teacherRepository
        .createQueryBuilder('t')
        .where('LOWER(t.teacherId) = LOWER(:tid)', { tid: trimmed })
        .getOne();
    }

    if (!teacher) {
      return res.status(400).json({ message: 'Invalid Employee ID' });
    }

    if (!teacher.isActive) {
      return res.status(400).json({ message: 'This teacher account is inactive. Please contact the administrator.' });
    }

    if (!teacher.userId) {
      return res.status(400).json({
        message: 'No login account is linked to this employee. Please contact the administrator.',
      });
    }

    const user = await userRepository.findOne({ where: { id: teacher.userId } });
    const staffResetRoles = new Set<string>([
      UserRole.TEACHER,
      UserRole.HOD,
      UserRole.LIBRARIAN,
      UserRole.INVENTORY_CLERK,
    ]);
    if (!user || !staffResetRoles.has(String(user.role || '').toLowerCase())) {
      return res.status(400).json({ message: 'Invalid account for staff password reset' });
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'Account is inactive. Please contact the administrator.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      jwtSecret,
      { expiresIn: '30m' }
    );

    res.json({
      message: 'Identity verified. You can set a new password.',
      token: resetToken,
    });
  } catch (error: any) {
    console.error('verifyTeacherPasswordReset error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret) as any;
      if (decoded.type !== 'password-reset') {
        return res.status(400).json({ message: 'Invalid reset token' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await userRepository.save(user);

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Password reset confirmation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.body?.userId;
    if (userId) {
      try {
        await ensureUserActivityLogTable();

        const repo = AppDataSource.getRepository(UserActivityLog);
        const activeLog = await repo.findOne({
          where: { userId: String(userId), logoutAt: IsNull() },
          order: { loginAt: 'DESC' }
        });
        if (activeLog) {
          activeLog.logoutAt = new Date();
          await repo.save(activeLog);
        }
      } catch (logErr: any) {
        console.error('Logout activity update error:', logErr?.message || logErr);
      }
    }

    // For JWT-based auth we simply instruct the client to discard the token.
    // This endpoint exists to maintain parity with session-based flows.
    res.json({
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Failed to logout', error: error.message });
  }
};

// Student login using Student ID (studentNumber) and Date of Birth
export const studentLogin = async (req: Request, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, dateOfBirth } = req.body;
    
    console.log('[Student Login] Request received:', { 
      hasStudentId: !!studentId, 
      hasDateOfBirth: !!dateOfBirth 
    });
    
    if (!studentId || !dateOfBirth) {
      return res.status(400).json({ message: 'Student ID and Date of Birth are required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const userRepository = AppDataSource.getRepository(User);

    // Find student by studentNumber (Student ID) - exact match (case-sensitive)
    const trimmedStudentId = studentId.trim();
    const student = await studentRepository.findOne({
      where: { studentNumber: trimmedStudentId },
      relations: ['classEntity']
    });

    if (!student) {
      console.log('[Student Login] Student not found for Student ID:', trimmedStudentId);
      return res.status(401).json({ message: 'Invalid Student ID or Date of Birth' });
    }

    // Verify that the entered Student ID exactly matches the studentNumber in database
    if (student.studentNumber !== trimmedStudentId) {
      console.log('[Student Login] Student ID mismatch:', { 
        entered: trimmedStudentId, 
        database: student.studentNumber 
      });
      return res.status(401).json({ message: 'Invalid Student ID or Date of Birth' });
    }

    if (!student.isActive) {
      console.log('[Student Login] Student account is inactive:', student.id);
      return res.status(401).json({ message: 'Student account is inactive. Please contact the administrator.' });
    }

    // Verify Date of Birth
    // Convert DOB to YYYY-MM-DD format for comparison
    const providedDOB = new Date(dateOfBirth);
    const studentDOB = new Date(student.dateOfBirth);
    
    // Compare dates (ignore time)
    const providedDateStr = `${providedDOB.getFullYear()}-${String(providedDOB.getMonth() + 1).padStart(2, '0')}-${String(providedDOB.getDate()).padStart(2, '0')}`;
    const studentDateStr = `${studentDOB.getFullYear()}-${String(studentDOB.getMonth() + 1).padStart(2, '0')}-${String(studentDOB.getDate()).padStart(2, '0')}`;
    
    if (providedDateStr !== studentDateStr) {
      console.log('[Student Login] DOB mismatch:', { provided: providedDateStr, student: studentDateStr });
      return res.status(401).json({ message: 'Invalid Student ID or Date of Birth' });
    }

    // Find or create user account for student
    let user = await userRepository.findOne({
      where: { id: student.userId || '' },
      relations: ['student']
    });

    // If no user exists, create one
    if (!user && !student.userId) {
      console.log('[Student Login] Creating user account for student:', student.studentNumber);
      
      // Use the exact Student ID (studentNumber) as username - must match exactly
      const username = student.studentNumber; // Use exact case, no lowercase conversion
      
      // Check if username already exists (try both exact match and case-insensitive)
      let existingUser = await userRepository.findOne({ 
        where: { username: username } 
      });
      
      // Also check case-insensitive match to handle any existing users
      if (!existingUser) {
        existingUser = await userRepository
          .createQueryBuilder('user')
          .where('LOWER(user.username) = LOWER(:username)', { username })
          .getOne();
      }
      
      if (existingUser) {
        // If existing user found, verify it's for a student and link it
        const userRole = existingUser.role as string;
        if (userRole === UserRole.STUDENT || userRole === 'student') {
          // Link existing user to student
          student.userId = existingUser.id;
          await studentRepository.save(student);
          user = existingUser;
          console.log('[Student Login] Linked existing user to student:', username);
        } else {
          // Username exists but for different role - this shouldn't happen, but handle it
          console.log('[Student Login] Username exists for different role:', username);
          return res.status(409).json({ 
            message: 'Student ID is already in use by another account type. Please contact administrator.' 
          });
        }
      } else {
        // Create new user with exact Student ID as username
        const hashedPassword = await bcrypt.hash(dateOfBirth, 10);
        user = userRepository.create({
          username: username, // Exact Student ID as username
          email: null, // Students don't need email
          password: hashedPassword,
          role: UserRole.STUDENT as any,
          isActive: true
        });
        await userRepository.save(user);
        
        // Link user to student
        student.userId = user.id;
        await studentRepository.save(student);
        console.log('[Student Login] Created new user account with Student ID as username:', username);
      }
    } else if (user) {
      // User exists, verify the username matches the Student ID
      if (user.username !== student.studentNumber) {
        console.log('[Student Login] Username mismatch:', { 
          userUsername: user.username, 
          studentNumber: student.studentNumber 
        });
        // Update username to match Student ID
        user.username = student.studentNumber;
        await userRepository.save(user);
        console.log('[Student Login] Updated username to match Student ID:', student.studentNumber);
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account is inactive. Please contact the administrator.' });
    }

    await persistStudentUserLink(studentRepository, userRepository, user, student);

    // Generate JWT token (studentRecordId = who logged in; fixes wrong User.student join)
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
    // @ts-ignore - expiresIn accepts string values like '7d' which is valid
    const token = jwt.sign(
      { userId: user.id, role: user.role, studentRecordId: student.id },
      secret,
      { expiresIn }
    );

    // Build response
    const response: any = {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        student: {
          id: student.id,
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          classId: student.classId,
          classEntity: student.classEntity ? {
            id: student.classEntity.id,
            name: student.classEntity.name,
            form: student.classEntity.form
          } : null
        }
      }
    };

    console.log('[Student Login] Student authenticated:', student.studentNumber);
    res.json(response);
  } catch (error: any) {
    console.error('Student login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};