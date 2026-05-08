import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { AppDataSource } from '../config/database';
import { Subject, SubjectCategory } from '../entities/Subject';
import { isDemoUser } from '../utils/demoDataFilter';
import { Teacher } from '../entities/Teacher';
import { In } from 'typeorm';
import { ensureDemoDataAvailable } from '../utils/demoDataEnsurer';
import { buildPaginationResponse, parsePaginationParams } from '../utils/pagination';
import { ensureSubjectDepartmentIdColumn } from '../utils/ensureSubjectDepartmentIdColumn';

const router = Router();

/** Map stored or legacy API values to canonical O_LEVEL | A_LEVEL for responses. */
function categoryForResponse(raw: string | null | undefined): SubjectCategory {
  const c = String(raw || '').toUpperCase();
  if (c === 'A_LEVEL' || c === 'AS_A_LEVEL') return 'A_LEVEL';
  return 'O_LEVEL';
}

/**
 * Parse category from request body. Accepts O_LEVEL, A_LEVEL, and legacy IGCSE / AS_A_LEVEL.
 */
function normalizeShortTitle(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 40);
}

function parseCategoryFromBody(raw: unknown, mode: 'create' | 'update'): SubjectCategory | 'INVALID' {
  if (mode === 'create' && (raw === undefined || raw === null || raw === '')) {
    return 'O_LEVEL';
  }
  if (mode === 'update' && (raw === undefined || raw === null || raw === '')) {
    return 'INVALID';
  }
  const s = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (s === 'O_LEVEL' || s === 'IGCSE') return 'O_LEVEL';
  if (s === 'A_LEVEL' || s === 'AS_A_LEVEL') return 'A_LEVEL';
  return 'INVALID';
}

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const subjectRepository = AppDataSource.getRepository(Subject);
    
    if (isDemoUser(req)) {
      await ensureDemoDataAvailable();
    }

    // Try to load with relations, but handle errors gracefully
    let subjects;
    try {
      subjects = await subjectRepository.find({
        relations: ['teachers', 'teachers.user', 'classes']
      });
    } catch (relationError: any) {
      console.error('[getSubjects] Error loading with relations:', relationError.message);
      console.error('[getSubjects] Error code:', relationError.code);
      console.error('[getSubjects] Error stack:', relationError.stack);
      
      // Check if it's a column error (missing category column)
      const isColumnError = relationError.message?.includes('column') ||
                           relationError.message?.includes('does not exist') ||
                           relationError.code === '42703'; // PostgreSQL: undefined column
      
      if (isColumnError) {
        console.log('[getSubjects] Column error detected, trying to fix schema...');
        try {
          await ensureSubjectDepartmentIdColumn(AppDataSource);
        } catch (depColErr: any) {
          console.warn('[getSubjects] ensureSubjectDepartmentIdColumn:', depColErr?.message || depColErr);
        }
        // Try to add the category column if it doesn't exist
        try {
          const queryRunner = AppDataSource.createQueryRunner();
          await queryRunner.connect();
          const hasColumn = await queryRunner.hasColumn('subjects', 'category');
          if (!hasColumn) {
            console.log('[getSubjects] Adding category column to subjects table...');
            await queryRunner.query(
              `ALTER TABLE "subjects" ADD COLUMN "category" character varying NOT NULL DEFAULT 'O_LEVEL'`
            );
            console.log('[getSubjects] Category column added successfully');
          }
          await queryRunner.release();
          
          // Retry the query
          subjects = await subjectRepository.find({
            relations: ['teachers', 'teachers.user', 'classes']
          });
        } catch (fixError: any) {
          console.error('[getSubjects] Error fixing schema:', fixError.message);
          // Fallback: load without relations
          try {
            subjects = await subjectRepository.find();
            subjects = subjects.map((s: any) => ({
              ...s,
              category: categoryForResponse(s.category),
              teachers: [],
              classes: []
            }));
          } catch (fallbackError: any) {
            console.error('[getSubjects] Fallback query also failed:', fallbackError.message);
            throw relationError; // Throw original error
          }
        }
      } else {
        // For other errors, try fallback before rethrowing
        console.log('[getSubjects] Non-column error, trying fallback...');
        try {
          subjects = await subjectRepository.find();
          subjects = subjects.map((s: any) => ({
            ...s,
            teachers: [],
            classes: []
          }));
        } catch (fallbackError: any) {
          console.error('[getSubjects] Fallback failed, rethrowing original error');
          throw relationError;
        }
      }
    }
    
    const pagination = parsePaginationParams(req.query);
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    // Ensure all subjects have category field
    let normalizedSubjects = (subjects || []).map((s: any) => ({
      ...s,
      category: categoryForResponse(s.category)
    }));

    if (searchQuery) {
      normalizedSubjects = normalizedSubjects.filter((subject: any) => {
        const name = (subject.name || '').toLowerCase();
        const code = (subject.code || '').toLowerCase();
        const description = (subject.description || '').toLowerCase();
        const shortT = (subject.shortTitle || '').toLowerCase();
        return (
          name.includes(searchQuery) ||
          code.includes(searchQuery) ||
          description.includes(searchQuery) ||
          shortT.includes(searchQuery)
        );
      });
    }
    
    if (pagination.isPaginated) {
      const total = normalizedSubjects.length;
      const paged = normalizedSubjects.slice(pagination.skip, pagination.skip + pagination.limit);
      return res.json(buildPaginationResponse(paged, pagination.page, pagination.limit, total));
    }
    
    res.json(normalizedSubjects);
  } catch (error: any) {
    console.error('[getSubjects] Final error:', error);
    console.error('[getSubjects] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      code: error.code
    });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const subjectRepository = AppDataSource.getRepository(Subject);
    const subject = await subjectRepository.findOne({
      where: { id },
      relations: ['teachers', 'classes']
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    const { name, code, description, category, shortTitle } = req.body;
    const subjectRepository = AppDataSource.getRepository(Subject);
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Subject name is required' });
    }

    if (!code) {
      return res.status(400).json({ message: 'Subject code is required and must be unique' });
    }

    const parsedCat = parseCategoryFromBody(category, 'create');
    if (parsedCat === 'INVALID') {
      return res.status(400).json({ message: 'Invalid subject category. Allowed values: O Level, A Level' });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check if code is unique
    const existingSubject = await subjectRepository.findOne({ where: { code: normalizedCode } });
    if (existingSubject) {
      return res.status(400).json({ message: 'Subject code already exists' });
    }

    const subject = subjectRepository.create({
      name: name.trim(),
      code: normalizedCode,
      description,
      shortTitle: normalizeShortTitle(shortTitle),
      category: parsedCat as SubjectCategory,
    });
    await subjectRepository.save(subject);
    res.status(201).json({ message: 'Subject created successfully', subject });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Subject code must be unique' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, isActive, category, shortTitle } = req.body;
    const subjectRepository = AppDataSource.getRepository(Subject);

    const subject = await subjectRepository.findOne({ where: { id } });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Check if code is being changed and validate uniqueness
    if (code !== undefined) {
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== subject.code) {
        // Check if the new code already exists (excluding current subject)
        const existingSubject = await subjectRepository.findOne({ 
          where: { code: normalizedCode },
          relations: []
        });
        if (existingSubject && existingSubject.id !== id) {
          return res.status(400).json({ message: 'Subject code already exists' });
        }
        subject.code = normalizedCode;
      }
    }

    // Update fields
    if (name !== undefined) subject.name = name;
    if (description !== undefined) subject.description = description;
    if (isActive !== undefined) subject.isActive = isActive;
    if (category !== undefined) {
      if (category === null || category === '') {
        return res.status(400).json({ message: 'Invalid subject category. Allowed values: O Level, A Level' });
      }
      const parsedCat = parseCategoryFromBody(category, 'update');
      if (parsedCat === 'INVALID') {
        return res.status(400).json({ message: 'Invalid subject category. Allowed values: O Level, A Level' });
      }
      subject.category = parsedCat;
    }
    if (shortTitle !== undefined) {
      subject.shortTitle = normalizeShortTitle(shortTitle);
    }

    await subjectRepository.save(subject);
    res.json({ message: 'Subject updated successfully', subject });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Subject code must be unique' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), async (req, res) => {
  try {
    const { id } = req.params;
    const subjectRepository = AppDataSource.getRepository(Subject);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    const subject = await subjectRepository.findOne({
      where: { id },
      relations: ['teachers', 'classes']
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Check if subject has associated teachers or classes
    const teacherCount = subject.teachers?.length || 0;
    const classCount = subject.classes?.length || 0;

    if (teacherCount > 0 || classCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete subject with associated records',
        details: {
          teachers: teacherCount,
          classes: classCount
        }
      });
    }

    // Delete the subject
    await subjectRepository.remove(subject);
    res.json({ message: 'Subject deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

