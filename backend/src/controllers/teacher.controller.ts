import { Response } from 'express';
import { In } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { Department } from '../entities/Department';
import { User, UserRole } from '../entities/User';
import { AuthRequest } from '../middleware/auth';
import { generateTeacherId } from '../utils/teacherIdGenerator';
import { isDemoUser } from '../utils/demoDataFilter';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { isValidPhoneNumber, PHONE_VALIDATION_MESSAGE } from '../utils/phoneNumber';
import { linkTeacherToClasses, syncManyToManyToJunctionTable } from '../utils/teacherClassLinker';
import { calculateAge } from '../utils/ageUtils';
import { buildPaginationResponse, parsePaginationParams } from '../utils/pagination';
import { TeacherClass } from '../entities/TeacherClass';
import { formatTeacherTitleName } from '../utils/teacherDisplayName';
import { normalizeTeacherMaritalStatus } from '../utils/normalizeTeacherMaritalStatus';
import {
  insertTeacherContractLesson,
  updateTeacherContractLesson,
  deleteTeacherContractLesson,
  deleteTeacherContractLessonById,
  loadDoubleMapForTeacherClassesSubjects,
  loadContractLessonsForTeacher,
  contractClassSubjectKey,
  parseRequestDoublePeriod,
  parseRequestSessionsPerWeek,
} from '../utils/teacherContractLesson';

function normalizeTeacherRole(input: unknown): 'HOD' | 'Teacher' {
  const raw = String(input ?? '').trim().toLowerCase();
  return raw === 'hod' ? 'HOD' : 'Teacher';
}

function normalizeDepartmentId(input: unknown): string | null {
  const s = String(input ?? '').trim();
  return s ? s : null;
}

export const registerTeacher = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { firstName, lastName, phoneNumber, address, dateOfBirth, qualification, subjectIds, gender, maritalStatus, role, departmentId } =
      req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    const trimmedPhoneNumber = phoneNumber?.trim();
    if (!trimmedPhoneNumber || !isValidPhoneNumber(trimmedPhoneNumber)) {
      return res.status(400).json({ message: PHONE_VALIDATION_MESSAGE });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const departmentRepository = AppDataSource.getRepository(Department);
    const userRepository = AppDataSource.getRepository(User);

    // Generate unique teacher ID with prefix JPST
    const teacherId = await generateTeacherId();

    // Parse dateOfBirth if it's a string
    let parsedDateOfBirth: Date | null = null;
    if (dateOfBirth) {
      if (typeof dateOfBirth === 'string') {
        parsedDateOfBirth = new Date(dateOfBirth);
        if (isNaN(parsedDateOfBirth.getTime())) {
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else {
        parsedDateOfBirth = dateOfBirth;
      }
    }

    if (!parsedDateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required to register a teacher' });
    }

    const teacherAge = calculateAge(parsedDateOfBirth);
    if (teacherAge < 20 || teacherAge > 65) {
      return res.status(400).json({ message: 'Teacher age must be between 20 and 65 years' });
    }

    const gTrim = gender !== undefined && gender !== null && String(gender).trim() ? String(gender).trim() : null;

    const normalizedRole = normalizeTeacherRole(role);
    const depId = normalizeDepartmentId(departmentId);
    if (!depId) {
      return res.status(400).json({ message: 'Department is required' });
    }
    const dep = await departmentRepository.findOne({ where: { id: depId } as any });
    if (!dep) return res.status(400).json({ message: 'Selected department does not exist' });
    if (normalizedRole === 'HOD') {
      const existingHod = await teacherRepository.findOne({ where: { role: 'HOD', departmentId: depId } as any });
      if (existingHod) {
        existingHod.role = 'Teacher';
        await teacherRepository.save(existingHod);
        if (existingHod.userId) {
          const prevUser = await userRepository.findOne({ where: { id: existingHod.userId } });
          if (prevUser) {
            prevUser.role = UserRole.TEACHER;
            await userRepository.save(prevUser);
          }
        }
      }
    }

    const teacherData: Partial<Teacher> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      teacherId,
      phoneNumber: trimmedPhoneNumber,
      address: address?.trim() || null,
      qualification: qualification?.trim() || null,
      role: normalizedRole,
      departmentId: depId,
      gender: gTrim,
      maritalStatus: normalizeTeacherMaritalStatus(gTrim, maritalStatus)
    };

    // Only include dateOfBirth if it's provided
    teacherData.dateOfBirth = parsedDateOfBirth;

    const teacher = teacherRepository.create(teacherData) as Teacher;

    // Set teaching subjects if provided
    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      const { Subject } = await import('../entities/Subject');
      const subjectRepository = AppDataSource.getRepository(Subject);
      const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
      teacher.subjects = subjects;
    }

    // Save teacher
    await teacherRepository.save(teacher);
    
    // Create temporary user account for teacher (username is TeacherID, password only, no email)
    const tempUsername = teacherId; // Username is the TeacherID
    const tempPassword = `temp_${teacherId}_${Date.now()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Check if the current user is a demo user
    const isDemo = req.user?.isDemo === true || 
                   req.user?.email === 'demo@school.com' || 
                   req.user?.username === 'demo@school.com';
    
    const accountRole = teacher.role === 'HOD' ? UserRole.HOD : UserRole.TEACHER;
    const user = userRepository.create({
      email: null, // Teachers don't require email
      username: tempUsername,
      password: hashedPassword,
      role: accountRole,
      mustChangePassword: true,
      isTemporaryAccount: true,
      isDemo: isDemo // Set isDemo flag based on creator
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);
    
    // Load the teacher with relations
    const savedTeacher = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['subjects', 'classes', 'department']
    });

    res.status(201).json({ 
      message: 'Teacher registered successfully with temporary account', 
      teacher: savedTeacher,
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        note: 'Teacher must change password on first login. Login with username and password only.'
      }
    });
  } catch (error: any) {
    console.error('Error registering teacher:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Employee number already exists' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTeachers = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const pagination = parsePaginationParams(req.query);
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    
    // Try to load with relations, but handle errors gracefully
    let teachers;
    try {
      const queryBuilder = teacherRepository
        .createQueryBuilder('teacher')
        .leftJoinAndSelect('teacher.subjects', 'subjects')
        .leftJoinAndSelect('teacher.classes', 'classes')
        .leftJoinAndSelect('teacher.department', 'department')
        .leftJoinAndSelect('teacher.user', 'user');
      
      teachers = await queryBuilder.getMany();
    } catch (relationError: any) {
      console.error('[getTeachers] Error loading with relations:', relationError.message);
      console.error('[getTeachers] Error code:', relationError.code);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getTeachers] Table/relation error detected, loading without classes relation');
        // Fallback: load without classes relation
        try {
          const queryBuilder = teacherRepository
            .createQueryBuilder('teacher')
            .leftJoinAndSelect('teacher.subjects', 'subjects')
            .leftJoinAndSelect('teacher.department', 'department')
            .leftJoinAndSelect('teacher.user', 'user');
          
          teachers = await queryBuilder.getMany();
          
          // Initialize classes array for all teachers
          teachers = teachers.map((t: any) => ({
            ...t,
            classes: t.classes || []
          }));
        } catch (fallbackError: any) {
          console.error('[getTeachers] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          teachers = await teacherRepository.find();
          teachers = teachers.map((t: any) => ({
            ...t,
            classes: [],
            subjects: t.subjects || []
          }));
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    let normalizedTeachers = Array.isArray(teachers) ? teachers : [];

    if (searchQuery) {
      normalizedTeachers = normalizedTeachers.filter((teacher: any) => {
        const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.toLowerCase();
        const teacherId = (teacher.teacherId || '').toLowerCase();
        const phone = (teacher.phoneNumber || '').toLowerCase();
        const qualification = (teacher.qualification || '').toLowerCase();
        return (
          fullName.includes(searchQuery) ||
          teacherId.includes(searchQuery) ||
          phone.includes(searchQuery) ||
          qualification.includes(searchQuery)
        );
      });
    }

    if (pagination.isPaginated) {
      const total = normalizedTeachers.length;
      const paged = normalizedTeachers.slice(pagination.skip, pagination.skip + pagination.limit);
      return res.json(buildPaginationResponse(paged, pagination.page, pagination.limit, total));
    }

    res.json(normalizedTeachers);
  } catch (error: any) {
    console.error('[getTeachers] Error:', error);
    console.error('[getTeachers] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getCurrentTeacher = async (req: AuthRequest, res: Response) => {
  console.log('[getCurrentTeacher] ========== ENDPOINT CALLED ==========');
  console.log('[getCurrentTeacher] Request URL:', req.url);
  console.log('[getCurrentTeacher] Request Method:', req.method);
  
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userEmail = req.user?.email;
    
    console.log('[getCurrentTeacher] ============ DEBUG INFO ============');
    console.log('[getCurrentTeacher] User ID:', userId);
    console.log('[getCurrentTeacher] User Role:', userRole);
    console.log('[getCurrentTeacher] User Email:', userEmail);
    
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (userRole !== UserRole.TEACHER && userRole !== UserRole.HOD) {
      return res.status(403).json({ message: 'Only teachers and HODs can access this endpoint' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);
    
    try {
      // Try to find teacher by userId
      let teacher = await teacherRepository.findOne({
        where: { userId },
        relations: ['subjects', 'classes', 'user']
      });

      console.log('[getCurrentTeacher] Teacher found by userId:', teacher ? 'Yes' : 'No');
      
      if (!teacher) {
        console.log('[getCurrentTeacher] No teacher found for userId:', userId);
        
        // Try to find teacher by user email pattern (diagnostic)
        const allTeachers = await teacherRepository.find();
        console.log('[getCurrentTeacher] Total teachers in DB:', allTeachers.length);
        console.log('[getCurrentTeacher] Teachers without userId:', allTeachers.filter(t => !t.userId).length);
        
        // Check if user has teacher relationship from User side
        const userWithTeacher = await userRepository.findOne({
          where: { id: userId },
          relations: ['teacher']
        });
        
        console.log('[getCurrentTeacher] User.teacher exists:', !!userWithTeacher?.teacher);
        
        if (userWithTeacher?.teacher) {
          // User has teacher relationship, but teacher.userId might not be set
          console.log('[getCurrentTeacher] Found teacher via User relationship:', userWithTeacher.teacher.id);
          teacher = await teacherRepository.findOne({
            where: { id: userWithTeacher.teacher.id },
            relations: ['subjects', 'classes', 'user']
          });
          
          // Fix the userId if it's not set
          if (teacher && !teacher.userId) {
            console.log('[getCurrentTeacher] Auto-fixing teacher.userId...');
            teacher.userId = userId;
            await teacherRepository.save(teacher);
            console.log('[getCurrentTeacher] Teacher.userId fixed!');
          }
        }
        
        if (!teacher) {
          return res.status(404).json({ 
            message: 'Teacher profile not found. Please contact administrator.',
            debug: {
              userId,
              userEmail,
              totalTeachers: allTeachers.length,
              teachersWithoutUserId: allTeachers.filter(t => !t.userId).length,
              suggestion: 'Run: UPDATE teachers SET "userId" = \'' + userId + '\' WHERE "teacherId" = \'YOUR_TEACHER_ID\';'
            }
          });
        }
      }

      console.log('[getCurrentTeacher] Teacher ID (UUID):', teacher.id);
      console.log('[getCurrentTeacher] Teacher ID (string):', teacher.teacherId);
      console.log('[getCurrentTeacher] Teacher Name:', teacher.firstName, teacher.lastName);
      console.log('[getCurrentTeacher] Teacher Full Name:', `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim());
      console.log('[getCurrentTeacher] Classes count (from initial load):', teacher.classes?.length || 0);
      
      // Ensure classes array is initialized
      if (!teacher.classes) {
        teacher.classes = [];
      }
      
      // Reset classes to ensure we fetch fresh data from junction table
      teacher.classes = [];
      
      // Always fetch classes from junction table (primary method)
      try {
        console.log('[getCurrentTeacher] Fetching classes for teacher ID (UUID):', teacher.id, 'TeacherID (string):', teacher.teacherId);
        
        const { TeacherClass } = await import('../entities/TeacherClass');
        const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
        
        // Query the junction table using teacher.id (UUID) and filter for active classes only
        const teacherClasses = await teacherClassRepository
          .createQueryBuilder('tc')
          .innerJoinAndSelect('tc.class', 'class')
          .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
          .andWhere('class.isActive = :isActive', { isActive: true })
          .getMany();
        
        console.log('[getCurrentTeacher] Found', teacherClasses.length, 'active class assignments in junction table');
        
        if (teacherClasses.length > 0) {
          // Extract class entities from junction table (already filtered for active)
          const classes = teacherClasses.map(tc => tc.class);
          teacher.classes = classes;
          console.log('[getCurrentTeacher] Classes loaded from junction table:', classes.map(c => c.name).join(', '));
        } else {
          // Fallback: try ManyToMany relation if junction table has no results
          console.log('[getCurrentTeacher] No classes in junction table, trying ManyToMany relation...');
          try {
            // Reload teacher with ManyToMany relation
            const teacherWithClasses = await teacherRepository.findOne({
              where: { id: teacher.id },
              relations: ['classes']
            });
            
            if (teacherWithClasses && teacherWithClasses.classes && teacherWithClasses.classes.length > 0) {
              // Filter for active classes only
              teacher.classes = teacherWithClasses.classes.filter((c: any) => c.isActive === true);
              console.log('[getCurrentTeacher] Active classes found via ManyToMany:', teacher.classes.map((c: any) => c.name).join(', '));
              
              // Sync to junction table for future queries
              try {
                const classIds = teacher.classes.map((c: any) => c.id);
                await linkTeacherToClasses(teacher.id, classIds);
                console.log('[getCurrentTeacher] Synced classes to junction table');
              } catch (syncError: any) {
                console.error('[getCurrentTeacher] Error syncing to junction table:', syncError.message);
              }
            } else {
              // Try query builder approach
              const { Class } = await import('../entities/Class');
              const classRepository = AppDataSource.getRepository(Class);
              
              const classesWithTeacher = await classRepository
                .createQueryBuilder('class')
                .leftJoinAndSelect('class.teachers', 'teacher')
                .where('teacher.id = :teacherId', { teacherId: teacher.id })
                .andWhere('class.isActive = :isActive', { isActive: true })
                .getMany();
              
              if (classesWithTeacher.length > 0) {
                teacher.classes = classesWithTeacher;
                console.log('[getCurrentTeacher] Active classes found via query builder:', classesWithTeacher.map(c => c.name).join(', '));
                
                // Sync to junction table for future queries
                try {
                  const classIds = classesWithTeacher.map(c => c.id);
                  await linkTeacherToClasses(teacher.id, classIds);
                  console.log('[getCurrentTeacher] Synced classes to junction table');
                } catch (syncError: any) {
                  console.error('[getCurrentTeacher] Error syncing to junction table:', syncError.message);
                }
              } else {
                teacher.classes = [];
                console.log('[getCurrentTeacher] No classes found via any method');
              }
            }
          } catch (fallbackError: any) {
            console.error('[getCurrentTeacher] Error in fallback class query:', fallbackError.message);
            teacher.classes = [];
          }
        }
      } catch (junctionError: any) {
        console.error('[getCurrentTeacher] Error loading classes from junction table:', junctionError.message);
        console.error('[getCurrentTeacher] Junction table error stack:', junctionError.stack);
        // Try fallback
        try {
          const teacherWithClasses = await teacherRepository.findOne({
            where: { id: teacher.id },
            relations: ['classes']
          });
          if (teacherWithClasses && teacherWithClasses.classes) {
            teacher.classes = teacherWithClasses.classes;
          } else {
            teacher.classes = [];
          }
        } catch (fallbackError: any) {
          teacher.classes = [];
        }
      }
      
      console.log('[getCurrentTeacher] Final classes count:', teacher.classes?.length || 0);
      
      console.log('[getCurrentTeacher] Final classes count:', teacher.classes?.length || 0);
      console.log('[getCurrentTeacher] Final teacher name:', `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim());
      console.log('[getCurrentTeacher] =====================================');
      
      // Ensure arrays are always present
      if (!teacher.classes) {
        teacher.classes = [];
      }
      if (!teacher.subjects) {
        teacher.subjects = [];
      }
      
      // Add fullName property in LastName + FirstName format
      const teacherResponse: any = {
        ...teacher,
        fullName: `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher',
        formattedTitleName: formatTeacherTitleName(
          teacher.firstName,
          teacher.lastName,
          teacher.gender,
          teacher.maritalStatus
        )
      };
      
      res.json(teacherResponse);
    } catch (dbError: any) {
      console.error('[getCurrentTeacher] Database error:', dbError);
      throw dbError;
    }
  } catch (error: any) {
    console.error('[getCurrentTeacher] Error:', error);
    console.error('[getCurrentTeacher] Stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTeacherById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    
    // Try to load with relations, but handle errors gracefully
    let teacher;
    try {
      teacher = await teacherRepository.findOne({
        where: { id },
        relations: ['subjects', 'classes', 'user', 'department']
      });
    } catch (relationError: any) {
      console.error('[getTeacherById] Error loading with relations:', relationError.message);
      console.error('[getTeacherById] Error code:', relationError.code);
      console.error('[getTeacherById] Error stack:', relationError.stack);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.code === '42P01'; // PostgreSQL: relation does not exist
      
      if (isTableError) {
        console.log('[getTeacherById] Table/relation error detected, loading without classes relation');
        // Fallback: load without classes relation
        try {
          teacher = await teacherRepository.findOne({
            where: { id },
            relations: ['subjects', 'user', 'department']
          });
          if (teacher) {
            (teacher as any).classes = [];
          }
        } catch (fallbackError: any) {
          console.error('[getTeacherById] Error in fallback query:', fallbackError.message);
          // Last resort: load without any relations
          teacher = await teacherRepository.findOne({
            where: { id }
          });
          if (teacher) {
            (teacher as any).classes = [];
            (teacher as any).subjects = [];
          }
        }
      } else {
        // For other errors, rethrow to be caught by outer catch
        throw relationError;
      }
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Ensure arrays are initialized
    if (!teacher.classes) {
      (teacher as any).classes = [];
    }
    if (!teacher.subjects) {
      (teacher as any).subjects = [];
    }

    res.json(teacher);
  } catch (error: any) {
    console.error('[getTeacherById] Error:', error);
    console.error('[getTeacherById] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const updateTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const {
      firstName,
      lastName,
      phoneNumber,
      address,
      dateOfBirth,
      qualification,
      subjectIds,
      isActive,
      gender,
      maritalStatus,
      role,
      departmentId
    } = req.body;

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const departmentRepository = AppDataSource.getRepository(Department);
    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes', 'department']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (firstName) teacher.firstName = firstName.trim();
    if (lastName) teacher.lastName = lastName.trim();
    if (phoneNumber !== undefined) {
      const trimmedPhone = phoneNumber?.trim();
      if (!trimmedPhone || !isValidPhoneNumber(trimmedPhone)) {
        return res.status(400).json({ message: PHONE_VALIDATION_MESSAGE });
      }
      teacher.phoneNumber = trimmedPhone;
    }
    if (address !== undefined) teacher.address = address?.trim() || null;
    if (qualification !== undefined) teacher.qualification = qualification?.trim() || null;
    const nextRole = role !== undefined ? normalizeTeacherRole(role) : teacher.role;
    const nextDepartmentId = departmentId !== undefined ? normalizeDepartmentId(departmentId) : teacher.departmentId;

    if (nextRole === 'HOD') {
      if (!nextDepartmentId) return res.status(400).json({ message: 'Department is required when role is HOD' });
      const dep = await departmentRepository.findOne({ where: { id: nextDepartmentId } as any });
      if (!dep) return res.status(400).json({ message: 'Selected department does not exist' });
      const existingHod = await teacherRepository
        .createQueryBuilder('t')
        .where('t.role = :r AND t."departmentId" = :d AND t.id <> :id', { r: 'HOD', d: nextDepartmentId, id: teacher.id })
        .getOne();
      if (existingHod) {
        existingHod.role = 'Teacher';
        await teacherRepository.save(existingHod);
        const userRepoForDemote = AppDataSource.getRepository(User);
        if (existingHod.userId) {
          const prevUser = await userRepoForDemote.findOne({ where: { id: existingHod.userId } });
          if (prevUser) {
            prevUser.role = UserRole.TEACHER;
            await userRepoForDemote.save(prevUser);
          }
        }
      }
    } else if (departmentId !== undefined && nextDepartmentId) {
      const dep = await departmentRepository.findOne({ where: { id: nextDepartmentId } as any });
      if (!dep) return res.status(400).json({ message: 'Selected department does not exist' });
    }

    if (role !== undefined) teacher.role = nextRole;
    if (departmentId !== undefined || role !== undefined) {
      if (nextRole === 'HOD') {
        teacher.departmentId = nextDepartmentId;
      } else if (departmentId !== undefined) {
        teacher.departmentId = nextDepartmentId;
      }
    }
    if (isActive !== undefined) {
      teacher.isActive = Boolean(isActive);
    }
    if (dateOfBirth) {
      const parsedDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
      if (!isNaN(parsedDate.getTime())) {
        teacher.dateOfBirth = parsedDate;
      }
    }
    if (gender !== undefined) {
      const g = gender === null || gender === '' ? null : String(gender).trim();
      teacher.gender = g || null;
    }
    if (maritalStatus !== undefined) {
      teacher.maritalStatus = normalizeTeacherMaritalStatus(teacher.gender, maritalStatus);
    }

    teacher.maritalStatus = normalizeTeacherMaritalStatus(teacher.gender, teacher.maritalStatus);

    // Update teaching subjects if provided
    if (subjectIds !== undefined) {
      if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const { Subject } = await import('../entities/Subject');
        const subjectRepository = AppDataSource.getRepository(Subject);
        const subjects = await subjectRepository.find({ where: { id: In(subjectIds) } });
        teacher.subjects = subjects;
      } else {
        teacher.subjects = [];
      }
    }

    // Save teacher
    await teacherRepository.save(teacher);

    // Ensure role column persists (avoids edge cases where relation-heavy saves skip scalar updates)
    if (role !== undefined) {
      await teacherRepository.update({ id: teacher.id }, { role: nextRole });
      teacher.role = nextRole;
    }

    // Keep linked user role in sync with teacher role
    if (teacher.userId) {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: teacher.userId } });
      if (user) {
        user.role = teacher.role === 'HOD' ? UserRole.HOD : UserRole.TEACHER;
        await userRepo.save(user);
      }
    }

    const updatedTeacher = await teacherRepository.findOne({
      where: { id },
      relations: ['subjects', 'classes', 'department']
    });

    res.json({ message: 'Teacher updated successfully', teacher: updatedTeacher });
  } catch (error: any) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete teacher with ID:', id);

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({
      where: { id },
      relations: ['user', 'subjects', 'classes']
    });

    if (!teacher) {
      console.log('Teacher not found with ID:', id);
      return res.status(404).json({ message: 'Teacher not found' });
    }

    console.log('Found teacher:', teacher.firstName, teacher.lastName, `(${teacher.teacherId})`);

    const userIdToDelete = teacher.userId || undefined;

    // Clear ManyToMany links so join tables are updated before remove
    teacher.classes = [];
    teacher.subjects = [];
    await teacherRepository.save(teacher);

    // Explicitly clear teacher_classes junction (may exist alongside M2M)
    try {
      const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
      await teacherClassRepository.delete({ teacherId: id });
    } catch (junctionErr: any) {
      console.warn('[deleteTeacher] teacher_classes cleanup:', junctionErr?.message || junctionErr);
    }

    // IMPORTANT: Delete teacher row BEFORE user row — teachers.userId FK references users.id.
    // Deleting the user first causes a foreign key violation.
    console.log('Deleting teacher:', teacher.firstName, teacher.lastName);
    await teacherRepository.remove(teacher);
    console.log('Teacher deleted successfully');

    if (userIdToDelete) {
      const user = await userRepository.findOne({ where: { id: userIdToDelete } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting teacher:', error);
    console.error('Error stack:', error.stack);
    const msg = error?.message || 'Unknown error';
    const code = error?.code || error?.driverError?.code;
    // PostgreSQL foreign key violation
    if (code === '23503') {
      return res.status(400).json({
        message:
          'Cannot delete this teacher while other records still reference them (e.g. timetable, classes, or linked data). Remove those links first, then try again.',
        error: msg
      });
    }
    res.status(500).json({ message: 'Server error', error: msg });
  }
};

export const getTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    let teacher: Teacher | null = null;
    let teacherId: string | null = null;

    // Get teacherId from params or from authenticated user
    const paramId = req.params.teacherId || req.params.id;
    
    // If no teacherId in params, try to get from authenticated user
    if (!paramId && req.user) {
      const user = req.user;
      
      // If user is a teacher, get their teacher profile
      if (user.role === UserRole.TEACHER || user.role === UserRole.HOD) {
        // Try to find by userId first
        teacher = await teacherRepository.findOne({
          where: { userId: user.id }
        });
        
        // If not found by userId, try by teacherId (username)
        if (!teacher && user.username) {
          teacher = await teacherRepository.findOne({
            where: { teacherId: user.username }
          });
        }
        
        if (teacher) {
          teacherId = teacher.id;
        }
      } else if (user.teacher) {
        teacherId = user.teacher.id;
      }
    } else if (paramId) {
      // Check if paramId is a UUID (teacher.id) or string (teacher.teacherId)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (uuidRegex.test(paramId)) {
        // It's a UUID, find by id
        teacher = await teacherRepository.findOne({
          where: { id: paramId }
        });
        teacherId = paramId;
      } else {
        // It's likely a teacherId string, find by teacherId
        teacher = await teacherRepository.findOne({
          where: { teacherId: paramId }
        });
        if (teacher) {
          teacherId = teacher.id;
        }
      }
    }

    if (!teacherId || !teacher) {
      return res.status(400).json({ message: 'Teacher ID is required or teacher not found' });
    }

    console.log('[getTeacherClasses] Fetching classes for teacher:', {
      id: teacher.id,
      teacherId: teacher.teacherId,
      name: `${teacher.firstName} ${teacher.lastName}`
    });

    let classes: any[] = [];

    // Try junction table first, but fallback gracefully if it fails
    try {
      const { TeacherClass } = await import('../entities/TeacherClass');
      const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

      // Query the junction table using teacher.id (UUID) and filter for active classes only
      const teacherClasses = await teacherClassRepository
        .createQueryBuilder('tc')
        .innerJoinAndSelect('tc.class', 'class')
        .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
        .andWhere('class.isActive = :isActive', { isActive: true })
        .getMany();

      console.log('[getTeacherClasses] Found', teacherClasses.length, 'active class assignments in junction table');

      if (teacherClasses.length > 0) {
        // Extract class information from junction table
        classes = teacherClasses.map(tc => ({
          id: tc.class.id,
          name: tc.class.name,
          form: tc.class.form,
          description: tc.class.description,
          isActive: tc.class.isActive
        }));
        console.log('[getTeacherClasses] Classes loaded from junction table:', classes.map(c => c.name).join(', '));
      }
    } catch (junctionError: any) {
      console.warn('[getTeacherClasses] Junction table query failed, falling back to ManyToMany:', junctionError.message);
      // Continue to ManyToMany fallback
    }

    // Fallback: try ManyToMany relation if junction table has no results or failed
    if (classes.length === 0) {
      try {
        console.log('[getTeacherClasses] Trying ManyToMany relation...');
        const teacherWithClasses = await teacherRepository.findOne({
          where: { id: teacher.id },
          relations: ['classes']
        });

        if (teacherWithClasses && teacherWithClasses.classes && teacherWithClasses.classes.length > 0) {
          // Filter for active classes only
          classes = teacherWithClasses.classes
            .filter((c: any) => c.isActive === true)
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              form: c.form,
              description: c.description,
              isActive: c.isActive
            }));
          console.log('[getTeacherClasses] Found', classes.length, 'active classes via ManyToMany relation:', classes.map(c => c.name).join(', '));
          
          // Sync to junction table for future queries (non-blocking)
          try {
            const { linkTeacherToClasses } = await import('../utils/teacherClassLinker');
            const classIds = classes.map(c => c.id);
            await linkTeacherToClasses(teacher.id, classIds);
            console.log('[getTeacherClasses] Synced classes to junction table');
          } catch (syncError: any) {
            console.error('[getTeacherClasses] Error syncing to junction table:', syncError.message);
            // Don't fail the request if sync fails
          }
        } else {
          console.log('[getTeacherClasses] No classes found via any method');
        }
      } catch (relationError: any) {
        console.error('[getTeacherClasses] Error loading via ManyToMany relation:', relationError.message);
        // Return empty array if both methods fail
        classes = [];
      }
    }

    res.json({ classes });
  } catch (error: any) {
    console.error('[getTeacherClasses] Error fetching teacher classes:', error);
    console.error('[getTeacherClasses] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Assign classes to a teacher
export const assignClassesToTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { classIds } = req.body;

    if (!classIds || !Array.isArray(classIds)) {
      return res.status(400).json({ message: 'classIds must be an array' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    
    // Find teacher by ID (UUID or teacherId)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let teacher: Teacher | null = null;
    
    if (uuidRegex.test(id)) {
      teacher = await teacherRepository.findOne({ where: { id } });
    } else {
      teacher = await teacherRepository.findOne({ where: { teacherId: id } });
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Update ManyToMany relationship
    if (classIds.length > 0) {
      const { Class } = await import('../entities/Class');
      const classRepository = AppDataSource.getRepository(Class);
      const classes = await classRepository.find({ where: { id: In(classIds) } });
      teacher.classes = classes;
    } else {
      teacher.classes = [];
    }

    await teacherRepository.save(teacher);

    // Also update junction table
    try {
      await linkTeacherToClasses(teacher.id, classIds);
      console.log('[assignClassesToTeacher] Updated junction table');
    } catch (linkError: any) {
      console.error('[assignClassesToTeacher] Error updating junction table:', linkError);
      // Continue - ManyToMany is updated
    }

    // Get updated teacher with classes
    const updatedTeacher = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['classes', 'subjects']
    });

    res.json({ 
      message: 'Classes assigned successfully',
      teacher: updatedTeacher
    });
  } catch (error: any) {
    console.error('Error assigning classes to teacher:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

/**
 * Ensure teacher teaches `subjectId` in `classId`: links teacher↔class, teacher↔subject, class↔subject as needed (timetable setup).
 */
export const assignTeacherClassSubject = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { classId, subjectId } = req.body;
    const isDoublePeriod = parseRequestDoublePeriod(req.body);
    const sessionsPerWeek = parseRequestSessionsPerWeek(req.body);
    const contractLessonIdRaw = req.body.contractLessonId;
    const classScope: string = String(req.body.classScope ?? 'entire').trim() || 'entire';
    const contractLessonId =
      contractLessonIdRaw != null && String(contractLessonIdRaw).trim() !== ''
        ? String(contractLessonIdRaw).trim()
        : '';

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'classId and subjectId are required' });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let teacherRow: Teacher | null = null;
    if (uuidRegex.test(id)) {
      teacherRow = await teacherRepository.findOne({
        where: { id },
        relations: ['classes', 'subjects'],
      });
    } else {
      teacherRow = await teacherRepository.findOne({
        where: { teacherId: id },
        relations: ['classes', 'subjects'],
      });
    }

    if (!teacherRow) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const { Class } = await import('../entities/Class');
    const { Subject } = await import('../entities/Subject');
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);

    const classEntity = await classRepository.findOne({
      where: { id: String(classId) },
      relations: ['subjects'],
    });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const subjectEntity = await subjectRepository.findOne({
      where: { id: String(subjectId) },
    });
    if (!subjectEntity) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    if (!teacherRow.classes) {
      teacherRow.classes = [];
    }
    if (!teacherRow.subjects) {
      teacherRow.subjects = [];
    }
    if (!classEntity.subjects) {
      classEntity.subjects = [];
    }

    if (!teacherRow.classes.some((c) => c.id === classEntity.id)) {
      teacherRow.classes.push(classEntity);
    }

    if (!teacherRow.subjects.some((s) => s.id === subjectEntity.id)) {
      teacherRow.subjects.push(subjectEntity);
    }

    if (!classEntity.subjects.some((s) => s.id === subjectEntity.id)) {
      classEntity.subjects.push(subjectEntity);
    }

    await teacherRepository.save(teacherRow);
    await classRepository.save(classEntity);

    try {
      await linkTeacherToClasses(
        teacherRow.id,
        teacherRow.classes.map((c) => c.id)
      );
    } catch (linkError: any) {
      console.warn('[assignTeacherClassSubject] Junction sync:', linkError?.message || linkError);
    }

    try {
      if (contractLessonId) {
        const updatedLine = await updateTeacherContractLesson(contractLessonId, teacherRow.id, {
          isDoublePeriod,
          sessionsPerWeek,
          classScope,
        });
        if (!updatedLine) {
          return res.status(404).json({ message: 'Contract lesson line not found for this teacher.' });
        }
      } else {
        await insertTeacherContractLesson(
          teacherRow.id,
          classEntity.id,
          subjectEntity.id,
          isDoublePeriod,
          sessionsPerWeek,
          classScope
        );
      }
    } catch (contractErr: any) {
      console.warn('[assignTeacherClassSubject] Contract lesson:', contractErr?.message || contractErr);
      return res.status(500).json({
        message: 'Could not save lesson line.',
        error: contractErr?.message || 'Unknown error',
      });
    }

    const updated = await teacherRepository.findOne({
      where: { id: teacherRow.id },
      relations: ['classes', 'subjects'],
    });

    res.json({
      message: contractLessonId
        ? 'Lesson line updated.'
        : 'Lesson line added (each line is independent for that class and subject).',
      teacher: updated,
    });
  } catch (error: any) {
    console.error('[assignTeacherClassSubject]', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error',
    });
  }
};

/**
 * Remove one class–subject lesson from a teacher (updates M2M subjects/classes; keeps placeholder-only class assignments).
 */
export const unassignTeacherClassSubject = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { classId, subjectId } = req.body;
    const contractLessonIdRaw = req.body.contractLessonId;
    const contractLessonId =
      contractLessonIdRaw != null && String(contractLessonIdRaw).trim() !== ''
        ? String(contractLessonIdRaw).trim()
        : '';

    if (!contractLessonId && (!classId || !subjectId)) {
      return res.status(400).json({
        message: 'Provide contractLessonId to remove one line, or classId and subjectId to remove all lines for that pair.',
      });
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let teacherRow: Teacher | null = null;
    if (uuidRegex.test(id)) {
      teacherRow = await teacherRepository.findOne({
        where: { id },
        relations: ['classes', 'subjects'],
      });
    } else {
      teacherRow = await teacherRepository.findOne({
        where: { teacherId: id },
        relations: ['classes', 'subjects'],
      });
    }

    if (!teacherRow) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (contractLessonId) {
      const ok = await deleteTeacherContractLessonById(teacherRow.id, contractLessonId);
      if (!ok) {
        return res.status(404).json({ message: 'Contract lesson line not found.' });
      }
    } else {
      await deleteTeacherContractLesson(
        teacherRow.id,
        String(classId),
        String(subjectId)
      );
    }

    const remainingLines = await loadContractLessonsForTeacher(teacherRow.id);
    const classIdsFromLines = [...new Set(remainingLines.map((l) => l.classId))];
    const subjectIdsFromLines = [...new Set(remainingLines.map((l) => l.subjectId))];

    const { Class } = await import('../entities/Class');
    const { Subject } = await import('../entities/Subject');
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);

    const newClasses =
      classIdsFromLines.length > 0
        ? await classRepository.find({ where: { id: In(classIdsFromLines) } })
        : [];
    const newSubjects =
      subjectIdsFromLines.length > 0
        ? await subjectRepository.find({ where: { id: In(subjectIdsFromLines) } })
        : [];

    teacherRow.classes = newClasses;
    teacherRow.subjects = newSubjects;

    await teacherRepository.save(teacherRow);

    try {
      await linkTeacherToClasses(teacherRow.id, classIdsFromLines);
    } catch (linkError: any) {
      console.warn('[unassignTeacherClassSubject] Junction sync:', linkError?.message || linkError);
    }

    res.json({
      message: contractLessonId
        ? 'Lesson line removed.'
        : 'All lesson lines for this class and subject were removed from this teacher.',
    });
  } catch (error: any) {
    console.error('[unassignTeacherClassSubject]', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error',
    });
  }
};

type AssignedClassRef = {
  id: string;
  name: string;
  classForm: string | null;
};

type TeacherAssignmentRow = {
  /** One row in teacher_contract_lessons; null = legacy display only (should be rare after auto-seed). */
  contractLessonId: string | null;
  subjectId: string | null;
  subjectName: string;
  /** Syllabus / qualification code (e.g. 0478, 9618) — stored in subjects.code */
  subjectCode: string | null;
  shortTitle: string | null;
  subjectCategory: 'O_LEVEL' | 'A_LEVEL' | null;
  classId: string;
  className: string;
  classForm: string | null;
  /** Weekly sessions for this line (each counts as ×1 or ×2 periods). */
  lessonsPerWeek: number;
  /** Double periods count ×2 toward load and generation. */
  isDoublePeriod: boolean;
  /** Period-weighted load: lessonsPerWeek × (isDoublePeriod ? 2 : 1). */
  weeklyPeriodLoad: number;
  placeholder?: boolean;
};

function teacherShortNameLabel(teacher: Teacher): string {
  const f = (teacher.firstName || '').trim();
  if (f.length >= 2) {
    return f.slice(0, 2);
  }
  if (f.length === 1) {
    return (f + (teacher.lastName || '').trim().slice(0, 1)).slice(0, 2);
  }
  return (teacher.lastName || '').trim().slice(0, 2) || '—';
}

async function loadActiveLessonsPerWeek(): Promise<Record<string, number>> {
  const { TimetableConfig } = await import('../entities/TimetableConfig');
  const repo = AppDataSource.getRepository(TimetableConfig);
  const cfg = await repo.findOne({ where: { isActive: true } });
  const raw = cfg?.lessonsPerWeek;
  return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {};
}

/** Union of classes from ManyToMany and teacher_classes junction (active classes only). */
async function getTeacherAssignedClassesMerged(
  teacherUuid: string,
  teacherEntity: Teacher
): Promise<AssignedClassRef[]> {
  const byId = new Map<string, AssignedClassRef>();
  for (const c of teacherEntity.classes || []) {
    if (c?.id) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        classForm: c.form != null ? String(c.form) : null,
      });
    }
  }
  try {
    const { TeacherClass } = await import('../entities/TeacherClass');
    const repo = AppDataSource.getRepository(TeacherClass);
    const links = await repo
      .createQueryBuilder('tc')
      .innerJoinAndSelect('tc.class', 'class')
      .where('tc.teacherId = :tid', { tid: teacherUuid })
      .andWhere('class.isActive = :act', { act: true })
      .getMany();
    for (const tc of links) {
      const cl = tc.class;
      if (cl?.id) {
        byId.set(cl.id, {
          id: cl.id,
          name: cl.name,
          classForm: cl.form != null ? String(cl.form) : null,
        });
      }
    }
  } catch (e: any) {
    console.warn('[getTeacherAssignedClassesMerged] junction:', e?.message || e);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function buildClassSubjectIdsMap(classIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!classIds.length) {
    return map;
  }
  const { Class } = await import('../entities/Class');
  const classRepository = AppDataSource.getRepository(Class);
  const classes = await classRepository.find({
    where: { id: In(classIds) },
    relations: ['subjects'],
  });
  for (const c of classes) {
    map.set(c.id, new Set((c.subjects || []).map((s) => s.id)));
  }
  return map;
}

function buildTeacherAssignmentRows(
  assignedClasses: AssignedClassRef[],
  teacherSubjects: NonNullable<Teacher['subjects']>,
  classSubjectIdsByClassId: Map<string, Set<string>>,
  lessonsPerWeekFallback: Record<string, number>,
  contractLines: import('../entities/TeacherContractLesson').TeacherContractLesson[]
): TeacherAssignmentRow[] {
  const byPair = new Map<string, import('../entities/TeacherContractLesson').TeacherContractLesson[]>();
  for (const line of contractLines) {
    const k = contractClassSubjectKey(line.classId, line.subjectId);
    if (!byPair.has(k)) {
      byPair.set(k, []);
    }
    byPair.get(k)!.push(line);
  }
  for (const arr of byPair.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  }

  const rows: TeacherAssignmentRow[] = [];
  const tSubjects = teacherSubjects || [];
  for (const ce of assignedClasses) {
    const allowed = classSubjectIdsByClassId.get(ce.id) || new Set<string>();
    for (const subj of tSubjects) {
      if (!allowed.has(subj.id)) {
        continue;
      }
      const k = contractClassSubjectKey(ce.id, subj.id);
      const lines = byPair.get(k) || [];
      if (lines.length === 0) {
        const baseLpw = lessonsPerWeekFallback[subj.id] ?? 3;
        rows.push({
          contractLessonId: null,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code ?? null,
          shortTitle: subj.shortTitle ?? null,
          subjectCategory: subj.category === 'A_LEVEL' || subj.category === 'O_LEVEL' ? subj.category : null,
          classId: ce.id,
          className: ce.name,
          classForm: ce.classForm,
          lessonsPerWeek: baseLpw,
          isDoublePeriod: false,
          weeklyPeriodLoad: baseLpw,
          placeholder: false,
        });
      } else {
        for (const line of lines) {
          const spw = Math.max(1, line.sessionsPerWeek ?? 1);
          const isDoublePeriod = line.isDoublePeriod === true;
          rows.push({
            contractLessonId: line.id,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code ?? null,
            shortTitle: subj.shortTitle ?? null,
            subjectCategory: subj.category === 'A_LEVEL' || subj.category === 'O_LEVEL' ? subj.category : null,
            classId: ce.id,
            className: ce.name,
            classForm: ce.classForm,
            lessonsPerWeek: spw,
            isDoublePeriod,
            weeklyPeriodLoad: spw * (isDoublePeriod ? 2 : 1),
            placeholder: false,
          });
        }
      }
    }
  }
  const classIdsWithRows = new Set(rows.filter((r) => !r.placeholder).map((r) => r.classId));
  for (const ce of assignedClasses) {
    if (!classIdsWithRows.has(ce.id)) {
      rows.push({
        contractLessonId: null,
        subjectId: null,
        subjectName: '—',
        subjectCode: null,
        shortTitle: null,
        subjectCategory: null,
        classId: ce.id,
        className: ce.name,
        classForm: ce.classForm,
        lessonsPerWeek: 0,
        isDoublePeriod: false,
        weeklyPeriodLoad: 0,
        placeholder: true,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      String(a.subjectName).localeCompare(String(b.subjectName)) ||
      String(a.contractLessonId || '').localeCompare(String(b.contractLessonId || ''))
  );
  return rows;
}

/** Insert one DB row per class–subject overlap when none exist (migrates old subject-wide config into per-class lines). */
async function ensureDefaultContractLinesForTeacher(
  teacherId: string,
  assignedClasses: AssignedClassRef[],
  teacherSubjects: NonNullable<Teacher['subjects']>,
  classSubjectIdsByClassId: Map<string, Set<string>>,
  lessonsPerWeek: Record<string, number>
): Promise<void> {
  const existing = await loadContractLessonsForTeacher(teacherId);
  const dbl = await loadDoubleMapForTeacherClassesSubjects(teacherId);
  const tSubjects = teacherSubjects || [];
  for (const ce of assignedClasses) {
    const allowed = classSubjectIdsByClassId.get(ce.id) || new Set<string>();
    for (const subj of tSubjects) {
      if (!allowed.has(subj.id)) {
        continue;
      }
      const lines = existing.filter((l) => l.classId === ce.id && l.subjectId === subj.id);
      if (lines.length > 0) {
        continue;
      }
      const isDouble = dbl.get(contractClassSubjectKey(ce.id, subj.id)) === true;
      const sessions = Math.min(50, Math.max(1, Math.round(lessonsPerWeek[subj.id] ?? 3)));
      await insertTeacherContractLesson(teacherId, ce.id, subj.id, isDouble, sessions);
    }
  }
}

/** List all teachers with weekly lesson totals and assignment counts (Teacher Subject Assignment hub). */
export const getSubjectAssignmentSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    let teachers: Teacher[] = [];
    try {
      teachers = await teacherRepository
        .createQueryBuilder('teacher')
        .leftJoinAndSelect('teacher.subjects', 'subjects')
        .leftJoinAndSelect('teacher.classes', 'classes')
        .orderBy('teacher.lastName', 'ASC')
        .addOrderBy('teacher.firstName', 'ASC')
        .getMany();
    } catch (relationError: any) {
      console.error('[getSubjectAssignmentSummary] Error loading teachers:', relationError.message);
      teachers = await teacherRepository.find({ order: { lastName: 'ASC', firstName: 'ASC' } });
      teachers = teachers.map((t: any) => ({
        ...t,
        classes: [],
        subjects: [],
      }));
    }

    const mergedPerTeacher = await Promise.all(
      teachers.map(async (t) => ({
        teacher: t,
        assigned: await getTeacherAssignedClassesMerged(t.id, t),
      }))
    );

    const allClassIds = [
      ...new Set(mergedPerTeacher.flatMap((x) => x.assigned.map((c) => c.id))),
    ];
    const classSubjectIdsByClassId = await buildClassSubjectIdsMap(allClassIds);
    const lessonsPerWeek = await loadActiveLessonsPerWeek();

    const payload = await Promise.all(
      mergedPerTeacher.map(async ({ teacher: t, assigned }) => {
        const contractLines = await loadContractLessonsForTeacher(t.id);
        const rows = buildTeacherAssignmentRows(
          assigned,
          t.subjects || [],
          classSubjectIdsByClassId,
          lessonsPerWeek,
          contractLines
        );
        const weeklyLessons = rows
          .filter((r) => !r.placeholder)
          .reduce((sum, r) => sum + r.weeklyPeriodLoad, 0);
        return {
          id: t.id,
          teacherId: t.teacherId,
          firstName: t.firstName,
          lastName: t.lastName,
          shortName: teacherShortNameLabel(t),
          weeklyLessons,
          assignmentCount: rows.length,
          assignedClassCount: assigned.length,
          isActive: t.isActive,
        };
      })
    );

    res.json({ teachers: payload });
  } catch (error: any) {
    console.error('[getSubjectAssignmentSummary]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Subject–class rows for one teacher (Contract / contact view). */
export const getTeacherSubjectAssignmentDetail = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const teacherRepository = AppDataSource.getRepository(Teacher);

    let teacher: Teacher | null = null;
    try {
      if (uuidRegex.test(id)) {
        teacher = await teacherRepository.findOne({
          where: { id },
          relations: ['classes', 'subjects'],
        });
      } else {
        teacher = await teacherRepository.findOne({
          where: { teacherId: id },
          relations: ['classes', 'subjects'],
        });
      }
    } catch (e: any) {
      console.warn('[getTeacherSubjectAssignmentDetail] relation load:', e?.message);
      teacher = uuidRegex.test(id)
        ? await teacherRepository.findOne({ where: { id } })
        : await teacherRepository.findOne({ where: { teacherId: id } });
      if (teacher) {
        (teacher as any).classes = (teacher as any).classes || [];
        (teacher as any).subjects = (teacher as any).subjects || [];
      }
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const assignedClasses = await getTeacherAssignedClassesMerged(teacher.id, teacher);
    const classIds = assignedClasses.map((c) => c.id);
    const classSubjectIdsByClassId = await buildClassSubjectIdsMap(classIds);
    const lessonsPerWeek = await loadActiveLessonsPerWeek();
    await ensureDefaultContractLinesForTeacher(
      teacher.id,
      assignedClasses,
      teacher.subjects || [],
      classSubjectIdsByClassId,
      lessonsPerWeek
    );
    const contractLines = await loadContractLessonsForTeacher(teacher.id);
    const rows = buildTeacherAssignmentRows(
      assignedClasses,
      teacher.subjects || [],
      classSubjectIdsByClassId,
      lessonsPerWeek,
      contractLines
    );
    const totalWeeklyLessons = rows
      .filter((r) => !r.placeholder)
      .reduce((s, r) => s + r.weeklyPeriodLoad, 0);

    const teacherSubjects = (teacher.subjects || [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code ?? null,
        shortTitle: s.shortTitle ?? null,
        category: s.category === 'A_LEVEL' || s.category === 'O_LEVEL' ? s.category : null,
      }))
      .sort(
        (a, b) =>
          String(a.code || '').localeCompare(String(b.code || '')) || a.name.localeCompare(b.name)
      );

    res.json({
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        shortName: teacherShortNameLabel(teacher),
        qualification: teacher.qualification,
      },
      assignedClasses,
      teacherSubjects,
      rows,
      totalWeeklyLessons,
    });
  } catch (error: any) {
    console.error('[getTeacherSubjectAssignmentDetail]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Get teacher load information
export const getTeacherLoad = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    
    // Find teacher by ID (UUID or teacherId)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let teacher: Teacher | null = null;
    
    try {
      if (uuidRegex.test(id)) {
        teacher = await teacherRepository.findOne({ 
          where: { id },
          relations: ['classes', 'subjects']
        });
      } else {
        teacher = await teacherRepository.findOne({ 
          where: { teacherId: id },
          relations: ['classes', 'subjects']
        });
      }
    } catch (relationError: any) {
      // If relations fail, try without them
      console.warn('[getTeacherLoad] Error loading with relations, trying without:', relationError.message);
      if (uuidRegex.test(id)) {
        teacher = await teacherRepository.findOne({ where: { id } });
      } else {
        teacher = await teacherRepository.findOne({ where: { teacherId: id } });
      }
      if (teacher) {
        (teacher as any).classes = [];
        (teacher as any).subjects = [];
      }
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Ensure arrays are initialized
    if (!teacher.classes) {
      (teacher as any).classes = [];
    }
    if (!teacher.subjects) {
      (teacher as any).subjects = [];
    }

    const classIds = (teacher.classes || []).map((c) => c.id);
    let classSubjectIdsByClassId = new Map<string, Set<string>>();
    if (classIds.length > 0) {
      try {
        classSubjectIdsByClassId = await buildClassSubjectIdsMap(classIds);
      } catch (e: any) {
        console.warn('[getTeacherLoad] Could not load class subjects for overlap:', e?.message || e);
      }
    }

    const lessonsPerWeekForLoad = await loadActiveLessonsPerWeek();
    const teacherSubjectList = teacher.subjects || [];
    const contractLinesForLoad = await loadContractLessonsForTeacher(teacher.id);
    const loadDoubleFallback = await loadDoubleMapForTeacherClassesSubjects(teacher.id);

    // Get student count for each class + subjects this teacher teaches in that class
    const { Student } = await import('../entities/Student');
    const studentRepository = AppDataSource.getRepository(Student);

    const classLoads = await Promise.all(
      (teacher.classes || []).map(async (classEntity) => {
        const allowedIds = classSubjectIdsByClassId.get(classEntity.id) || new Set<string>();
        const linesHere = contractLinesForLoad.filter((l) => l.classId === classEntity.id);
        let subjectsHere: Array<{
          id: string;
          contractLessonId?: string;
          name: string;
          code?: string;
          shortTitle: string | null;
          lessonsPerWeek: number;
          isDoublePeriod: boolean;
          weeklyPeriodLoad: number;
        }> = [];

        if (linesHere.length > 0) {
          for (const line of linesHere) {
            const s = teacherSubjectList.find((x) => x.id === line.subjectId);
            if (!s || !allowedIds.has(s.id)) {
              continue;
            }
            const spw = Math.max(1, line.sessionsPerWeek || 1);
            const isDouble = line.isDoublePeriod === true;
            subjectsHere.push({
              id: s.id,
              contractLessonId: line.id,
              name: s.name,
              code: s.code,
              shortTitle: s.shortTitle ?? null,
              lessonsPerWeek: spw,
              isDoublePeriod: isDouble,
              weeklyPeriodLoad: spw * (isDouble ? 2 : 1),
            });
          }
        } else {
          subjectsHere = teacherSubjectList
            .filter((s) => allowedIds.has(s.id))
            .map((s) => {
              const baseLpw = lessonsPerWeekForLoad[s.id] ?? 3;
              const isDouble = loadDoubleFallback.get(contractClassSubjectKey(classEntity.id, s.id)) === true;
              return {
                id: s.id,
                name: s.name,
                code: s.code,
                shortTitle: s.shortTitle ?? null,
                lessonsPerWeek: baseLpw,
                isDoublePeriod: isDouble,
                weeklyPeriodLoad: baseLpw * (isDouble ? 2 : 1),
              };
            });
        }

        try {
          const studentCount = await studentRepository.count({
            where: { classId: classEntity.id, isActive: true },
          });
          return {
            id: classEntity.id,
            name: classEntity.name,
            form: classEntity.form,
            studentCount,
            subjects: subjectsHere,
          };
        } catch (err: any) {
          console.error('[getTeacherLoad] Error counting students for class:', classEntity.id, err.message);
          return {
            id: classEntity.id,
            name: classEntity.name,
            form: classEntity.form,
            studentCount: 0,
            subjects: subjectsHere,
          };
        }
      })
    );

    const totalStudents = classLoads.reduce((sum, cls) => sum + cls.studentCount, 0);
    const totalClasses = teacher.classes?.length || 0;
    const totalSubjects = teacher.subjects?.length || 0;

    res.json({
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        qualification: teacher.qualification
      },
      load: {
        totalClasses,
        totalSubjects,
        totalStudents,
        classes: classLoads
      }
    });
  } catch (error: any) {
    console.error('Error fetching teacher load:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Sync all ManyToMany relationships to junction table
export const syncTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    console.log('[syncTeacherClasses] Starting sync of all teacher-class relationships...');
    
    await syncManyToManyToJunctionTable();
    
    res.json({ 
      message: 'Successfully synced all teacher-class relationships to junction table',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[syncTeacherClasses] Error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Diagnostic endpoint to check teacher-class relationships
export const diagnoseTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { teacherId } = req.params; // Can be UUID or TeacherID string
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const { Class } = await import('../entities/Class');
    const classRepository = AppDataSource.getRepository(Class);
    const { TeacherClass } = await import('../entities/TeacherClass');
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    // Find teacher
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let teacher: Teacher | null = null;
    
    if (uuidRegex.test(teacherId)) {
      teacher = await teacherRepository.findOne({ where: { id: teacherId } });
    } else {
      teacher = await teacherRepository.findOne({ where: { teacherId: teacherId } });
    }

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check junction table
    const junctionTableClasses = await teacherClassRepository.find({
      where: { teacherId: teacher.id },
      relations: ['class']
    });

    // Check ManyToMany relation
    const teacherWithClasses = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['classes']
    });

    // Check reverse relationship (classes that have this teacher)
    const allClasses = await classRepository.find({
      relations: ['teachers']
    });
    const classesWithThisTeacher = allClasses.filter(c => 
      c.teachers?.some((t: any) => t.id === teacher!.id)
    );

    res.json({
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        fullName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
      },
      junctionTable: {
        count: junctionTableClasses.length,
        classes: junctionTableClasses.map(tc => ({
          id: tc.class.id,
          name: tc.class.name
        }))
      },
      manyToMany: {
        count: teacherWithClasses?.classes?.length || 0,
        classes: teacherWithClasses?.classes?.map((c: any) => ({
          id: c.id,
          name: c.name
        })) || []
      },
      reverseRelationship: {
        count: classesWithThisTeacher.length,
        classes: classesWithThisTeacher.map(c => ({
          id: c.id,
          name: c.name
        }))
      },
      recommendation: junctionTableClasses.length === 0 && 
                       (teacherWithClasses?.classes?.length || 0) === 0 && 
                       classesWithThisTeacher.length === 0
        ? 'This teacher has no classes assigned. Assign classes through: Teachers > Edit Teacher > Select Classes, or Classes > Edit Class > Select Teachers'
        : 'Data found. If junction table is empty but ManyToMany has data, run sync endpoint.'
    });
  } catch (error: any) {
    console.error('[diagnoseTeacherClasses] Error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

// Create account for existing teacher
export const createTeacherAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const userRepository = AppDataSource.getRepository(User);

    const teacher = await teacherRepository.findOne({ where: { id } });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if teacher already has an account
    if (teacher.userId) {
      const existingUser = await userRepository.findOne({ where: { id: teacher.userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Teacher already has an account' });
      }
    }

    // Create temporary user account (username is TeacherID, password only, no email)
    const tempUsername = teacher.teacherId; // Username is the TeacherID
    const tempPassword = `temp_${teacher.teacherId}_${Date.now()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Check if the current user is a demo user
    const isDemo = req.user?.isDemo === true || 
                   req.user?.email === 'demo@school.com' || 
                   req.user?.username === 'demo@school.com';
    
    const accountRole = teacher.role === 'HOD' ? UserRole.HOD : UserRole.TEACHER;
    const user = userRepository.create({
      email: null, // Teachers don't require email
      username: tempUsername,
      password: hashedPassword,
      role: accountRole,
      mustChangePassword: true,
      isTemporaryAccount: true,
      isDemo: isDemo // Set isDemo flag based on creator
    });
    
    await userRepository.save(user);
    
    // Link teacher to user account
    teacher.userId = user.id;
    await teacherRepository.save(teacher);

    res.json({ 
      message: 'Account created successfully',
      temporaryCredentials: {
        username: tempUsername,
        password: tempPassword,
        note: 'Teacher must change password on first login. Login with username and password only.'
      }
    });
  } catch (error: any) {
    console.error('Error creating teacher account:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};
