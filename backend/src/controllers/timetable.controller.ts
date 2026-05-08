import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { TimetableConfig } from '../entities/TimetableConfig';
import { TimetableSlot } from '../entities/TimetableSlot';
import { TimetableVersion } from '../entities/TimetableVersion';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { In, Not } from 'typeorm';
import { TeacherClass } from '../entities/TeacherClass';
import { TeacherContractLesson } from '../entities/TeacherContractLesson';
import { createTimetablePDF } from '../utils/timetablePdfGenerator';
import {
  calculateTeachingPeriodTimes,
  teachingPeriodIndicesFollowedByConfiguredBreak,
} from '../utils/timetablePeriodTimes';
import { mergeSubjectLessonsPerWeekForActiveConfig } from '../utils/timetableMergeSubjectLessons';
import { mergeJunctionClassesIntoTeachers } from '../utils/teacherClassLinker';
import { loadContractLessonsForGeneration } from '../utils/teacherContractLesson';

/** Fisher–Yates shuffle (copy) — used to randomize slot placement order. */
function shuffleArray<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Get or create active timetable configuration
export const getTimetableConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const configRepository = AppDataSource.getRepository(TimetableConfig);
    let config = await configRepository.findOne({ where: { isActive: true } });

    if (!config) {
      // Create default configuration
      config = configRepository.create({
        periodsPerDay: 8,
        schoolStartTime: '08:00',
        schoolEndTime: '16:00',
        periodDurationMinutes: 40,
        breakPeriods: [
          { name: 'Tea Break', startTime: '10:30', endTime: '11:00', durationMinutes: 30 },
          { name: 'Lunch', startTime: '13:00', endTime: '14:00', durationMinutes: 60 }
        ],
        daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        isActive: true
      });
      await configRepository.save(config);
    }

    res.json(config);
  } catch (error: any) {
    console.error('[getTimetableConfig] Error:', error);
    res.status(500).json({ message: 'Failed to fetch timetable configuration', error: error.message });
  }
};

// Save or update timetable configuration
export const saveTimetableConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const existingConfig = await configRepository.findOne({ where: { isActive: true } });

    const configData = {
      periodsPerDay: req.body.periodsPerDay || 8,
      schoolStartTime: req.body.schoolStartTime || '08:00',
      schoolEndTime: req.body.schoolEndTime || '16:00',
      periodDurationMinutes: req.body.periodDurationMinutes || 40,
      breakPeriods: req.body.breakPeriods || [],
      lessonsPerWeek: req.body.lessonsPerWeek || {},
      daysOfWeek: req.body.daysOfWeek || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      additionalPreferences: req.body.additionalPreferences || {},
      isActive: true
    };

    if (existingConfig) {
      Object.assign(existingConfig, configData);
      await configRepository.save(existingConfig);
      res.json({ message: 'Timetable configuration updated successfully', config: existingConfig });
    } else {
      const newConfig = configRepository.create(configData);
      await configRepository.save(newConfig);
      res.json({ message: 'Timetable configuration created successfully', config: newConfig });
    }
  } catch (error: any) {
    console.error('[saveTimetableConfig] Error:', error);
    res.status(500).json({ message: 'Failed to save timetable configuration', error: error.message });
  }
};

/** Merge one subject's lessons/week into the active config (same data as Timetable → Configuration). */
export const mergeSubjectLessonsInActiveConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { subjectId, lessonsPerWeek } = req.body;
    if (subjectId === undefined || subjectId === null || String(subjectId).trim() === '') {
      return res.status(400).json({ message: 'subjectId is required' });
    }

    const config = await mergeSubjectLessonsPerWeekForActiveConfig(
      String(subjectId),
      lessonsPerWeek !== undefined && lessonsPerWeek !== null ? Number(lessonsPerWeek) : 3
    );

    res.json({
      message: 'Lessons per week updated for this subject timetable configuration.',
      config,
    });
  } catch (error: any) {
    console.error('[mergeSubjectLessonsInActiveConfig]', error);
    res.status(500).json({
      message: 'Failed to update lessons per week',
      error: error.message || 'Unknown error',
    });
  }
};

/** Only one version may be active; used after generate and by the manual activate endpoint. */
async function setSingleActiveTimetableVersion(versionId: string): Promise<void> {
  const versionRepository = AppDataSource.getRepository(TimetableVersion);
  await versionRepository
    .createQueryBuilder()
    .update(TimetableVersion)
    .set({ isActive: false })
    .execute();
  await versionRepository.update({ id: versionId }, { isActive: true });
}

// Generate timetable
export const generateTimetable = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionName, description } = req.body;

    console.log('[generateTimetable] Starting timetable generation...');

    // Get active configuration
    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const config = await configRepository.findOne({ where: { isActive: true } });

    if (!config) {
      console.error('[generateTimetable] No active configuration found');
      return res.status(400).json({ message: 'No active timetable configuration found. Please configure the timetable first.' });
    }

    const configDays = config.daysOfWeek?.filter((d) => String(d).trim() !== '') || [];
    if (!config.periodsPerDay || config.periodsPerDay < 1) {
      return res.status(400).json({
        message:
          'Timetable configuration must have at least one period per day. Open Configuration and set periods per day before generating.',
      });
    }
    if (configDays.length === 0) {
      return res.status(400).json({
        message:
          'Timetable configuration must include at least one school day. Open Configuration and select days of the week.',
      });
    }

    console.log('[generateTimetable] Found active configuration:', config.id);

    // All teachers, classes, and subjects (active or not) so one generate covers the whole school
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);

    const teachers = await teacherRepository.find({
      relations: ['classes', 'subjects']
    });

    await mergeJunctionClassesIntoTeachers(teachers);

    const classes = await classRepository.find({
      relations: ['subjects', 'teachers']
    });

    const subjects = await subjectRepository.find();

    if (teachers.length === 0 || classes.length === 0 || subjects.length === 0) {
      return res.status(400).json({
        message:
          'Insufficient data to generate timetable. Add at least one teacher, one class, and one subject in the system.',
      });
    }

    console.log(`[generateTimetable] Found ${teachers.length} teachers, ${classes.length} classes, ${subjects.length} subjects`);
    
    // Try to query TeacherClass junction table for logging (optional - table might not exist)
    try {
      const { TeacherClass } = await import('../entities/TeacherClass');
      const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
      const teacherClassAssignments = await teacherClassRepository.find({
        relations: ['teacher', 'class']
      });
      console.log(`[generateTimetable] Found ${teacherClassAssignments.length} teacher-class assignments in junction table`);
      
      // Log assignment summary
      const assignmentSummary = teacherClassAssignments.map(tc => ({
        teacher: `${tc.teacher?.firstName} ${tc.teacher?.lastName}`,
        class: tc.class?.name
      }));
      console.log(`[generateTimetable] Assignment summary:`, assignmentSummary);
    } catch (junctionError: any) {
      // Junction table might not exist - that's okay, we'll use ManyToMany relationships instead
      console.log(`[generateTimetable] Junction table not available, using ManyToMany relationships: ${junctionError.message}`);
      
      // Log assignment summary from ManyToMany relationships
      const assignmentSummary: any[] = [];
      teachers.forEach(teacher => {
        teacher.classes?.forEach(classEntity => {
          assignmentSummary.push({
            teacher: `${teacher.firstName} ${teacher.lastName}`,
            class: classEntity.name
          });
        });
      });
      console.log(`[generateTimetable] Assignment summary (from ManyToMany):`, assignmentSummary);
    }

    // Create new timetable version
    console.log('[generateTimetable] Creating timetable version...');
    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    
    try {
      // Create version - try with configId first, fallback without it if column doesn't exist
      let version: TimetableVersion;
      try {
        version = versionRepository.create({
          name: versionName || `Timetable ${new Date().toLocaleDateString()}`,
          description: description || null,
          configId: config.id,
          isActive: false,
          isPublished: false,
          createdBy: req.user?.id || null
        });
        await versionRepository.save(version);
      } catch (configIdError: any) {
        // If error is about configId column not existing, try without it
        if (configIdError.message?.includes('configId') || configIdError.code === '42703') {
          console.warn('[generateTimetable] configId column may not exist, creating version without it');
          version = versionRepository.create({
            name: versionName || `Timetable ${new Date().toLocaleDateString()}`,
            description: description || null,
            isActive: false,
            isPublished: false,
            createdBy: req.user?.id || null
          });
          await versionRepository.save(version);
        } else {
          throw configIdError;
        }
      }
      console.log('[generateTimetable] Created version:', version.id);
      
      // Generate timetable slots
      console.log('[generateTimetable] Generating timetable slots...');
      const teacherContractLines = await loadContractLessonsForGeneration(teachers.map((t) => t.id));
      const slots = await generateTimetableSlots(
        config,
        teachers,
        classes,
        subjects,
        version.id,
        teacherContractLines
      );
      console.log(`[generateTimetable] Generated ${slots.length} slots`);

      if (slots.length === 0) {
        await versionRepository.remove(version);
        console.warn('[generateTimetable] Removed empty version after scheduler placed no lessons');
        return res.status(400).json({
          message:
            'No lessons could be placed on the timetable. Increase periods per day, reduce weekly lessons per subject in configuration, or check teacher–class–subject assignments—then generate again.',
          help: [
            'Configuration: Periods per day should match how many teaching slots exist each day.',
            'Configuration: Lower lessons-per-week if the grid is too small for all subjects.',
            'Every class subject needs one teacher who is assigned to that class and teaches that subject.',
            'Versions with zero saved lessons cannot show a preview; generate again after fixing the above.',
          ],
        });
      }

      // Save all slots
      console.log('[generateTimetable] Saving slots to database...');
      const slotRepository = AppDataSource.getRepository(TimetableSlot);
      await slotRepository.save(slots);
      console.log('[generateTimetable] Slots saved successfully');

      await setSingleActiveTimetableVersion(version.id);
      console.log('[generateTimetable] New version is now active; all others deactivated');

      // Fetch the complete version with slots
      const completeVersion = await versionRepository.findOne({
        where: { id: version.id },
        relations: ['slots', 'slots.teacher', 'slots.class', 'slots.subject']
      });

      res.json({
        message: 'Timetable generated successfully',
        version: completeVersion,
        stats: {
          totalSlots: slots.length,
          teachers: teachers.length,
          classes: classes.length,
          subjects: subjects.length
        }
      });
    } catch (versionError: any) {
      console.error('[generateTimetable] Error creating/saving version:', versionError);
      console.error('[generateTimetable] Error details:', {
        message: versionError.message,
        code: versionError.code,
        constraint: versionError.constraint,
        table: versionError.table
      });
      throw versionError; // Re-throw to be caught by outer catch
    }

  } catch (error: any) {
    console.error('[generateTimetable] Error:', error);
    console.error('[generateTimetable] Error stack:', error.stack);
    
    // If it's the "no assignments" error, include diagnostics
    if (error.diagnostics) {
      return res.status(400).json({ 
        message: error.message,
        diagnostics: error.diagnostics,
        help: [
          '1. Go to Teachers > Edit Teacher > Select Classes (assign teachers to classes)',
          '2. Go to Teachers > Edit Teacher > Select Subjects (assign subjects to teachers)',
          '3. Go to Classes > Edit Class > Select Subjects (assign subjects to classes)',
          '4. Ensure at least one teacher is assigned to a class AND teaches a subject that the class has'
        ]
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to generate timetable', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/** True if adding/moving a lesson to (day, period) would break the same-class-per-day rule for this teacher. */
function teacherClassDayRuleViolated(
  existingSameTeacherClassDay: TimetableSlot[],
  proposedPeriod: number
): boolean {
  const teaching = existingSameTeacherClassDay.filter((s) => !s.isBreak);
  if (teaching.length === 0) {
    return false;
  }
  if (teaching.length >= 2) {
    return true;
  }
  return Math.abs(teaching[0].periodNumber - proposedPeriod) !== 1;
}

// Helper function to generate timetable slots
async function generateTimetableSlots(
  config: TimetableConfig,
  teachers: Teacher[],
  classes: Class[],
  subjects: Subject[],
  versionId: string,
  teacherContractLines: import('../entities/TeacherContractLesson').TeacherContractLesson[] = []
): Promise<TimetableSlot[]> {
  const slots: TimetableSlot[] = [];
  const daysOfWeek = [...(config.daysOfWeek || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])];
  
  // Build teacher-class-subject assignments using existing database relationships
  const assignments: Array<{
    teacher: Teacher;
    class: Class;
    subject: Subject;
    lessonsPerWeek: number;
    /** When true, periods are placed in same-day pairs (p, p+1) with no break between p and p+1. */
    isPairedDouble: boolean;
  }> = [];

  console.log('[generateTimetableSlots] Building teacher-class-subject assignments...');
  console.log(`[generateTimetableSlots] Processing ${classes.length} classes, ${teachers.length} teachers`);

  // Log what we have
  teachers.forEach(teacher => {
    const classCount = teacher.classes?.length || 0;
    const subjectCount = teacher.subjects?.length || 0;
    console.log(`[generateTimetableSlots] Teacher: ${teacher.firstName} ${teacher.lastName} - Classes: ${classCount}, Subjects: ${subjectCount}`);
    if (classCount > 0) {
      console.log(`  Classes: ${teacher.classes?.map(c => c.name).join(', ') || 'none'}`);
    }
    if (subjectCount > 0) {
      console.log(`  Subjects: ${teacher.subjects?.map(s => s.name).join(', ') || 'none'}`);
    }
  });

  classes.forEach(classEntity => {
    const subjectCount = classEntity.subjects?.length || 0;
    const teacherCount = classEntity.teachers?.length || 0;
    console.log(`[generateTimetableSlots] Class: ${classEntity.name} - Subjects: ${subjectCount}, Teachers: ${teacherCount}`);
    if (subjectCount > 0) {
      console.log(`  Subjects: ${classEntity.subjects?.map(s => s.name).join(', ') || 'none'}`);
    }
  });

  // For each class, find which teachers teach which subjects
  for (const classEntity of classes) {
    if (!classEntity.subjects || classEntity.subjects.length === 0) {
      console.warn(`[generateTimetableSlots] Class ${classEntity.name} has no subjects assigned`);
      continue;
    }

    for (const subject of classEntity.subjects) {
      // Find teachers who:
      // 1. Are assigned to this class (via ManyToMany or TeacherClass junction table)
      // 2. Teach this subject (via ManyToMany subjects relation)
      const eligibleTeachers = teachers.filter(teacher => {
        // Check if teacher teaches this subject
        const teachesSubject = teacher.subjects?.some(s => s.id === subject.id) || false;
        if (!teachesSubject) {
          console.log(`[generateTimetableSlots] Teacher ${teacher.firstName} ${teacher.lastName} does not teach ${subject.name}`);
          return false;
        }

        // Check if teacher is assigned to this class
        const assignedToClass = teacher.classes?.some(c => c.id === classEntity.id) || false;
        if (!assignedToClass) {
          console.log(`[generateTimetableSlots] Teacher ${teacher.firstName} ${teacher.lastName} is not assigned to ${classEntity.name}`);
          return false;
        }
        
        return true;
      });

      if (eligibleTeachers.length > 0) {
        // Use first eligible teacher (can be enhanced to distribute evenly)
        const teacher = eligibleTeachers[0];
        const linesForTriple = teacherContractLines.filter(
          (l) =>
            l.teacherId === teacher.id &&
            l.classId === classEntity.id &&
            l.subjectId === subject.id
        );

        if (linesForTriple.length > 0) {
          for (const line of linesForTriple) {
            const isDouble = line.isDoublePeriod === true;
            const spw = Math.max(1, line.sessionsPerWeek || 1);
            const lessonsPerWeek = Math.min(100, Math.max(1, spw * (isDouble ? 2 : 1)));

            assignments.push({
              teacher,
              class: classEntity,
              subject,
              lessonsPerWeek,
              isPairedDouble: isDouble,
            });

            console.log(
              `[generateTimetableSlots] ✓ Assignment (contract line): ${teacher.firstName} ${teacher.lastName} -> ${classEntity.name} -> ${subject.name} (${lessonsPerWeek} periods/week${isDouble ? ', double' : ''})`
            );
          }
        } else {
          const baseLpw = config.lessonsPerWeek?.[subject.id] || 3;
          const lessonsPerWeek = Math.min(100, Math.max(1, baseLpw));

          assignments.push({
            teacher,
            class: classEntity,
            subject,
            lessonsPerWeek,
            isPairedDouble: false,
          });

          console.log(
            `[generateTimetableSlots] ✓ Assignment (config fallback): ${teacher.firstName} ${teacher.lastName} -> ${classEntity.name} -> ${subject.name} (${lessonsPerWeek} periods/week)`
          );
        }
      } else {
        console.warn(`[generateTimetableSlots] ✗ No eligible teacher found for ${classEntity.name} - ${subject.name}`);
        console.warn(`  Requirements: Teacher must be assigned to ${classEntity.name} AND teach ${subject.name}`);
      }
    }
  }

  if (assignments.length === 0) {
    // Build diagnostic information
    const diagnostics: any = {
      teachers: teachers.map(t => ({
        name: `${t.firstName} ${t.lastName}`,
        isActive: t.isActive,
        classesCount: t.classes?.length || 0,
        classes: t.classes?.map(c => c.name) || [],
        subjectsCount: t.subjects?.length || 0,
        subjects: t.subjects?.map(s => s.name) || []
      })),
      classes: classes.map(c => ({
        name: c.name,
        isActive: c.isActive,
        subjectsCount: c.subjects?.length || 0,
        subjects: c.subjects?.map(s => s.name) || [],
        teachersCount: c.teachers?.length || 0,
        teachers: c.teachers?.map(t => `${t.firstName} ${t.lastName}`) || []
      })),
      issues: [] as string[]
    };

    // Identify specific issues
    const teachersWithoutClasses = teachers.filter(t => !t.classes || t.classes.length === 0);
    const teachersWithoutSubjects = teachers.filter(t => !t.subjects || t.subjects.length === 0);
    const classesWithoutSubjects = classes.filter(c => !c.subjects || c.subjects.length === 0);

    if (teachersWithoutClasses.length > 0) {
      diagnostics.issues.push(`${teachersWithoutClasses.length} teacher(s) have no classes assigned: ${teachersWithoutClasses.map(t => `${t.firstName} ${t.lastName}`).join(', ')}`);
    }
    if (teachersWithoutSubjects.length > 0) {
      diagnostics.issues.push(`${teachersWithoutSubjects.length} teacher(s) have no subjects assigned: ${teachersWithoutSubjects.map(t => `${t.firstName} ${t.lastName}`).join(', ')}`);
    }
    if (classesWithoutSubjects.length > 0) {
      diagnostics.issues.push(`${classesWithoutSubjects.length} class(es) have no subjects assigned: ${classesWithoutSubjects.map(c => c.name).join(', ')}`);
    }

    // Check for mismatches
    const mismatches: string[] = [];
    classes.forEach(classEntity => {
      if (classEntity.subjects && classEntity.subjects.length > 0) {
        classEntity.subjects.forEach(subject => {
          const hasTeacher = teachers.some(
            (teacher) =>
              teacher.subjects?.some((s) => s.id === subject.id) &&
              teacher.classes?.some((c) => c.id === classEntity.id)
          );
          if (!hasTeacher) {
            mismatches.push(`No teacher found for ${classEntity.name} - ${subject.name}`);
          }
        });
      }
    });
    if (mismatches.length > 0) {
      diagnostics.issues.push(...mismatches);
    }

    console.error('[generateTimetableSlots] No assignments found. Diagnostics:', JSON.stringify(diagnostics, null, 2));
    
    const error: any = new Error('No teacher-class-subject assignments found. Please configure teacher-class-subject relationships first.');
    error.diagnostics = diagnostics;
    throw error;
  }

  console.log(`[generateTimetableSlots] Total assignments: ${assignments.length}`);

  // Create a conflict-free schedule
  const teacherSchedule: Map<string, Set<string>> = new Map(); // teacherId -> Set of "day-period"
  const classSchedule: Map<string, Set<string>> = new Map(); // classId -> Set of "day-period"


  // Initialize schedules
  teachers.forEach(t => teacherSchedule.set(t.id, new Set()));
  classes.forEach(c => classSchedule.set(c.id, new Set()));

  // Calculate time slots
  const timeSlots = calculateTeachingPeriodTimes(config);
  /** Period indices p where (p, p+1) is split by a configured break — invalid for double blocks. */
  const breakBetweenTeachingPeriods = teachingPeriodIndicesFollowedByConfiguredBreak(config);

  // Distribute assignments across the week using a more systematic approach
  // Sort assignments by lessons per week (descending) to prioritize subjects with more lessons
  assignments.sort((a, b) => b.lessonsPerWeek - a.lessonsPerWeek);

  for (const assignment of assignments) {
    let lessonsPlaced = 0;
    const maxAttempts = daysOfWeek.length * config.periodsPerDay * 40;
    let attempts = 0;

    const lessonsPerDay = Math.ceil(assignment.lessonsPerWeek / daysOfWeek.length);
    const dayDistribution: Map<string, number> = new Map();
    daysOfWeek.forEach((day) => dayDistribution.set(day, 0));

    /** Prefer different period indices across the week for this class+subject (stops “same column every day”). */
    const periodsUsedThisAssignment = new Set<number>();

    const tryPlaceDoubleLesson = (relaxDayCap: boolean): boolean => {
      if (assignment.lessonsPerWeek - lessonsPlaced < 2) {
        return false;
      }
      const candidates: { day: string; p: number }[] = [];
      for (const day of daysOfWeek) {
        const usedDay = dayDistribution.get(day) || 0;
        if (!relaxDayCap && usedDay + 2 > lessonsPerDay) {
          continue;
        }
        for (let p = 1; p < config.periodsPerDay; p++) {
          if (breakBetweenTeachingPeriods.has(p)) {
            continue;
          }
          candidates.push({ day, p });
        }
      }
      const preferred = candidates.filter(
        (c) => !periodsUsedThisAssignment.has(c.p) && !periodsUsedThisAssignment.has(c.p + 1)
      );
      const fallback = candidates.filter(
        (c) => periodsUsedThisAssignment.has(c.p) || periodsUsedThisAssignment.has(c.p + 1)
      );
      const ordered = [...shuffleArray(preferred), ...shuffleArray(fallback)];

      for (const { day, p } of ordered) {
        const key1 = `${day}-${p}`;
        const key2 = `${day}-${p + 1}`;
        if (
          teacherSchedule.get(assignment.teacher.id)?.has(key1) ||
          teacherSchedule.get(assignment.teacher.id)?.has(key2) ||
          classSchedule.get(assignment.class.id)?.has(key1) ||
          classSchedule.get(assignment.class.id)?.has(key2)
        ) {
          continue;
        }

        const existingTc = slots.filter(
          (s) =>
            s.dayOfWeek === day &&
            s.teacherId === assignment.teacher.id &&
            s.classId === assignment.class.id &&
            !s.isBreak
        );
        if (existingTc.length > 0) {
          continue;
        }

        if (teacherClassDayRuleViolated(existingTc, p)) {
          continue;
        }
        const probe = new TimetableSlot();
        probe.periodNumber = p;
        probe.isBreak = false;
        if (teacherClassDayRuleViolated([...existingTc, probe], p + 1)) {
          continue;
        }

        const ts1 = timeSlots[p - 1];
        const ts2 = timeSlots[p];
        if (!ts1 || !ts2) {
          continue;
        }

        teacherSchedule.get(assignment.teacher.id)!.add(key1);
        teacherSchedule.get(assignment.teacher.id)!.add(key2);
        classSchedule.get(assignment.class.id)!.add(key1);
        classSchedule.get(assignment.class.id)!.add(key2);

        const pushSlot = (periodNum: number, ts: { startTime: string; endTime: string }) => {
          const slot = new TimetableSlot();
          slot.versionId = versionId;
          slot.teacherId = assignment.teacher.id;
          slot.classId = assignment.class.id;
          slot.subjectId = assignment.subject.id;
          slot.dayOfWeek = day;
          slot.periodNumber = periodNum;
          slot.startTime = ts.startTime;
          slot.endTime = ts.endTime;
          slot.isBreak = false;
          slot.isManuallyEdited = false;
          slots.push(slot);
        };
        pushSlot(p, ts1);
        pushSlot(p + 1, ts2);

        lessonsPlaced += 2;
        dayDistribution.set(day, (dayDistribution.get(day) || 0) + 2);
        periodsUsedThisAssignment.add(p);
        periodsUsedThisAssignment.add(p + 1);
        return true;
      }
      return false;
    };

    const tryPlaceOneLesson = (relaxDayCap: boolean): boolean => {
      const candidates: { day: string; period: number }[] = [];
      for (const day of daysOfWeek) {
        if (!relaxDayCap && (dayDistribution.get(day) || 0) >= lessonsPerDay) {
          continue;
        }
        for (let period = 1; period <= config.periodsPerDay; period++) {
          candidates.push({ day, period });
        }
      }

      const preferred = candidates.filter((c) => !periodsUsedThisAssignment.has(c.period));
      const fallback = candidates.filter((c) => periodsUsedThisAssignment.has(c.period));
      const ordered = [...shuffleArray(preferred), ...shuffleArray(fallback)];

      for (const { day, period } of ordered) {
        const slotKey = `${day}-${period}`;

        if (
          teacherSchedule.get(assignment.teacher.id)?.has(slotKey) ||
          classSchedule.get(assignment.class.id)?.has(slotKey)
        ) {
          continue;
        }

        const existingTc = slots.filter(
          (s) =>
            s.dayOfWeek === day &&
            s.teacherId === assignment.teacher.id &&
            s.classId === assignment.class.id &&
            !s.isBreak
        );
        if (teacherClassDayRuleViolated(existingTc, period)) {
          continue;
        }

        const timeSlot = timeSlots[period - 1];
        if (!timeSlot) {
          console.error(`[generateTimetableSlots] No time slot found for period ${period}`);
          continue;
        }

        teacherSchedule.get(assignment.teacher.id)!.add(slotKey);
        classSchedule.get(assignment.class.id)!.add(slotKey);

        const slot = new TimetableSlot();
        slot.versionId = versionId;
        slot.teacherId = assignment.teacher.id;
        slot.classId = assignment.class.id;
        slot.subjectId = assignment.subject.id;
        slot.dayOfWeek = day;
        slot.periodNumber = period;
        slot.startTime = timeSlot.startTime;
        slot.endTime = timeSlot.endTime;
        slot.isBreak = false;
        slot.isManuallyEdited = false;

        slots.push(slot);
        lessonsPlaced++;
        dayDistribution.set(day, (dayDistribution.get(day) || 0) + 1);
        periodsUsedThisAssignment.add(period);
        return true;
      }
      return false;
    };

    if (assignment.isPairedDouble) {
      while (lessonsPlaced < assignment.lessonsPerWeek && attempts < maxAttempts) {
        attempts++;

        if (tryPlaceDoubleLesson(false)) {
          continue;
        }
        if (tryPlaceDoubleLesson(true)) {
          continue;
        }

        if (assignment.lessonsPerWeek - lessonsPlaced < 2) {
          break;
        }

        const day = daysOfWeek[Math.floor(Math.random() * daysOfWeek.length)];
        const maxP = Math.max(1, config.periodsPerDay - 1);
        const p = 1 + Math.floor(Math.random() * maxP);
        if (breakBetweenTeachingPeriods.has(p)) {
          continue;
        }

        const key1 = `${day}-${p}`;
        const key2 = `${day}-${p + 1}`;
        if (
          teacherSchedule.get(assignment.teacher.id)?.has(key1) ||
          teacherSchedule.get(assignment.teacher.id)?.has(key2) ||
          classSchedule.get(assignment.class.id)?.has(key1) ||
          classSchedule.get(assignment.class.id)?.has(key2)
        ) {
          continue;
        }

        const existingTcFb = slots.filter(
          (s) =>
            s.dayOfWeek === day &&
            s.teacherId === assignment.teacher.id &&
            s.classId === assignment.class.id &&
            !s.isBreak
        );
        if (existingTcFb.length > 0) {
          continue;
        }

        const probeFb = new TimetableSlot();
        probeFb.periodNumber = p;
        probeFb.isBreak = false;
        if (teacherClassDayRuleViolated(existingTcFb, p) || teacherClassDayRuleViolated([...existingTcFb, probeFb], p + 1)) {
          continue;
        }

        const tsA = timeSlots[p - 1];
        const tsB = timeSlots[p];
        if (!tsA || !tsB) {
          continue;
        }

        teacherSchedule.get(assignment.teacher.id)!.add(key1);
        teacherSchedule.get(assignment.teacher.id)!.add(key2);
        classSchedule.get(assignment.class.id)!.add(key1);
        classSchedule.get(assignment.class.id)!.add(key2);

        const pushPairSlot = (periodNum: number, ts: { startTime: string; endTime: string }) => {
          const slot = new TimetableSlot();
          slot.versionId = versionId;
          slot.teacherId = assignment.teacher.id;
          slot.classId = assignment.class.id;
          slot.subjectId = assignment.subject.id;
          slot.dayOfWeek = day;
          slot.periodNumber = periodNum;
          slot.startTime = ts.startTime;
          slot.endTime = ts.endTime;
          slot.isBreak = false;
          slot.isManuallyEdited = false;
          slots.push(slot);
        };
        pushPairSlot(p, tsA);
        pushPairSlot(p + 1, tsB);

        lessonsPlaced += 2;
        dayDistribution.set(day, (dayDistribution.get(day) || 0) + 2);
        periodsUsedThisAssignment.add(p);
        periodsUsedThisAssignment.add(p + 1);
      }
    } else {
      while (lessonsPlaced < assignment.lessonsPerWeek && attempts < maxAttempts) {
        attempts++;

        if (tryPlaceOneLesson(false)) {
          continue;
        }
        if (tryPlaceOneLesson(true)) {
          continue;
        }

        const day = daysOfWeek[Math.floor(Math.random() * daysOfWeek.length)];
        const period = Math.floor(Math.random() * config.periodsPerDay) + 1;
        const slotKey = `${day}-${period}`;

        if (
          teacherSchedule.get(assignment.teacher.id)?.has(slotKey) ||
          classSchedule.get(assignment.class.id)?.has(slotKey)
        ) {
          continue;
        }

        const existingTcFallback = slots.filter(
          (s) =>
            s.dayOfWeek === day &&
            s.teacherId === assignment.teacher.id &&
            s.classId === assignment.class.id &&
            !s.isBreak
        );
        if (teacherClassDayRuleViolated(existingTcFallback, period)) {
          continue;
        }

        const timeSlot = timeSlots[period - 1];
        if (!timeSlot) {
          console.error(`[generateTimetableSlots] No time slot found for period ${period}`);
          continue;
        }

        teacherSchedule.get(assignment.teacher.id)!.add(slotKey);
        classSchedule.get(assignment.class.id)!.add(slotKey);

        const slot = new TimetableSlot();
        slot.versionId = versionId;
        slot.teacherId = assignment.teacher.id;
        slot.classId = assignment.class.id;
        slot.subjectId = assignment.subject.id;
        slot.dayOfWeek = day;
        slot.periodNumber = period;
        slot.startTime = timeSlot.startTime;
        slot.endTime = timeSlot.endTime;
        slot.isBreak = false;
        slot.isManuallyEdited = false;

        slots.push(slot);
        lessonsPlaced++;
        dayDistribution.set(day, (dayDistribution.get(day) || 0) + 1);
        periodsUsedThisAssignment.add(period);
      }
    }

    if (lessonsPlaced < assignment.lessonsPerWeek) {
      console.warn(
        `[generateTimetableSlots] Could not place all lessons for ${assignment.teacher.firstName} ${assignment.teacher.lastName} - ${assignment.class.name} - ${assignment.subject.name}. Placed ${lessonsPlaced}/${assignment.lessonsPerWeek}${assignment.isPairedDouble ? ' (paired double periods)' : ''}`
      );
    } else {
      console.log(
        `[generateTimetableSlots] Successfully placed ${lessonsPlaced} lessons for ${assignment.teacher.firstName} ${assignment.teacher.lastName} - ${assignment.class.name} - ${assignment.subject.name}${assignment.isPairedDouble ? ' (paired doubles — no break between pair)' : ''}`
      );
    }
  }

  // Note: Break periods are not stored as slots to avoid database constraint issues
  // They are handled in the configuration and displayed in the UI/PDF based on config

  return slots;
}

// Helper function to find period number for a given time
function findPeriodForTime(timeSlots: Array<{ startTime: string; endTime: string }>, time: string): number {
  for (let i = 0; i < timeSlots.length; i++) {
    if (timeSlots[i].startTime === time) {
      return i + 1;
    }
  }
  return -1;
}

// Get all timetable versions
export const getTimetableVersions = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    // Do not load `slots` here — UI fetches slots via GET /versions/:id/slots. Loading all
    // slots for every version can timeout or OOM on Render and caused 500s in production.
    const versions = await versionRepository.find({
      order: { createdAt: 'DESC' },
    });

    res.json(versions);
  } catch (error: any) {
    console.error('[getTimetableVersions] Error:', error);
    res.status(500).json({ message: 'Failed to fetch timetable versions', error: error.message });
  }
};

// Get timetable slots for a version
export const getTimetableSlots = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId } = req.params;
    const { teacherId, classId } = req.query;

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    let query = slotRepository.createQueryBuilder('slot')
      .where('slot.versionId = :versionId', { versionId })
      .leftJoinAndSelect('slot.teacher', 'teacher')
      .leftJoinAndSelect('slot.class', 'class')
      .leftJoinAndSelect('slot.subject', 'subject');

    if (teacherId) {
      query = query.andWhere('slot.teacherId = :teacherId', { teacherId });
    }

    if (classId) {
      query = query.andWhere('slot.classId = :classId', { classId });
    }

    const slots = await query.orderBy('slot.dayOfWeek', 'ASC')
      .addOrderBy('slot.periodNumber', 'ASC')
      .getMany();

    res.json(slots);
  } catch (error: any) {
    console.error('[getTimetableSlots] Error:', error);
    res.status(500).json({ message: 'Failed to fetch timetable slots', error: error.message });
  }
};

// Update a timetable slot (manual edit)
export const updateTimetableSlot = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { slotId } = req.params;
    const { teacherId, classId, subjectId, dayOfWeek, periodNumber, room, isLocked } = req.body;
    const ignoreCollisions =
      req.body?.ignoreCollisions === true ||
      req.body?.ignoreCollisions === 1 ||
      String(req.body?.ignoreCollisions || '').toLowerCase() === 'true';

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    const slot = await slotRepository.findOne({ where: { id: slotId } });

    if (!slot) {
      return res.status(404).json({ message: 'Timetable slot not found' });
    }

    const wantsLockUpdate = Object.prototype.hasOwnProperty.call(req.body, 'isLocked');
    const nextIsLocked = wantsLockUpdate ? Boolean(isLocked) : Boolean(slot.isLocked);

    const nextTeacherId = teacherId !== undefined && teacherId !== null && teacherId !== ''
      ? teacherId
      : slot.teacherId;
    const nextClassId = classId !== undefined && classId !== null && classId !== ''
      ? classId
      : slot.classId;
    const nextSubjectId = subjectId !== undefined && subjectId !== null && subjectId !== ''
      ? subjectId
      : slot.subjectId;
    const nextDay = dayOfWeek !== undefined && dayOfWeek !== null && String(dayOfWeek).trim() !== ''
      ? String(dayOfWeek).trim()
      : slot.dayOfWeek;
    const nextPeriod =
      periodNumber !== undefined && periodNumber !== null && !Number.isNaN(Number(periodNumber))
        ? Number(periodNumber)
        : slot.periodNumber;

    const positionChanging =
      nextTeacherId !== slot.teacherId ||
      nextClassId !== slot.classId ||
      nextDay !== slot.dayOfWeek ||
      nextPeriod !== slot.periodNumber;

    if (positionChanging && slot.isLocked && !(wantsLockUpdate && nextIsLocked === false)) {
      return res.status(400).json({
        message: 'This lesson is locked. Right-click the card and choose Unlock before moving it.',
      });
    }

    const roleNorm = String(req.user?.role ?? '').toLowerCase();
    const canIgnoreCollisions =
      roleNorm === UserRole.ADMIN ||
      roleNorm === UserRole.SUPERADMIN ||
      roleNorm === UserRole.DEMO_USER;

    if (ignoreCollisions && !canIgnoreCollisions) {
      return res.status(403).json({
        message: 'Only administrators can ignore timetable collisions.',
      });
    }

    /** Unless ignoreCollisions is set (admin only), enforce: one teacher × one period; one class × one period. */
    if (positionChanging && !ignoreCollisions) {
      const conflicts = await slotRepository.find({
        where: [
          {
            versionId: slot.versionId,
            teacherId: nextTeacherId,
            dayOfWeek: nextDay,
            periodNumber: nextPeriod,
            id: Not(slotId)
          },
          {
            versionId: slot.versionId,
            classId: nextClassId,
            dayOfWeek: nextDay,
            periodNumber: nextPeriod,
            id: Not(slotId)
          }
        ]
      });

      if (conflicts.length > 0) {
        return res.status(400).json({
          message: 'Conflict detected. This slot would create a scheduling conflict.',
          conflicts,
          code: 'TIMETABLE_CONFLICT',
        });
      }

      const sameTeacherClassDay = await slotRepository.find({
        where: {
          versionId: slot.versionId,
          teacherId: nextTeacherId,
          classId: nextClassId,
          dayOfWeek: nextDay,
          id: Not(slotId),
        },
      });
      if (teacherClassDayRuleViolated(sameTeacherClassDay, nextPeriod)) {
        return res.status(400).json({
          message:
            'A teacher cannot meet the same class more than once per day unless it is a double lesson. Double lessons must be two consecutive periods.',
          code: 'TIMETABLE_TEACHER_CLASS_DAY',
        });
      }
    }

    slot.teacherId = nextTeacherId;
    slot.classId = nextClassId;
    slot.subjectId = nextSubjectId;
    slot.dayOfWeek = nextDay;
    slot.periodNumber = nextPeriod;
    slot.room = room !== undefined ? room : slot.room;
    if (wantsLockUpdate) {
      slot.isLocked = nextIsLocked;
    }
    slot.isManuallyEdited = true;
    slot.editedAt = new Date();
    slot.editedBy = req.user?.id || null;

    await slotRepository.save(slot);

    const updatedSlot = await slotRepository.findOne({
      where: { id: slot.id },
      relations: ['teacher', 'class', 'subject']
    });

    res.json({ message: 'Timetable slot updated successfully', slot: updatedSlot });
  } catch (error: any) {
    console.error('[updateTimetableSlot] Error:', error);
    res.status(500).json({ message: 'Failed to update timetable slot', error: error.message });
  }
};

// Delete a timetable slot
export const deleteTimetableSlot = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { slotId } = req.params;

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    const slot = await slotRepository.findOne({ where: { id: slotId } });

    if (!slot) {
      return res.status(404).json({ message: 'Timetable slot not found' });
    }

    await slotRepository.remove(slot);

    res.json({ message: 'Timetable slot deleted successfully' });
  } catch (error: any) {
    console.error('[deleteTimetableSlot] Error:', error);
    res.status(500).json({ message: 'Failed to delete timetable slot', error: error.message });
  }
};

// Activate a timetable version
export const activateTimetableVersion = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId } = req.params;

    console.log(`[activateTimetableVersion] Activating version: ${versionId}`);

    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    
    // Verify version exists
    const targetVersion = await versionRepository.findOne({ where: { id: versionId } });
    if (!targetVersion) {
      return res.status(404).json({ message: 'Timetable version not found' });
    }

    await setSingleActiveTimetableVersion(versionId);

    const version = await versionRepository.findOne({
      where: { id: versionId },
      relations: ['slots']
    });

    console.log(`[activateTimetableVersion] Version ${versionId} activated successfully`);

    res.json({ message: 'Timetable version activated successfully', version });
  } catch (error: any) {
    console.error('[activateTimetableVersion] Error:', error);
    console.error('[activateTimetableVersion] Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to activate timetable version', error: error.message });
  }
};

/** Deletes a timetable version and its slots (DB CASCADE). If the deleted row was active, activates the newest remaining version if any. */
export const deleteTimetableVersion = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId } = req.params;
    const versionRepository = AppDataSource.getRepository(TimetableVersion);

    const target = await versionRepository.findOne({ where: { id: versionId } });
    if (!target) {
      return res.status(404).json({ message: 'Timetable version not found' });
    }

    const wasActive = target.isActive;
    await versionRepository.remove(target);

    if (wasActive) {
      const remaining = await versionRepository.find({
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (remaining.length > 0) {
        await setSingleActiveTimetableVersion(remaining[0].id);
      }
    }

    res.json({ message: 'Timetable version deleted successfully' });
  } catch (error: any) {
    console.error('[deleteTimetableVersion] Error:', error);
    res.status(500).json({ message: 'Failed to delete timetable version', error: error.message });
  }
};

// Generate PDF for teacher timetable
export const generateTeacherTimetablePDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId, teacherId } = req.params;

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const versionRepository = AppDataSource.getRepository(TimetableVersion);

    const teacher = await teacherRepository.findOne({ where: { id: teacherId } });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const version = await versionRepository.findOne({ where: { id: versionId } });

    const slots = await slotRepository.find({
      where: { versionId, teacherId },
      relations: ['class', 'subject'],
      order: { dayOfWeek: 'ASC', periodNumber: 'ASC' }
    });

    const settings = await settingsRepository.findOne({ where: {} });
    
    // Get config for break periods
    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const config = await configRepository.findOne({ where: { isActive: true } });

    const pdfBuffer = await createTimetablePDF({
      type: 'teacher',
      teacher,
      slots,
      settings,
      config,
      versionName: version?.name,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="teacher-timetable-${teacher.teacherId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('[generateTeacherTimetablePDF] Error:', error);
    res.status(500).json({ message: 'Failed to generate teacher timetable PDF', error: error.message });
  }
};

// Generate PDF for class timetable
export const generateClassTimetablePDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId, classId } = req.params;

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const slots = await slotRepository.find({
      where: { versionId, classId },
      relations: ['teacher', 'subject'],
      order: { dayOfWeek: 'ASC', periodNumber: 'ASC' }
    });

    const settings = await settingsRepository.findOne({ where: {} });
    
    // Get config for break periods
    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const config = await configRepository.findOne({ where: { isActive: true } });

    const pdfBuffer = await createTimetablePDF({
      type: 'class',
      class: classEntity,
      slots,
      settings,
      config
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="class-timetable-${classEntity.name}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('[generateClassTimetablePDF] Error:', error);
    res.status(500).json({ message: 'Failed to generate class timetable PDF', error: error.message });
  }
};

// Generate consolidated teacher summary PDF
export const generateConsolidatedTimetablePDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId } = req.params;

    console.log(`[generateConsolidatedTimetablePDF] Generating PDF for version: ${versionId}`);

    const slotRepository = AppDataSource.getRepository(TimetableSlot);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Verify version exists
    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    const version = await versionRepository.findOne({ where: { id: versionId } });
    if (!version) {
      return res.status(404).json({ message: 'Timetable version not found' });
    }

    const teachers = await teacherRepository.find();
    console.log(`[generateConsolidatedTimetablePDF] Found ${teachers.length} teachers`);

    const settings = await settingsRepository.findOne({ where: {} });
    if (!settings) {
      console.warn('[generateConsolidatedTimetablePDF] No settings found, using defaults');
    }
    
    // Get config for break periods
    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const config = await configRepository.findOne({ where: { isActive: true } });

    const allSlots = await slotRepository.find({
      where: { versionId },
      relations: ['teacher', 'class', 'subject'],
      order: { dayOfWeek: 'ASC', periodNumber: 'ASC' }
    });

    console.log(`[generateConsolidatedTimetablePDF] Found ${allSlots.length} slots for version ${versionId}`);

    if (allSlots.length === 0) {
      return res.status(400).json({ message: 'No timetable slots found for this version. Please generate a timetable first.' });
    }

    console.log('[generateConsolidatedTimetablePDF] Generating PDF buffer...');
    const pdfBuffer = await createTimetablePDF({
      type: 'consolidated',
      teachers,
      slots: allSlots,
      settings,
      config,
      versionName: version.name
    });

    console.log(`[generateConsolidatedTimetablePDF] PDF generated successfully, size: ${pdfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="consolidated-timetable-${version.name.replace(/\s+/g, '-')}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('[generateConsolidatedTimetablePDF] Error:', error);
    console.error('[generateConsolidatedTimetablePDF] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Failed to generate consolidated timetable PDF', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * DELETE /api/timetable/teaching-data
 * Clears ALL teaching loads (teacher_contract_lessons) AND all class–teacher assignments
 * (teacher_classes junction + TypeORM M2M join table + classes.classTeacherId).
 * Admin / superadmin only. Wrapped in a transaction so either everything clears or nothing does.
 */
export const clearAllTeachingData = async (req: AuthRequest, res: Response) => {
  try {
    const role = (req as any).user?.role ?? '';
    if (!['admin', 'superadmin'].includes(role)) {
      return res.status(403).json({ message: 'Only administrators can perform this action.' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    const cleared: string[] = [];
    try {
      // 1. All teaching load lines
      const contractResult = await qr.query(`DELETE FROM "teacher_contract_lessons"`);
      cleared.push(`teacher_contract_lessons (${contractResult[1] ?? '?'} rows)`);

      // 2. Explicit junction table
      const junctionResult = await qr.query(`DELETE FROM "teacher_classes"`);
      cleared.push(`teacher_classes (${junctionResult[1] ?? '?'} rows)`);

      // 3. TypeORM-managed M2M join table — resolve name from metadata at runtime
      const teacherMeta = AppDataSource.getMetadata(Teacher);
      const classesRelation = teacherMeta.relations.find((r) => r.propertyName === 'classes');
      const m2mTable = classesRelation?.junctionEntityMetadata?.tableName;
      if (m2mTable) {
        await qr.query(`DELETE FROM "${m2mTable}"`);
        cleared.push(`${m2mTable} (M2M)`);
      }

      // 4. Nullify class teacher on every class
      await qr.query(`UPDATE "classes" SET "classTeacherId" = NULL`);
      cleared.push('classes.classTeacherId → NULL');

      await qr.commitTransaction();
      console.log('[clearAllTeachingData] cleared:', cleared.join(', '));

      res.json({
        message: 'All teaching loads and class–teacher assignments have been cleared successfully.',
        cleared,
      });
    } catch (innerErr: any) {
      await qr.rollbackTransaction();
      throw innerErr;
    } finally {
      await qr.release();
    }
  } catch (error: any) {
    console.error('[clearAllTeachingData]', error);
    res.status(500).json({
      message: 'Failed to clear teaching data.',
      error: error?.message || 'Unknown error',
    });
  }
};


