import { Response } from 'express';
import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Exam, ExamType, ExamStatus } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Student } from '../entities/Student';
import { Subject } from '../entities/Subject';
import { Class } from '../entities/Class';
import { Teacher } from '../entities/Teacher';
import { Settings } from '../entities/Settings';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Parent } from '../entities/Parent';
import { getTermBalanceForStudent } from '../utils/termBalance';
import { Attendance, AttendanceStatus } from '../entities/Attendance';
import { AuthRequest } from '../middleware/auth';
import { createReportCardPDF } from '../utils/pdfGenerator';
import {
  buildSubjectPositionLookup,
  subjectPositionLookupKey,
} from '../utils/reportCardSubjectRankings';
import { createMarkSheetPDF } from '../utils/markSheetPdfGenerator';
import { createRankingsPDF } from '../utils/rankingsPdfGenerator';
import OpenAI from 'openai';
import {
  getGradeInfoFromSettings,
  getGradeLabelOnly,
  getGradePointValue,
  getPassThresholdPercentForMarkSheet,
} from '../utils/gradeBandsResolve';
import {
  filterSubjectsForClass,
  inferStudentFeeLevelBand,
} from '../utils/managedFeesBilling';
import {
  activeStudentIdsForClass,
  findActiveStudentsForClass,
  findStudentsForClassListing,
  findStudentsForFormStream,
} from '../utils/classRoster';

// Helper function to assign positions with proper tie handling
// Students with the same score (average or percentage) get the same position, and positions are skipped after ties
function assignPositionsWithTies<T extends { studentId: string } & ({ average?: number; percentage?: number })>(
  rankings: T[]
): Array<T & { position: number }> {
  if (rankings.length === 0) return [];
  
  const result: Array<T & { position: number }> = [];
  let currentPosition = 1;
  
  for (let i = 0; i < rankings.length; i++) {
    // Get the score value (either average or percentage)
    const currentScore = (rankings[i] as any).average !== undefined 
      ? (rankings[i] as any).average 
      : (rankings[i] as any).percentage;
    const previousScore = i > 0 
      ? ((rankings[i - 1] as any).average !== undefined 
          ? (rankings[i - 1] as any).average 
          : (rankings[i - 1] as any).percentage)
      : null;
    
    // If this is the first item or the score is different from the previous, assign new position
    if (i === 0 || previousScore === null || Math.abs(currentScore - previousScore) > 0.001) {
      currentPosition = i + 1;
    }
    
    result.push({
      ...rankings[i],
      position: currentPosition
    } as T & { position: number });
  }
  
  return result;
}

const DEFAULT_GRADE_POINTS = {
  excellent: 5, // A*
  veryGood: 5, // A
  good: 4,     // B
  satisfactory: 3, // C
  needsImprovement: 2, // D
  basic: 1, // E
  fail: 0 // U
} as const;

/** Subjects on the class record plus subjects linked to exams (deduped by id). */
function mergeClassSubjectsWithExamSubjects(classSubjects: Subject[], exams: Exam[]): Subject[] {
  const map = new Map<string, Subject>();
  for (const s of classSubjects || []) {
    if (s?.id) map.set(s.id, s);
  }
  for (const exam of exams || []) {
    for (const s of exam.subjects || []) {
      if (s?.id && !map.has(s.id)) map.set(s.id, s);
    }
  }
  return Array.from(map.values());
}

/** Include subjects that appear on marks but were missing from class/exam lists. */
function mergeSubjectsWithMarksSubjects(subjects: Subject[], marks: Marks[]): Subject[] {
  const map = new Map<string, Subject>();
  for (const s of subjects || []) {
    if (s?.id) map.set(s.id, s);
  }
  for (const m of marks || []) {
    const s = m.subject;
    if (s?.id && !map.has(s.id)) map.set(s.id, s);
  }
  return Array.from(map.values());
}

function sortSubjectsByName(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
}

/** Add one mark row into per-student average accumulator (supports uniformMark). */
function accumulateMarkIntoStudentAverages(
  map: Record<string, { total: number; count: number }>,
  mark: Marks
): void {
  if (!mark.studentId || !mark.maxScore || mark.maxScore === 0) {
    return;
  }
  const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
  const hasScore = mark.score !== null && mark.score !== undefined;
  if (!hasUniformMark && (!hasScore || !mark.score)) {
    return;
  }

  const sid = mark.studentId;
  if (!map[sid]) {
    map[sid] = { total: 0, count: 0 };
  }
  const percentage = hasUniformMark
    ? parseFloat(String(mark.uniformMark))
    : ((mark.score || 0) / mark.maxScore) * 100;
  if (!Number.isFinite(percentage)) {
    return;
  }
  map[sid].total += percentage;
  map[sid].count += 1;
}

function studentAveragesToRankings(
  averages: Record<string, { total: number; count: number }>
): Array<{ studentId: string; average: number; position: number }> {
  const unsorted = Object.entries(averages).map(([studentId, avg]) => ({
    studentId,
    average: avg.count > 0 ? avg.total / avg.count : 0,
  }));
  unsorted.sort((a, b) => b.average - a.average);
  return assignPositionsWithTies(unsorted).map((r) => ({
    studentId: r.studentId,
    average: r.average,
    position: r.position,
  }));
}

/** Staff roles that may use draft exam sessions (same as marks capture). */
function isStaffExamViewer(role?: string): boolean {
  return (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'teacher' ||
    role === 'hod' ||
    role === 'demo_user' ||
    role === 'accountant'
  );
}

/**
 * Resolve class + term + exam-type session exams. Parents/students only see published exams.
 * When duplicate session exams exist, use the single exam with the most marks (matches createExam).
 */
async function resolveExamsForSession(
  examRepository: ReturnType<typeof AppDataSource.getRepository<Exam>>,
  marksRepository: ReturnType<typeof AppDataSource.getRepository<Marks>>,
  classId: string,
  examType: ExamType | string,
  term: string,
  options: { includeDrafts: boolean }
): Promise<Exam[]> {
  const termValue = String(term).trim();
  let exams = await examRepository.find({
    where: { classId, type: examType as ExamType, term: termValue },
    relations: ['subjects'],
    order: { createdAt: 'ASC' },
  });

  if (!options.includeDrafts) {
    exams = exams.filter((e) => e.status === ExamStatus.PUBLISHED);
  }

  if (exams.length <= 1) {
    return exams;
  }

  const withCounts = await Promise.all(
    exams.map(async (exam) => ({
      exam,
      markCount: await marksRepository.count({ where: { examId: exam.id } }),
    }))
  );
  withCounts.sort((a, b) => b.markCount - a.markCount);
  const withMarks = withCounts.filter((x) => x.markCount > 0);
  if (withMarks.length > 0) {
    if (withMarks.length > 1) {
      console.log(
        `[resolveExamsForSession] class=${classId} term=${termValue} type=${examType}: ` +
          `using exam ${withMarks[0].exam.id} (${withMarks[0].markCount} marks), ` +
          `skipped ${withMarks.length - 1} duplicate session exam(s)`
      );
    }
    return [withMarks[0].exam];
  }

  const published = exams.filter((e) => e.status === ExamStatus.PUBLISHED);
  if (published.length > 0) {
    return [published[0]];
  }
  return [exams[0]];
}

/** One exam session per class in a form/stream (avoids duplicate draft exams in rankings). */
async function resolveExamIdsForFormStream(
  examRepository: ReturnType<typeof AppDataSource.getRepository<Exam>>,
  marksRepository: ReturnType<typeof AppDataSource.getRepository<Marks>>,
  classIds: string[],
  examType: ExamType | string,
  term: string,
  includeDrafts: boolean
): Promise<string[]> {
  const ids: string[] = [];
  for (const cid of classIds) {
    const sessionExams = await resolveExamsForSession(
      examRepository,
      marksRepository,
      cid,
      examType,
      term,
      { includeDrafts }
    );
    for (const e of sessionExams) {
      if (!ids.includes(e.id)) {
        ids.push(e.id);
      }
    }
  }
  return ids;
}

/** Keep latest mark per student+subject when legacy data split across duplicate exams. */
function dedupeMarksByStudentSubject(marks: Marks[]): Marks[] {
  const map = new Map<string, Marks>();
  for (const mark of marks) {
    if (!mark.studentId || !mark.subjectId) {
      continue;
    }
    const key = `${mark.studentId}:${mark.subjectId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, mark);
      continue;
    }
    const existingAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const markAt = mark.updatedAt ? new Date(mark.updatedAt).getTime() : 0;
    if (markAt >= existingAt) {
      map.set(key, mark);
    }
  }
  return Array.from(map.values());
}

export const createExam = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { name, type, examDate, description, term, classId, subjectIds } = req.body;
    
    // Log received data for debugging
    console.log('Received exam data:', {
      name,
      type,
      examDate,
      description,
      classId,
      subjectIds,
      classIdType: typeof classId,
      classIdLength: classId?.length
    });
    
    // Validate required fields
    if (!name || (typeof name === 'string' && name.trim() === '')) {
      console.error('Validation failed: Exam name is missing or empty');
      return res.status(400).json({ message: 'Exam name is required' });
    }

    if (!type || (typeof type === 'string' && type.trim() === '')) {
      console.error('Validation failed: Exam type is missing or empty');
      return res.status(400).json({ message: 'Exam type is required' });
    }

    if (!examDate || (typeof examDate === 'string' && examDate.trim() === '')) {
      console.error('Validation failed: Exam date is missing or empty');
      return res.status(400).json({ message: 'Exam date is required' });
    }

    if (!classId || (typeof classId === 'string' && classId.trim() === '') || classId === 'null' || classId === 'undefined') {
      console.error('Validation failed: Class ID is missing, empty, or invalid. Received:', classId);
      return res.status(400).json({ message: 'Class ID is required. Please select a class.' });
    }

    // Validate exam type
    const validTypes = Object.values(ExamType);
    if (!validTypes.includes(type as ExamType)) {
      return res.status(400).json({ 
        message: `Invalid exam type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);

    // Validate classId format (should be UUID)
    const trimmedClassId = String(classId).trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(trimmedClassId)) {
      return res.status(400).json({ 
        message: 'Invalid class ID format. Please select a valid class.' 
      });
    }

    // Verify class exists
    const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
    if (!classEntity) {
      console.error(`Class not found with ID: ${trimmedClassId}`);
      return res.status(404).json({ 
        message: `Class not found. Please ensure the class exists and try again.` 
      });
    }

    // Parse examDate if it's a string
    let parsedExamDate: Date;
    if (typeof examDate === 'string') {
      // Handle HTML date input format (YYYY-MM-DD)
      if (examDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date in local timezone to avoid timezone issues
        const [year, month, day] = examDate.split('-').map(Number);
        parsedExamDate = new Date(year, month - 1, day);
      } else {
        parsedExamDate = new Date(examDate);
      }
      
      if (isNaN(parsedExamDate.getTime())) {
        return res.status(400).json({ message: `Invalid exam date format: ${examDate}` });
      }
    } else if (examDate instanceof Date) {
      parsedExamDate = examDate;
    } else {
      return res.status(400).json({ message: 'Exam date must be a valid date' });
    }

    const normalizedTerm = term ? String(term).trim() : null;

    // Create exam
    const examData: Partial<Exam> = {
      name: String(name).trim(),
      type: type as ExamType,
      examDate: parsedExamDate,
      classId: trimmedClassId,
      term: normalizedTerm
    };
    
    // Only include description if it's provided and not empty
    const trimmedDescription = description ? String(description).trim() : '';
    if (trimmedDescription !== '') {
      examData.description = trimmedDescription;
    }

    const exam = examRepository.create(examData) as Exam;

    // Load subjects if provided (subjects are optional)
    let subjectsToAssign: Subject[] = [];
    if (subjectIds !== undefined && subjectIds !== null) {
      if (!Array.isArray(subjectIds)) {
        return res.status(400).json({ 
          message: 'Subject IDs must be an array' 
        });
      }
      
      if (subjectIds.length > 0) {
        // Filter out any empty, null, or undefined values
        const validSubjectIds = subjectIds.filter(id => {
          if (!id) return false;
          const idStr = String(id).trim();
          return idStr !== '' && idStr !== 'null' && idStr !== 'undefined';
        });
        
        if (validSubjectIds.length > 0) {
          try {
            // Ensure we have valid UUIDs
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const invalidUuids = validSubjectIds.filter(id => !uuidPattern.test(String(id)));
            
            if (invalidUuids.length > 0) {
              return res.status(400).json({ 
                message: `Invalid subject ID format: ${invalidUuids.join(', ')}` 
              });
            }
            
            const subjects = await subjectRepository.find({ where: { id: In(validSubjectIds) } });
            
            // Check if all subjects were found
            const foundIds = subjects.map(s => s.id);
            const missingIds = validSubjectIds.filter(id => !foundIds.includes(String(id)));
            
            if (missingIds.length > 0) {
              return res.status(400).json({ 
                message: `One or more subjects not found. Invalid subject IDs: ${missingIds.join(', ')}` 
              });
            }
            
            subjectsToAssign = subjects;
          } catch (subjectError: any) {
            console.error('Error loading subjects:', subjectError);
            return res.status(400).json({ 
              message: 'Error validating subjects. Please ensure all selected subjects exist.' 
            });
          }
        }
      }
    }

    // Reuse an existing draft exam for the same session identity (class + type + term)
    // so marks-input cannot split marks across multiple exam IDs.
    const sessionWhere: any = {
      classId: trimmedClassId,
      type: type as ExamType,
      term: normalizedTerm === null ? IsNull() : normalizedTerm
    };

    const sessionExams = await examRepository.find({
      where: sessionWhere,
      relations: ['classEntity', 'subjects'],
      order: { createdAt: 'ASC' }
    });

    const draftExams = sessionExams.filter((e) => e.status !== ExamStatus.PUBLISHED);
    let existingDraftExam: Exam | null = null;
    if (draftExams.length === 1) {
      existingDraftExam = draftExams[0];
    } else if (draftExams.length > 1) {
      const marksRepository = AppDataSource.getRepository(Marks);
      let bestCount = -1;
      for (const e of draftExams) {
        const cnt = await marksRepository.count({ where: { examId: e.id } });
        if (cnt > bestCount) {
          bestCount = cnt;
          existingDraftExam = e;
        }
      }
      if (!existingDraftExam) existingDraftExam = draftExams[0];
    }

    if (existingDraftExam) {
      if (subjectsToAssign.length > 0) {
        const existingIds = new Set((existingDraftExam.subjects || []).map((s) => s.id));
        const mergedSubjects = [...(existingDraftExam.subjects || [])];
        for (const s of subjectsToAssign) {
          if (!existingIds.has(s.id)) mergedSubjects.push(s);
        }
        existingDraftExam.subjects = mergedSubjects;
        await examRepository.save(existingDraftExam);
      }

      const hydratedExisting = await examRepository.findOne({
        where: { id: existingDraftExam.id },
        relations: ['classEntity', 'subjects']
      });
      return res.status(200).json({
        message: 'Exam session already exists. Reusing existing draft exam.',
        exam: hydratedExisting ?? existingDraftExam,
        reused: true
      });
    }

    let savedExam: Exam;
    try {
      console.log('Saving exam with data:', {
        name: exam.name,
        type: exam.type,
        examDate: exam.examDate,
        classId: exam.classId,
        subjectCount: subjectsToAssign.length
      });
      
      // Save the exam first (this will generate the ID)
      savedExam = await examRepository.save(exam);
      
      console.log('Exam saved successfully with ID:', savedExam.id);
      
      // If subjects were assigned, update the ManyToMany relationship
      if (subjectsToAssign.length > 0) {
        console.log('Assigning subjects to exam');
        savedExam.subjects = subjectsToAssign;
        savedExam = await examRepository.save(savedExam);
        console.log('Subjects assigned successfully');
      }
    } catch (saveError: any) {
      console.error('Save error details:', {
        code: saveError.code,
        detail: saveError.detail,
        message: saveError.message,
        constraint: saveError.constraint,
        table: saveError.table,
        stack: saveError.stack
      });
      
      // More specific error handling for save errors
      if (saveError.code === '23503') {
        // Foreign key constraint violation
        if (saveError.detail && (saveError.detail.includes('classId') || saveError.detail.includes('class'))) {
          return res.status(400).json({ 
            message: 'Invalid class reference. The selected class does not exist in the database.',
            detail: saveError.detail 
          });
        }
        if (saveError.detail && (saveError.detail.includes('subject') || saveError.detail.includes('Subject'))) {
          return res.status(400).json({ 
            message: 'Invalid subject reference. One or more selected subjects do not exist in the database.',
            detail: saveError.detail 
          });
        }
        return res.status(400).json({ 
          message: 'Invalid reference. Please check that the class and subjects exist.',
          detail: saveError.detail || saveError.message
        });
      }
      throw saveError; // Re-throw if it's not a known error
    }
    
    // Load the exam with relations
    const finalExam = await examRepository.findOne({
      where: { id: savedExam.id },
      relations: ['classEntity', 'subjects']
    });

    if (!finalExam) {
      console.error('Failed to load saved exam');
      return res.status(500).json({ message: 'Exam created but failed to load. Please refresh the exam list.' });
    }

    res.status(201).json({ 
      message: 'Exam created successfully', 
      exam: finalExam 
    });
  } catch (error: any) {
    console.error('Error creating exam:', error);
    console.error('Error details:', {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint
    });
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Exam with this name already exists' });
    }
    
    if (error.code === '23503') {
      // Foreign key constraint violation - provide more details
      if (error.detail) {
        if (error.detail.includes('classId') || error.detail.includes('class')) {
          return res.status(400).json({ message: 'Invalid class reference. The selected class does not exist in the database.' });
        }
        if (error.detail.includes('subject') || error.detail.includes('Subject')) {
          return res.status(400).json({ message: 'Invalid subject reference. One or more selected subjects do not exist.' });
        }
      }
      return res.status(400).json({ message: 'Invalid reference. Please verify that the class and all selected subjects exist.' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getExams = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { classId } = req.query;

    const where: any = {};
    if (classId) {
      where.classId = classId;
    }

    const exams = await examRepository.find({
      where,
      relations: ['classEntity', 'subjects']
    });

    res.json(exams);
  } catch (error: any) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getExamById = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { id } = req.params;

    const exam = await examRepository.findOne({
      where: { id },
      relations: ['classEntity', 'subjects']
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json(exam);
  } catch (error: any) {
    console.error('Error fetching exam:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteExam = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const { id } = req.params;

    console.log('Attempting to delete exam with ID:', id);

    const exam = await examRepository.findOne({
      where: { id },
      relations: ['subjects']
    });

    if (!exam) {
      console.log('Exam not found with ID:', id);
      return res.status(404).json({ message: 'Exam not found' });
    }

    console.log('Found exam:', exam.name);

    // Delete all marks associated with this exam
    const marks = await marksRepository.find({
      where: { examId: id }
    });
    
    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with exam`);
      await marksRepository.remove(marks);
    }

    // Remove subject associations (ManyToMany)
    if (exam.subjects && exam.subjects.length > 0) {
      console.log('Removing subject associations');
      exam.subjects = [];
      await examRepository.save(exam);
    }

    // Delete the exam
    console.log('Deleting exam:', exam.name);
    await examRepository.remove(exam);
    console.log('Exam deleted successfully');

    res.json({ message: 'Exam deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting exam:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteAllExams = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);

    console.log('Attempting to delete all exams');

    // Get all exams
    const exams = await examRepository.find({
      relations: ['subjects']
    });

    console.log(`Found ${exams.length} exams to delete`);

    if (exams.length === 0) {
      return res.json({ message: 'No exams found to delete', deletedCount: 0 });
    }

    // Get all exam IDs
    const examIds = exams.map(exam => exam.id);

    // Delete all marks associated with these exams
    const marks = await marksRepository.find({
      where: { examId: In(examIds) }
    });

    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with exams`);
      await marksRepository.remove(marks);
    }

    // Remove subject associations for all exams
    for (const exam of exams) {
      if (exam.subjects && exam.subjects.length > 0) {
        exam.subjects = [];
        await examRepository.save(exam);
      }
    }

    // Delete all exams
    console.log('Deleting all exams');
    await examRepository.remove(exams);
    console.log(`Successfully deleted ${exams.length} exams`);

    res.json({ 
      message: `Successfully deleted ${exams.length} exam(s)`, 
      deletedCount: exams.length 
    });
  } catch (error: any) {
    console.error('Error deleting all exams:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const publishExam = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examId } = req.body;

    if (!examId) {
      return res.status(400).json({ message: 'Exam ID is required' });
    }

    const exam = await examRepository.findOne({
      where: { id: examId },
      relations: ['classEntity', 'subjects']
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Publish this exam and all related exams (same class, term, and type)
    // This ensures all students' results for this exam period are published together
    const whereCondition: any = {
      classId: exam.classId,
      type: exam.type
    };
    
    // Handle term condition - use IsNull() for null values
    if (exam.term !== null && exam.term !== undefined) {
      whereCondition.term = exam.term;
    } else {
      whereCondition.term = IsNull();
    }
    
    const relatedExams = await examRepository.find({
      where: whereCondition
    });

    // Update all related exams to published status
    for (const relatedExam of relatedExams) {
      relatedExam.status = ExamStatus.PUBLISHED;
      await examRepository.save(relatedExam);
    }

    res.json({ 
      message: `Exam results published successfully. Results for all students in ${relatedExams.length} exam(s) are now visible to all users.`,
      exam: exam,
      publishedCount: relatedExams.length
    });
  } catch (error: any) {
    console.error('Error publishing exam:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const publishExamByType = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examType, term } = req.body;

    if (!examType) {
      return res.status(400).json({ message: 'Exam type is required' });
    }

    if (!term) {
      return res.status(400).json({ message: 'Term is required' });
    }

    // Find all exams of the specified type and term (across all classes)
    const whereCondition: any = {
      type: examType as ExamType,
      term: term
    };
    
    const exams = await examRepository.find({
      where: whereCondition,
      relations: ['classEntity', 'subjects']
    });

    if (exams.length === 0) {
      return res.status(404).json({ 
        message: `No exams found for ${examType} in ${term}` 
      });
    }

    // Update all exams to published status
    let publishedCount = 0;
    for (const exam of exams) {
      if (exam.status !== ExamStatus.PUBLISHED) {
        exam.status = ExamStatus.PUBLISHED;
        await examRepository.save(exam);
        publishedCount++;
      }
    }

    res.json({ 
      message: `Exam results published successfully. ${publishedCount} exam(s) published across all classes. Results are now visible to all users.`,
      publishedCount: publishedCount,
      totalExams: exams.length
    });
  } catch (error: any) {
    console.error('Error publishing exams by type:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const unpublishExamByType = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examType, term } = req.body;

    if (!examType) {
      return res.status(400).json({ message: 'Exam type is required' });
    }
    if (!term) {
      return res.status(400).json({ message: 'Term is required' });
    }

    const exams = await examRepository.find({
      where: {
        type: examType as ExamType,
        term: term,
      },
      relations: ['classEntity', 'subjects'],
    });

    if (exams.length === 0) {
      return res.status(404).json({
        message: `No exams found for ${examType} in ${term}`,
      });
    }

    let unpublishedCount = 0;
    for (const exam of exams) {
      if (exam.status === ExamStatus.PUBLISHED) {
        exam.status = ExamStatus.DRAFT;
        await examRepository.save(exam);
        unpublishedCount++;
      }
    }

    res.json({
      message: `Results unpublished successfully. ${unpublishedCount} exam(s) were set back to draft.`,
      unpublishedCount,
      totalExams: exams.length,
    });
  } catch (error: any) {
    console.error('Error unpublishing exams by type:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error',
    });
  }
};

export const captureMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { examId, marksData } = req.body; // marksData: [{studentId, subjectId, score, maxScore, comments}]
    
    // Validate examId
    if (!examId) {
      console.error('Error: examId is missing from request body');
      return res.status(400).json({ message: 'Exam ID is required' });
    }
    
    // Check if exam is published - prevent editing
    const examRepository = AppDataSource.getRepository(Exam);
    const exam = await examRepository.findOne({ where: { id: examId } });
    
    if (exam && exam.status === ExamStatus.PUBLISHED) {
      return res.status(403).json({ 
        message: 'Cannot edit marks. Exam results have been published and are now read-only.' 
      });
    }
    
    console.log('Capturing marks for examId:', examId);
    console.log('Marks data received:', JSON.stringify(marksData, null, 2));
    
    const marksRepository = AppDataSource.getRepository(Marks);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const studentRepository = AppDataSource.getRepository(Student);

    // Check for existing marks and update or create
    const marksToSave: Marks[] = [];
    const invalidMarks: Array<{
      studentId: any;
      subjectId: any;
      score: any;
      maxScore: any;
      reason: string;
    }> = [];

    const parseNumber = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };

    const isValidScore = (score: number, maxScore: number): boolean => {
      if (!Number.isFinite(score) || !Number.isFinite(maxScore)) return false;
      if (maxScore <= 0) return false;
      if (score < 0) return false;
      if (score > maxScore) return false;
      return true;
    };
    
    for (const mark of marksData) {
      const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
      /** API field is `comments`; some clients still send `remarks`. */
      const incomingComments = hasOwn(mark, 'comments')
        ? (mark as any).comments
        : hasOwn(mark, 'remarks')
          ? (mark as any).remarks
          : undefined;
      // Ensure student belongs to current school
      const student = await studentRepository.findOne({
        where: { id: String(mark.studentId) }
      });
      if (!student) {
        console.warn('Skipping mark entry for invalid student or mismatched school', mark.studentId);
        continue;
      }

      // Ensure subject belongs to current school
      const subject = await subjectRepository.findOne({
        where: { id: String(mark.subjectId) }
      });
      if (!subject) {
        console.warn('Skipping mark entry for invalid subject or mismatched school', mark.subjectId);
        continue;
      }

      // Check if mark already exists
      const existing = await marksRepository.findOne({
        where: {
          examId,
          studentId: mark.studentId,
          subjectId: mark.subjectId,
        }
      });

      const resolvedMaxScore =
        parseNumber(mark.maxScore) ??
        (existing?.maxScore !== undefined && existing?.maxScore !== null ? parseNumber(existing.maxScore) : null) ??
        100;

      if (existing) {
        // Update existing mark
        if (mark.score !== null && mark.score !== undefined) {
          const parsedScore = parseNumber(mark.score);
          if (parsedScore === null || !isValidScore(parsedScore, resolvedMaxScore)) {
            invalidMarks.push({
              studentId: mark.studentId,
              subjectId: mark.subjectId,
              score: mark.score,
              maxScore: mark.maxScore ?? resolvedMaxScore,
              reason: 'Invalid score (must be 0..maxScore)',
            });
            continue;
          }
          existing.score = Math.round(parsedScore);
        }
        existing.maxScore = Math.round(resolvedMaxScore);
        // Always update comments when provided (even empty string, to allow clearing)
        if (incomingComments !== undefined && incomingComments !== null) {
          existing.comments = incomingComments;
        }
        marksToSave.push(existing);
      } else {
        // Create new mark
        const parsedScore = parseNumber(mark.score) ?? 0;
        if (!isValidScore(parsedScore, resolvedMaxScore)) {
          invalidMarks.push({
            studentId: mark.studentId,
            subjectId: mark.subjectId,
            score: mark.score,
            maxScore: mark.maxScore ?? resolvedMaxScore,
            reason: 'Invalid score (must be 0..maxScore)',
          });
          continue;
        }
        const newMark = marksRepository.create({
          examId: String(examId), // Ensure examId is a string
          studentId: String(mark.studentId),
          subjectId: String(mark.subjectId),
          score: Math.round(parsedScore),
          maxScore: Math.round(resolvedMaxScore),
          comments:
            incomingComments !== undefined && incomingComments !== null ? incomingComments : null,
        });
        console.log('Creating new mark:', {
          examId: newMark.examId,
          studentId: newMark.studentId,
          subjectId: newMark.subjectId,
          score: newMark.score,
          maxScore: newMark.maxScore
        });
        marksToSave.push(newMark);
      }
    }

    await marksRepository.save(marksToSave);

    console.log('[captureMarks] Saved', marksToSave.length, 'mark row(s) for exam', examId);
    
    res.json({ 
      message: 'Marks saved successfully. Report cards are now available for all students.',
      examId,
      savedCount: marksToSave.length,
      invalidCount: invalidMarks.length,
      invalidMarks: invalidMarks.length > 0 ? invalidMarks.slice(0, 50) : [],
    });
  } catch (error: any) {
    console.error('[captureMarks] Error capturing marks:', error);
    console.error('[captureMarks] Error stack:', error.stack);
    console.error('[captureMarks] Error details:', {
      examId: req.body?.examId,
      marksDataCount: req.body?.marksData?.length,
      errorMessage: error.message,
      errorCode: error.code
    });
    
    // Check if it's a database column error (migration not run)
    if (error.message?.includes('column') && error.message?.includes('uniformMark')) {
      return res.status(500).json({ 
        message: 'Database migration required. Please run the migration to add uniformMark column to marks table.',
        error: 'Missing column: uniformMark'
      });
    }
    
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Generate AI-powered remarks for a student's mark
 * POST /api/exams/generate-ai-remark
 * Body: { studentId, subjectId, score, maxScore }
 */
export const generateAIRemark = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, subjectId, score, maxScore } = req.body;

    // Validate required fields
    if (!studentId || !subjectId || score === undefined || score === null) {
      return res.status(400).json({ message: 'studentId, subjectId, and score are required' });
    }

    const numericScore = parseFloat(score);
    const numericMaxScore = parseFloat(maxScore) || 100;

    if (isNaN(numericScore) || numericScore < 0 || numericScore > numericMaxScore) {
      return res.status(400).json({ message: 'Invalid score value' });
    }

    // Check if OpenAI API key is configured (trim; strip accidental quotes from .env paste)
    const openaiApiKey = (process.env.OPENAI_API_KEY || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    const openaiModel = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!openaiApiKey) {
      console.error('[generateAIRemark] OPENAI_API_KEY missing after load (check backend/.env and restart server)');
      return res.status(500).json({ 
        message: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file and restart the server.',
        error: 'OPENAI_API_KEY environment variable is missing or empty'
      });
    }

    // Fetch student and subject details
    const studentRepository = AppDataSource.getRepository(Student);
    const subjectRepository = AppDataSource.getRepository(Subject);

    console.log('[generateAIRemark] Fetching student and subject:', { studentId, subjectId });
    const student = await studentRepository.findOne({ where: { id: studentId } });
    const subject = await subjectRepository.findOne({ where: { id: subjectId } });

    if (!student) {
      console.error('[generateAIRemark] Student not found:', studentId);
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!subject) {
      console.error('[generateAIRemark] Subject not found:', subjectId);
      return res.status(404).json({ message: 'Subject not found' });
    }

    console.log('[generateAIRemark] Student and subject found:', { 
      studentName: `${student.firstName} ${student.lastName}`, 
      subjectName: subject.name 
    });

    // Calculate percentage
    const percentage = (numericScore / numericMaxScore) * 100;

    // Initialize OpenAI client
    console.log('[generateAIRemark] Initializing OpenAI client...');
    const openai = new OpenAI({
      apiKey: openaiApiKey
    });

    // Create prompt for AI
    const prompt = `Generate a brief, professional, and encouraging remark (comment) for a student's performance in ${subject.name}. 
The student scored ${numericScore} out of ${numericMaxScore} (${percentage.toFixed(1)}%).

Requirements:
- The remark should be subject-specific and relevant to ${subject.name}
- Keep it concise (1-2 sentences, maximum 100 words)
- Be encouraging and constructive
- If the score is high (80%+), acknowledge excellence and suggest maintaining the standard
- If the score is moderate (50-79%), provide encouragement and suggest areas for improvement
- If the score is low (<50%), be supportive and suggest specific ways to improve
- Use professional educational language suitable for report cards
- Do not include the score or percentage in the remark itself

Generate only the remark text, without any additional explanation or formatting.`;

    try {
      console.log('[generateAIRemark] Calling OpenAI API, model:', openaiModel);
      const completion = await openai.chat.completions.create({
        model: openaiModel,
        messages: [
          {
            role: 'system',
            content: 'You are an experienced teacher providing constructive feedback on student performance. Your remarks are professional, encouraging, and subject-specific.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      console.log('[generateAIRemark] OpenAI API response received');
      const remark = completion.choices[0]?.message?.content?.trim() || '';

      if (!remark) {
        console.error('[generateAIRemark] Empty remark received from OpenAI');
        return res.status(500).json({ message: 'Failed to generate remark from AI' });
      }

      console.log('[generateAIRemark] AI remark generated successfully, length:', remark.length);
      res.json({ 
        remark,
        generatedAt: new Date().toISOString()
      });
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError);
      console.error('OpenAI API error details:', {
        message: openaiError.message,
        status: openaiError.status,
        code: openaiError.code,
        type: openaiError.type,
        stack: openaiError.stack
      });

      const code = openaiError?.code ?? openaiError?.error?.code;
      const status = openaiError?.status;

      if (code === 'insufficient_quota' || openaiError?.type === 'insufficient_quota') {
        return res.status(429).json({
          message:
            'OpenAI account has no available quota. Add billing or credits at platform.openai.com, then try again.',
          error: 'insufficient_quota',
          code: 'insufficient_quota'
        });
      }

      if (status === 429) {
        return res.status(429).json({
          message: 'OpenAI rate limit reached. Wait a moment and try again.',
          error: openaiError.message || 'rate_limit',
          code: 'rate_limit'
        });
      }

      if (status === 401) {
        return res.status(502).json({
          message: 'OpenAI rejected the API key (invalid or revoked). Check OPENAI_API_KEY in backend/.env.',
          error: 'invalid_api_key',
          code: 'invalid_api_key'
        });
      }

      return res.status(500).json({
        message: 'Failed to generate AI remark',
        error: openaiError.message || 'Unknown error',
        details:
          process.env.NODE_ENV === 'development'
            ? {
                status: openaiError.status,
                code: openaiError.code,
                type: openaiError.type
              }
            : undefined
      });
    }
  } catch (error: any) {
    console.error('Error generating AI remark:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

function buildReportCardContextSummary(ctx: Record<string, any>): string {
  const lines: string[] = [];
  if (ctx.studentName) lines.push(`Student: ${ctx.studentName}`);
  if (ctx.className) lines.push(`Class: ${ctx.className}`);
  if (ctx.term) lines.push(`Term: ${ctx.term}`);
  if (ctx.examTypeLabel) lines.push(`Exam: ${ctx.examTypeLabel}`);
  if (ctx.overallAverage != null && ctx.overallAverage !== '') {
    lines.push(`Overall average: ${ctx.overallAverage}%`);
  }
  if (ctx.overallGrade) lines.push(`Overall attainment label: ${ctx.overallGrade}`);
  if (ctx.classPosition) lines.push(`Class position: ${ctx.classPosition}`);
  if (ctx.formPosition) lines.push(`Form/stream position: ${ctx.formPosition}`);
  if (Array.isArray(ctx.subjects) && ctx.subjects.length > 0) {
    lines.push('Subjects:');
    ctx.subjects.slice(0, 30).forEach((s: any) => {
      const name = s.subject || s.name || 'Subject';
      const parts = [s.grade, s.percentage != null ? `${s.percentage}%` : ''].filter(Boolean);
      lines.push(`  - ${name}: ${parts.length ? parts.join(', ') : 'N/A'}`);
    });
  }
  return lines.join('\n');
}

/**
 * POST /api/exams/generate-ai-report-remark
 * Body: { studentId, remarkType: 'class_teacher' | 'headmaster', context, classId?, examType? }
 */
export const generateAIReportRemark = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, remarkType, context, classId, examType } = req.body;
    const user = req.user;

    if (!studentId || !remarkType || !context || typeof context !== 'object') {
      return res.status(400).json({ message: 'studentId, remarkType, and context are required' });
    }

    if (remarkType !== 'class_teacher' && remarkType !== 'headmaster') {
      return res.status(400).json({ message: 'remarkType must be class_teacher or headmaster' });
    }

    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (remarkType === 'headmaster' && !isAdmin) {
      return res.status(403).json({ message: 'Only administrators can generate headmaster remarks' });
    }

    if (remarkType === 'class_teacher' && !isTeacher && !isAdmin) {
      return res.status(403).json({
        message: 'Only teachers and administrators can generate class teacher remarks',
      });
    }

    if (classId && examType) {
      const examRepository = AppDataSource.getRepository(Exam);
      const exams = await examRepository.find({
        where: { classId: classId as string, type: examType as any },
      });
      if (exams.length > 0 && exams.some((e) => e.status === ExamStatus.PUBLISHED)) {
        return res.status(403).json({
          message: 'Cannot generate AI remarks for published exams (read-only).',
        });
      }
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const student = await studentRepository.findOne({ where: { id: studentId as string } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const openaiApiKey = (process.env.OPENAI_API_KEY || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    const openaiModel = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!openaiApiKey) {
      return res.status(500).json({
        message:
          'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file and restart the server.',
        error: 'OPENAI_API_KEY environment variable is missing or empty',
      });
    }

    const summary = buildReportCardContextSummary(context);
    if (!summary.trim()) {
      return res.status(400).json({ message: 'context must include enough data to summarize performance' });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const isHead = remarkType === 'headmaster';
    const systemPrompt = isHead
      ? 'You are an experienced school principal/headmaster writing brief formal report card endorsements. Tone: professional, warm, authoritative. Do not invent facts beyond the summary.'
      : 'You are an experienced class teacher writing holistic report card comments. Be encouraging, specific to the performance summary, and suitable for parents. Do not invent facts beyond the summary.';

    const userPrompt = isHead
      ? `Based only on the following performance summary, write a short headmaster/principal remark (2–3 sentences, max 120 words) for the student’s report card. Do not repeat the summary as a list. Do not include bullet points.\n\n---\n${summary}\n---\n\nOutput only the remark text.`
      : `Based only on the following performance summary, write a class teacher remark (2–4 sentences, max 150 words) for the student’s report card. Address strengths and one constructive focus where appropriate. Do not repeat every subject score. Do not include bullet points.\n\n---\n${summary}\n---\n\nOutput only the remark text.`;

    try {
      const completion = await openai.chat.completions.create({
        model: openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 320,
        temperature: 0.65,
      });

      const remark = completion.choices[0]?.message?.content?.trim() || '';
      if (!remark) {
        return res.status(500).json({ message: 'Failed to generate remark from AI' });
      }

      res.json({
        remark,
        generatedAt: new Date().toISOString(),
      });
    } catch (openaiError: any) {
      console.error('[generateAIReportRemark] OpenAI error:', openaiError);
      const code = openaiError?.code ?? openaiError?.error?.code;
      const status = openaiError?.status;

      if (code === 'insufficient_quota' || openaiError?.type === 'insufficient_quota') {
        return res.status(429).json({
          message:
            'OpenAI account has no available quota. Add billing or credits at platform.openai.com, then try again.',
          error: 'insufficient_quota',
          code: 'insufficient_quota',
        });
      }
      if (status === 429) {
        return res.status(429).json({
          message: 'OpenAI rate limit reached. Wait a moment and try again.',
          error: openaiError.message || 'rate_limit',
          code: 'rate_limit',
        });
      }
      if (status === 401) {
        return res.status(502).json({
          message:
            'OpenAI rejected the API key (invalid or revoked). Check OPENAI_API_KEY in backend/.env.',
          error: 'invalid_api_key',
          code: 'invalid_api_key',
        });
      }
      return res.status(500).json({
        message: 'Failed to generate AI report remark',
        error: openaiError.message || 'Unknown error',
      });
    }
  } catch (error: any) {
    console.error('[generateAIReportRemark] Error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error',
    });
  }
};

export const getMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);
    const { examId, studentId, classId } = req.query;
    const user = req.user;

    const logParams: Record<string, string> = {};
    if (examId) logParams.examId = String(examId);
    if (studentId) logParams.studentId = String(studentId);
    if (classId) logParams.classId = String(classId);
    console.log('[getMarks] Request params:', logParams);
    const logResultCount = (count: number) =>
      console.log('[getMarks] Returning', count, 'mark row(s)');

    const where: any = { };
    if (examId) where.examId = examId;
    if (studentId) where.studentId = studentId;

    let marks = await marksRepository.find({
      where,
      relations: ['student', 'exam', 'subject']
    });

    // Filter by class roster membership (same rules as GET /students?classId=).
    if (classId) {
      const cid = String(classId);
      if (examId) {
        const examEntity =
          marks[0]?.exam ?? (await examRepository.findOne({ where: { id: String(examId) } }));
        if (examEntity?.classId && examEntity.classId !== cid) {
          marks = [];
        }
      } else {
        const studentRepository = AppDataSource.getRepository(Student);
        const rosterIds = await activeStudentIdsForClass(studentRepository, cid);
        marks = marks.filter((mark) => rosterIds.has(mark.studentId));
      }
    }

    // Parents/students only see published exam marks. Staff capturing marks must reload drafts.
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isStaffMarksEntry =
      isAdmin ||
      user?.role === 'teacher' ||
      user?.role === 'hod' ||
      user?.role === 'demo_user' ||
      user?.role === 'accountant';
    const isParentOrStudent = user?.role === 'parent' || user?.role === 'student';
    if (isParentOrStudent && !isStaffMarksEntry) {
      const examIds = [...new Set(marks.map(m => m.examId))];
      if (examIds.length > 0) {
        const exams = await examRepository.find({
          where: { id: In(examIds) }
        });
        const publishedExamIds = new Set(
          exams.filter(e => e.status === ExamStatus.PUBLISHED).map(e => e.id)
        );
        marks = marks.filter(mark => publishedExamIds.has(mark.examId));
      }
    }

    // Round all scores to integers
    const roundedMarks = marks.map(mark => ({
      ...mark,
      score: Math.round(parseFloat(String(mark.score)) || 0),
      maxScore: Math.round(parseFloat(String(mark.maxScore)) || 100)
    }));

    logResultCount(roundedMarks.length);
    res.json(roundedMarks);
  } catch (error: any) {
    console.error('[getMarks] Error getting marks:', error);
    console.error('[getMarks] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getStudentRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, classId } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);

    // Get all marks for the exam
    const marks = await marksRepository.find({
      where: { examId: examId as string },
      relations: ['student', 'subject', 'exam']
    });

    // Filter by class if provided
    let filteredMarks = marks;
    if (classId) {
      filteredMarks = marks.filter(m => m.student.classId === classId);
    }

    // Calculate averages per student
    const studentAverages: { [key: string]: { total: number; count: number; student: Student } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          student: mark.student
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    // Calculate final averages and create rankings
    const rankings = Object.values(studentAverages).map(avg => ({
      studentId: avg.student.id,
      studentName: `${avg.student.firstName} ${avg.student.lastName}`,
      average: avg.count > 0 ? avg.total / avg.count : 0
    }));

    // Sort by average descending
    rankings.sort((a, b) => b.average - a.average);

    // Add positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      classPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getSubjectRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, subjectId, classId } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);

    const where: any = { examId: examId as string, subjectId: subjectId as string };
    let marks = await marksRepository.find({
      where,
      relations: ['student', 'subject']
    });

    if (classId) {
      marks = marks.filter(m => m.student.classId === classId);
    }

    // Calculate percentage and sort
    const subjectRankings = marks
      .map(mark => {
        const roundedScore = Math.round(parseFloat(String(mark.score)) || 0);
        const roundedMaxScore = Math.round(parseFloat(String(mark.maxScore)) || 100);
        return {
          studentId: mark.student.id,
          studentName: `${mark.student.firstName} ${mark.student.lastName}`,
          score: roundedScore,
          maxScore: roundedMaxScore,
          percentage: roundedMaxScore > 0 ? (roundedScore / roundedMaxScore) * 100 : 0
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(subjectRankings);
    const subjectRankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      subjectPosition: rank.position
    }));

    res.json(subjectRankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getClassRankingsByType = async (req: AuthRequest, res: Response) => {
  try {
    const { examType, classId, term } = req.query;

    if (!examType || !classId) {
      return res.status(400).json({ message: 'Exam type and class ID are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    let termValue = term ? String(term).trim() : '';
    if (!termValue) {
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1,
      });
      termValue = String(settingsList[0]?.activeTerm || settingsList[0]?.currentTerm || '').trim();
    }

    const includeDraftExams = isStaffExamViewer(req.user?.role);
    const classIdStr = String(classId);
    let examIds: string[] = [];

    if (termValue) {
      const sessionExams = await resolveExamsForSession(
        examRepository,
        marksRepository,
        classIdStr,
        examType as string,
        termValue,
        { includeDrafts: includeDraftExams }
      );
      examIds = sessionExams.map((e) => e.id);
    }

    if (examIds.length === 0) {
      const exams = await examRepository.find({
        where: {
          classId: classIdStr,
          type: examType as ExamType,
        },
      });
      const usable = includeDraftExams
        ? exams
        : exams.filter((e) => e.status === ExamStatus.PUBLISHED);
      examIds = usable.map((e) => e.id);
    }

    if (examIds.length === 0) {
      return res.json([]);
    }

    const rosterStudents = await findStudentsForClassListing(studentRepository, classIdStr);
    const rosterIds = new Set(rosterStudents.map((s) => s.id));
    if (rosterIds.size === 0) {
      return res.json([]);
    }

    let marks = await marksRepository.find({
      where: {
        examId: In(examIds),
        studentId: In([...rosterIds]),
      },
      relations: ['student', 'subject', 'exam'],
    });
    marks = dedupeMarksByStudentSubject(marks);

    const studentAverages: Record<string, { total: number; count: number }> = {};
    marks.forEach((mark) => {
      if (rosterIds.has(mark.studentId)) {
        accumulateMarkIntoStudentAverages(studentAverages, mark);
      }
    });

    const studentById = new Map(rosterStudents.map((s) => [s.id, s]));
    const rankings = Object.entries(studentAverages)
      .map(([studentId, avg]) => {
        const stu = studentById.get(studentId);
        const markStudent = marks.find((m) => m.studentId === studentId)?.student;
        const nameSource = stu || markStudent;
        return {
          studentId,
          studentName: nameSource
            ? `${nameSource.firstName} ${nameSource.lastName}`
            : 'Unknown',
          average: avg.count > 0 ? avg.total / avg.count : 0,
        };
      })
      .sort((a, b) => b.average - a.average);

    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map((rank) => ({
      ...rank,
      classPosition: rank.position,
    }));

    res.json(rankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting class rankings by type:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getSubjectRankingsByType = async (req: AuthRequest, res: Response) => {
  try {
    const { examType, subjectId, form } = req.query;
    
    if (!examType || !subjectId) {
      return res.status(400).json({ message: 'Exam type and subject ID are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);
    const classRepository = AppDataSource.getRepository(Class);

    let exams: Exam[];

    if (form) {
      const classes = await classRepository.find({ where: { form: form as string } });
      if (classes.length === 0) {
        return res.status(404).json({ message: `No classes found for form: ${form}` });
      }
      const classIds = classes.map(c => c.id);
      exams = await examRepository.find({
        where: {
          type: examType as ExamType,
          classId: In(classIds),
        }
      });
    } else {
      exams = await examRepository.find({
        where: {
          type: examType as ExamType,
        }
      });
    }

    if (exams.length === 0) {
      const msg = form
        ? `No exams found for form ${form} with exam type: ${examType}`
        : `No exams found with exam type: ${examType}`;
      return res.status(404).json({ message: msg });
    }

    const examIds = exams.map(e => e.id);

    // Get all marks for these exams and the specified subject
    const marks = await marksRepository.find({
      where: { 
        examId: In(examIds),
        subjectId: subjectId as string,
      },
      relations: ['student', 'subject', 'student.classEntity']
    });

    // Calculate percentage and aggregate by student (average across all exams)
    const studentMarks: { [key: string]: { scores: number[]; maxScores: number[]; student: Student } } = {};

    marks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentMarks[studentId]) {
        studentMarks[studentId] = {
          scores: [],
          maxScores: [],
          student: mark.student
        };
      }
      studentMarks[studentId].scores.push(Math.round(parseFloat(String(mark.score)) || 0));
      studentMarks[studentId].maxScores.push(Math.round(parseFloat(String(mark.maxScore)) || 100));
    });

    // Calculate average percentage per student
    const subjectRankings = Object.values(studentMarks)
      .map(studentData => {
        const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
        const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
        const stu = studentData.student;
        return {
          studentId: stu.id,
          studentName: `${stu.firstName} ${stu.lastName}`,
          score: totalScore,
          maxScore: totalMaxScore,
          percentage: totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0,
          class: stu.classEntity?.name || 'N/A',
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(subjectRankings);
    const subjectRankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      subjectPosition: rank.position
    }));

    res.json(subjectRankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting subject rankings by type:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getFormRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, form } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    // Get all classes for the form
    const classes = await classRepository.find({ where: { form: form as string } });
    const classIds = classes.map(c => c.id);

    // Get all students in these classes
    const students = await studentRepository.find({
      where: { classId: In(classIds) }
    });

    const studentIds = students.map(s => s.id);

    // Get all marks for these students
    const marks = await marksRepository.find({
      where: { examId: examId as string },
      relations: ['student', 'subject']
    });

    const filteredMarks = marks.filter(m => studentIds.includes(m.studentId));

    // Calculate averages
    const studentAverages: { [key: string]: { total: number; count: number; student: Student } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          student: mark.student
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    const rankings = Object.values(studentAverages)
      .map(avg => ({
        studentId: avg.student.id,
        studentName: `${avg.student.firstName} ${avg.student.lastName}`,
        average: avg.count > 0 ? avg.total / avg.count : 0
      }))
      .sort((a, b) => b.average - a.average);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      formPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getOverallPerformanceRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { form, examType, term } = req.query;

    if (!form || !examType) {
      return res.status(400).json({ message: 'Form and exam type are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const settingsRepository = AppDataSource.getRepository(Settings);

    let termValue = term ? String(term).trim() : '';
    if (!termValue) {
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const settings = settingsList[0];
      termValue = String(settings?.activeTerm || settings?.currentTerm || '').trim();
    }

    const formValue = String(form).trim();
    const classes = await classRepository.find({ where: { form: formValue } });
    if (classes.length === 0) {
      return res.json([]);
    }

    const classIds = classes.map((c) => c.id);
    const students = await findStudentsForFormStream(
      studentRepository,
      classRepository,
      formValue
    );

    const studentClassMap = new Map<string, string>();
    for (const cls of classes) {
      const roster = await findStudentsForClassListing(studentRepository, cls.id);
      for (const student of roster) {
        if (!studentClassMap.has(student.id)) {
          studentClassMap.set(student.id, cls.name);
        }
      }
    }

    const studentById = new Map(students.map((s) => [s.id, s]));
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      return res.json([]);
    }

    const includeDraftExams = isStaffExamViewer(req.user?.role);
    let examIds: string[] = [];

    if (termValue) {
      examIds = await resolveExamIdsForFormStream(
        examRepository,
        marksRepository,
        classIds,
        examType as string,
        termValue,
        includeDraftExams
      );
    }

    if (examIds.length === 0) {
      const exams = await examRepository.find({
        where: {
          classId: In(classIds),
          type: examType as ExamType,
        },
      });
      const usable = includeDraftExams
        ? exams
        : exams.filter((e) => e.status === ExamStatus.PUBLISHED);
      examIds = usable.map((e) => e.id);
    }

    if (examIds.length === 0) {
      return res.json([]);
    }

    let marks = await marksRepository.find({
      where: {
        examId: In(examIds),
        studentId: In(studentIds),
      },
      relations: ['student', 'subject', 'exam'],
    });
    marks = dedupeMarksByStudentSubject(marks);

    const studentAverages: Record<string, { total: number; count: number }> = {};
    marks.forEach((mark) => accumulateMarkIntoStudentAverages(studentAverages, mark));

    const rankings = Object.entries(studentAverages)
      .map(([studentId, avg]) => {
        const stu = studentById.get(studentId);
        return {
          studentId,
          studentName: stu
            ? `${stu.firstName} ${stu.lastName}`
            : marks.find((m) => m.studentId === studentId)?.student
              ? `${marks.find((m) => m.studentId === studentId)!.student.firstName} ${marks.find((m) => m.studentId === studentId)!.student.lastName}`
              : 'Unknown',
          average: avg.count > 0 ? avg.total / avg.count : 0,
          class: studentClassMap.get(studentId) || stu?.classEntity?.name || 'N/A',
        };
      })
      .sort((a, b) => b.average - a.average);

    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map((rank) => ({
      ...rank,
      overallPosition: rank.position,
    }));

    res.json(rankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting overall performance rankings:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getReportCard = async (req: AuthRequest, res: Response) => {
  try {
    console.log('[getReportCard] Route handler called');
    console.log('[getReportCard] Request path:', req.path);
    console.log('[getReportCard] Request method:', req.method);
    console.log('[getReportCard] Request query:', req.query);
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, studentId, term, subjectId } = req.query;
    const user = req.user;
    const isParent = user?.role === 'parent';
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';
    const includeDraftExams = isStaffExamViewer(user?.role);
    const termValue = term ? String(term).trim() : '';
    
    console.log('[getReportCard] Report card request received:', { classId, examType, term: termValue, studentId, subjectId, isParent, isTeacher, isAdmin, query: req.query, path: req.path });
    
    if (!classId || !examType || !termValue) {
      console.log('[getReportCard] Missing required parameters');
      return res.status(400).json({ message: 'Class ID, term, and exam type are required' });
    }

    // Subject filter is optional for all roles; teachers will see their assigned class subjects

    // For parents: lock report card when term invoice balance > 0 (not next-term fees)
    if (isParent && studentId) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const settingsRepository = AppDataSource.getRepository(Settings);
      const studentRepository = AppDataSource.getRepository(Student);

      const parent = await parentRepository.findOne({
        where: { userId: user.id },
        relations: ['students']
      });

      if (!parent) {
        return res.status(404).json({ message: 'Parent profile not found' });
      }

      const student = await studentRepository.findOne({
        where: { id: studentId as string, parentId: parent.id }
      });

      if (!student) {
        return res.status(403).json({ message: 'Student not found or not linked to your account' });
      }

      const termBalance = await getTermBalanceForStudent(student.id);
      if (termBalance > 0) {
        const settingsList = await settingsRepository.find({
          order: { createdAt: 'DESC' },
          take: 1
        });
        const settings = settingsList.length > 0 ? settingsList[0] : null;
        const currencySymbol = settings?.currencySymbol || '$';
        return res.status(403).json({
          message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbol} ${termBalance.toFixed(2)} to view the report card.`,
          balance: termBalance,
          code: 'TERM_BALANCE_LOCKED'
        });
      }
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const classRepository = AppDataSource.getRepository(Class);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Verify class exists
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const classFormText = `${classEntity.form || ''} ${classEntity.name || ''}`.toLowerCase();
    const upperFormKeywords = ['form 5', 'form five', 'form v', 'form 6', 'form six', 'form vi', 'lower six', 'upper six', 'a level', 'as level'];
    const isUpperForm = upperFormKeywords.some(keyword => classFormText.includes(keyword));

    // For teachers, verify assignment to class and subject
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes', 'subjects']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      // Verify teacher teaches this subject
      if (subjectId) {
        const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
        if (!teachesSubject) {
          return res.status(403).json({ message: 'You are not assigned to teach this subject' });
        }
      }
    }

    // Class roster (direct classId, classEntity, or enrollment row — same as GET /students?classId=)
    console.log('Looking for students with classId:', classId);
    const rosterIds = await activeStudentIdsForClass(studentRepository, classId as string);
    let students = await findStudentsForClassListing(studentRepository, classId as string);

    if (students.length === 0 && rosterIds.size > 0) {
      students = await studentRepository.find({
        where: { id: In([...rosterIds]) },
        relations: ['classEntity'],
        order: { firstName: 'ASC', lastName: 'ASC' },
      });
    }

    if (isParent && studentId) {
      const sid = String(studentId);
      const inRoster =
        rosterIds.has(sid) || students.some((s) => s.id === sid);
      if (!inRoster) {
        return res.status(404).json({ message: 'Student not found in this class' });
      }
    }

    console.log('Found students (roster):', students.length);

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }
    
    console.log('Processing', students.length, 'students');

    // Get session exams (staff may use draft sessions; parents/students need published)
    console.log('Looking for exams with classId:', classId, 'term:', termValue, 'and examType:', examType);
    let exams = await resolveExamsForSession(
      examRepository,
      marksRepository,
      classId as string,
      examType as string,
      termValue,
      { includeDrafts: includeDraftExams }
    );

    console.log(
      'Found exams:',
      exams.length,
      exams.map((e) => ({ id: e.id, name: e.name, type: e.type, classId: e.classId, status: e.status }))
    );

    // Subjects for columns: class-assigned ∪ exam-linked (class record alone can omit subjects marks were captured for)
    const classWithSubjects = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });
    let allClassSubjects = mergeClassSubjectsWithExamSubjects(
      classWithSubjects?.subjects || [],
      exams
    );
    console.log('Subjects (class ∪ exams):', allClassSubjects.length, allClassSubjects.map(s => s.name));

    if (subjectId) {
      const subjectIdStr = String(subjectId);
      const selectedSubject = allClassSubjects.find(s => s.id === subjectIdStr);
      if (!selectedSubject) {
        return res.status(404).json({ message: 'Subject not found in this class or exams' });
      }
      allClassSubjects = [selectedSubject];
      console.log('Filtered to selected subject:', allClassSubjects.map(s => s.name));
    }

    if (exams.length === 0) {
      const allClassExams = await examRepository.find({
        where: { classId: classId as string, term: termValue },
        relations: ['subjects'],
      });
      console.log(
        'Total exams for this class and term:',
        allClassExams.length,
        allClassExams.map((e) => ({ name: e.name, type: e.type, status: e.status }))
      );
      const draftOfType = allClassExams.filter(
        (e) => e.type === examType && e.status !== ExamStatus.PUBLISHED
      );
      const hint =
        draftOfType.length > 0 && !includeDraftExams
          ? ' Marks exist in draft — publish this exam type for the term before parents can view report cards.'
          : includeDraftExams
            ? ' Enter marks for this class/term/exam type on Marks Input, or confirm the term label matches the exam session.'
            : '';
      return res.status(404).json({
        message: `No ${examType} exams found for ${termValue}.${hint}`,
        code: 'EXAMS_NOT_FOUND',
      });
    }

    // Get settings for grading (dynamic bands + points)
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const gradePointsDefaults = {
      excellent: settings?.gradePoints?.excellent ?? DEFAULT_GRADE_POINTS.excellent,
      veryGood: settings?.gradePoints?.veryGood ?? DEFAULT_GRADE_POINTS.veryGood,
      good: settings?.gradePoints?.good ?? DEFAULT_GRADE_POINTS.good,
      satisfactory: settings?.gradePoints?.satisfactory ?? DEFAULT_GRADE_POINTS.satisfactory,
      needsImprovement: settings?.gradePoints?.needsImprovement ?? DEFAULT_GRADE_POINTS.needsImprovement,
      basic: settings?.gradePoints?.basic ?? DEFAULT_GRADE_POINTS.basic,
      fail: settings?.gradePoints?.fail ?? DEFAULT_GRADE_POINTS.fail
    };

    // Get all marks for all students and exams, filtered by subject if provided
    const examIds = exams.map(e => e.id);
    console.log('Looking for marks with examIds:', examIds, 'subjectId:', subjectId);
    
    if (examIds.length === 0) {
      return res.status(404).json({ message: 'No exam IDs found' });
    }
    
    const marksWhere: any = { examId: In(examIds) };
    if (subjectId) {
      marksWhere.subjectId = subjectId as string;
    }
    
    let allMarks = await marksRepository.find({
      where: marksWhere,
      relations: ['subject', 'exam', 'student']
    });
    allMarks = dedupeMarksByStudentSubject(allMarks);
    console.log('Found marks:', allMarks.length, subjectId ? `(filtered by subject ${subjectId})` : '(all subjects)');

    if (!subjectId) {
      allClassSubjects = sortSubjectsByName(mergeSubjectsWithMarksSubjects(allClassSubjects, allMarks));
      console.log('Subjects (after marks):', allClassSubjects.length, allClassSubjects.map(s => s.name));
    }

    // Calculate class averages for each subject
    // Class Average = Total marks scored by all students in a subject / number of students who wrote the exam
    const classAverages: { [key: string]: number } = {};
    
    // Group marks by subject
    const marksBySubject: { [key: string]: any[] } = {};
    allMarks.forEach(mark => {
      if (!mark.subject || !mark.score || mark.maxScore === 0) {
        return;
      }
      const subjectName = mark.subject.name;
      if (!marksBySubject[subjectName]) {
        marksBySubject[subjectName] = [];
      }
      marksBySubject[subjectName].push(mark);
    });

    // Calculate class average for each subject (as percentage)
    Object.keys(marksBySubject).forEach(subjectName => {
      const subjectMarks = marksBySubject[subjectName];
      
      // Group marks by student to calculate each student's percentage
      const studentMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[] } } = {};
      
      subjectMarks.forEach(mark => {
        if (mark.studentId && mark.score && mark.maxScore) {
          if (!studentMarksMap[mark.studentId]) {
            studentMarksMap[mark.studentId] = { scores: [], maxScores: [], percentages: [] };
          }
          // Use uniformMark if available (moderated mark), otherwise use original score
          const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
          if (hasUniformMark) {
            // uniformMark is stored as percentage (0-100)
            const uniformMarkPercentage = parseFloat(String(mark.uniformMark));
            studentMarksMap[mark.studentId].percentages.push(uniformMarkPercentage);
          } else {
            // Use original score to calculate percentage
            const score = parseFloat(String(mark.score || 0));
            const maxScore = parseFloat(String(mark.maxScore || 0));
            studentMarksMap[mark.studentId].scores.push(score);
            studentMarksMap[mark.studentId].maxScores.push(maxScore);
          }
        }
      });
      
      // Calculate percentage for each student, then average those percentages
      const studentPercentages: number[] = [];
      Object.keys(studentMarksMap).forEach(studentId => {
        const studentData = studentMarksMap[studentId];
        if (studentData.percentages && studentData.percentages.length > 0) {
          // Use uniformMark percentages if available
          const avgPercentage = studentData.percentages.reduce((a, b) => a + b, 0) / studentData.percentages.length;
          studentPercentages.push(avgPercentage);
        } else {
          // Calculate from original scores
          const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
          if (totalMaxScore > 0) {
            const percentage = (totalScore / totalMaxScore) * 100;
            studentPercentages.push(percentage);
          }
        }
      });
      
      // Calculate class average as average of all student percentages
      if (studentPercentages.length > 0) {
        const sumPercentages = studentPercentages.reduce((sum, p) => sum + p, 0);
        classAverages[subjectName] = Math.round(sumPercentages / studentPercentages.length);
      } else {
        classAverages[subjectName] = 0;
      }
    });

    // Group marks by student and calculate report cards
    const reportCards: any[] = [];
    
    // Get student IDs for the current class only
    const classStudentIds = new Set(students.map(s => s.id));
    
    // Filter marks to only include students from the current class for class ranking
    const classMarks = allMarks.filter(mark => classStudentIds.has(mark.studentId));
    
    // Calculate class rankings (only for students in the current class)
    const classStudentAverages: { [key: string]: { total: number; count: number } } = {};
    classMarks.forEach(mark => {
      // Skip marks with missing data
      if (!mark.studentId || !mark.maxScore || mark.maxScore === 0) {
        return;
      }
      
      // Skip if no score and no uniformMark
      if ((!mark.score || mark.score === 0) && (mark.uniformMark === null || mark.uniformMark === undefined)) {
        return;
      }
      
      const sid = mark.studentId;
      if (!classStudentAverages[sid]) {
        classStudentAverages[sid] = { total: 0, count: 0 };
      }
      
      // Use uniformMark if available (moderated mark), otherwise use original score
      const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
      const percentage = hasUniformMark 
        ? parseFloat(String(mark.uniformMark)) // uniformMark is already a percentage
        : ((mark.score || 0) / mark.maxScore) * 100;
      
      classStudentAverages[sid].total += percentage;
      classStudentAverages[sid].count += 1;
    });

    const classRankingsUnsorted = Object.entries(classStudentAverages)
      .map(([sid, avg]) => ({
        studentId: sid,
        average: avg.count > 0 ? avg.total / avg.count : 0
      }))
      .sort((a, b) => b.average - a.average);
    
    // Assign positions with proper tie handling
    const classRankings: Array<{ studentId: string; average: number; position: number }> = assignPositionsWithTies(classRankingsUnsorted).map(r => ({
      studentId: r.studentId,
      average: r.average,
      position: r.position
    }));

    // Grade/stream position: rank against every student in the same form (all classes in stream)
    const streamForm = (classEntity.form || '').trim();
    const formRankingsMap = new Map<
      string,
      Array<{ studentId: string; average: number; position: number }>
    >();
    const formStreamTotalsMap = new Map<string, number>();

    if (streamForm) {
      const allFormStudentsList = await findStudentsForFormStream(
        studentRepository,
        classRepository,
        streamForm
      );
      formStreamTotalsMap.set(streamForm, allFormStudentsList.length);

      const allClassIdsWithSameForm = (
        await classRepository.find({ where: { form: streamForm } })
      ).map((c) => c.id);

      const allFormExamIds = await resolveExamIdsForFormStream(
        examRepository,
        marksRepository,
        allClassIdsWithSameForm,
        examType as string,
        termValue,
        includeDraftExams
      );
      console.log(
        '[getReportCard] Form stream',
        streamForm,
        'classes=',
        allClassIdsWithSameForm.length,
        'roster=',
        allFormStudentsList.length,
        'sessionExams=',
        allFormExamIds.length
      );

      const formStudentIds = allFormStudentsList.map((s) => s.id);
      let formMarks =
        formStudentIds.length > 0 && allFormExamIds.length > 0
          ? await marksRepository.find({
              where: {
                examId: In(allFormExamIds),
                studentId: In(formStudentIds),
              },
              relations: ['subject', 'exam', 'student'],
            })
          : [];
      formMarks = dedupeMarksByStudentSubject(formMarks);

      const formStudentAverages: Record<string, { total: number; count: number }> = {};
      formMarks.forEach((mark) => accumulateMarkIntoStudentAverages(formStudentAverages, mark));
      const formRanks = studentAveragesToRankings(formStudentAverages);
      formRankingsMap.set(streamForm, formRanks);
      console.log('[getReportCard] Form stream ranked students:', formRanks.length);
    }

    const subjectPositionLookup = buildSubjectPositionLookup(
      classMarks,
      allClassSubjects.map((s) => s.name)
    );

    // Second pass: generate report cards for each student
    for (const student of students) {
      if (isParent && studentId && student.id !== studentId) {
        continue;
      }
      // Get all marks for this student across all exams of this type
      const studentMarks = allMarks.filter(m => m.studentId === student.id);

      // Group marks by subject (across all exams)
      const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[]; comments: string[] } } = {};

      studentMarks.forEach(mark => {
        // Skip marks with missing subject
        if (!mark.subject) {
          console.warn('Skipping mark with missing subject:', { markId: mark.id });
          return;
        }
        
        // Check if mark has either score or uniformMark
        const hasScore = mark.score !== null && mark.score !== undefined;
        const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
        
        // Skip if neither score nor uniformMark is available
        if (!hasScore && !hasUniformMark) {
          console.warn('Skipping mark with no score or uniformMark:', { markId: mark.id });
          return;
        }
        
        const subjectName = mark.subject.name;
        if (!subjectMarksMap[subjectName]) {
          subjectMarksMap[subjectName] = { scores: [], maxScores: [], percentages: [], comments: [] };
        }
        
        // Use maxScore if available, otherwise default to 100
        const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
        
        // Prioritize uniformMark if available (moderated mark), otherwise use original score
        if (hasUniformMark) {
          // uniformMark is stored as percentage (0-100)
          const uniformMarkPercentage = parseFloat(String(mark.uniformMark));
          if (!Number.isFinite(uniformMarkPercentage) || uniformMarkPercentage < 0 || uniformMarkPercentage > 100) {
            console.warn('Skipping mark with invalid uniformMark percentage:', { markId: mark.id, uniformMarkPercentage });
            return;
          }
          // Calculate score from uniformMark percentage for display purposes
          const scoreFromUniform = Math.round((uniformMarkPercentage / 100) * maxScore);
          subjectMarksMap[subjectName].scores.push(scoreFromUniform);
          subjectMarksMap[subjectName].percentages.push(uniformMarkPercentage);
          subjectMarksMap[subjectName].maxScores.push(Math.round(maxScore));
        } else if (hasScore) {
          // Use original score only if uniformMark is not available
          const originalScore = Math.round(parseFloat(String(mark.score)) || 0);
          if (!Number.isFinite(originalScore) || originalScore < 0 || originalScore > maxScore) {
            console.warn('Skipping mark with invalid score range:', { markId: mark.id, originalScore, maxScore });
            return;
          }
          const originalPercentage = maxScore > 0 ? (originalScore / maxScore) * 100 : 0;
          subjectMarksMap[subjectName].scores.push(originalScore);
          subjectMarksMap[subjectName].percentages.push(originalPercentage);
          subjectMarksMap[subjectName].maxScores.push(Math.round(maxScore));
        }
        
        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      });

      // Create a map of all class subjects
      const allSubjectsMap = new Map(allClassSubjects.map(s => [s.name, s]));

      // Calculate subject data - include ALL subjects from the class
      const subjectData = allClassSubjects.map(classSubject => {
        const subjectName = classSubject.name;
        const subjectCode = classSubject.code || '';
        const marksData = subjectMarksMap[subjectName];
        const classAverage = classAverages[subjectName] || 0;
        const spInfo = subjectPositionLookup.get(subjectPositionLookupKey(student.id, subjectName));
        const subjectPosition = spInfo ? `${spInfo.position}/${spInfo.total}` : undefined;

        if (marksData && (marksData.scores.length > 0 || marksData.percentages.length > 0)) {
          // Student has marks for this subject
          let totalScore = 0;
          let totalMaxScore = 0;
          let percentage = 0;

          // Prioritize uniformMark percentages if available
          if (marksData.percentages.length > 0) {
            // Use average of uniformMark percentages if available
            percentage = marksData.percentages.reduce((a, b) => a + b, 0) / marksData.percentages.length;
            // For display, convert percentage back to a score out of 100 (or use maxScore if available)
            totalMaxScore = marksData.maxScores.length > 0 
              ? marksData.maxScores.reduce((a, b) => a + b, 0) / marksData.maxScores.length
              : 100;
            totalScore = Math.round((percentage / 100) * totalMaxScore);
          } else {
            // Calculate from original scores
            totalScore = marksData.scores.reduce((a, b) => a + b, 0);
            totalMaxScore = marksData.maxScores.reduce((a, b) => a + b, 0);
            percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
          }
          
          const gradeInfo = getGradeInfoFromSettings(percentage, settings);
          const subjectPoints = isUpperForm
            ? getGradePointValue(gradeInfo.key, settings?.gradePoints, gradePointsDefaults)
            : undefined;
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: Math.round(totalScore),
            maxScore: Math.round(totalMaxScore),
            percentage: Math.round(percentage).toString(),
            classAverage: classAverage,
            comments: marksData.comments.join('; ') || undefined,
            grade: gradeInfo.label,
            points: subjectPoints,
            subjectPosition
          };
        } else {
          // Student has no marks for this subject - show as N/A
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: 0,
            maxScore: 0,
            percentage: '0',
            classAverage: classAverage,
            comments: 'Not taken',
            grade: 'N/A',
            points: undefined,
            subjectPosition: undefined
          };
        }
      });

      // Calculate overall average (only for subjects with marks, not N/A)
      const subjectsWithMarks = subjectData.filter((sub: any) => sub.grade !== 'N/A');
      const totalPercentage = subjectsWithMarks.reduce((sum: number, sub: any) => sum + parseFloat(sub.percentage), 0);
      const overallAverage = subjectsWithMarks.length > 0 ? Math.round(totalPercentage / subjectsWithMarks.length) : 0;
      const totalPoints = isUpperForm
        ? subjectsWithMarks.reduce((sum: number, sub: any) => sum + (sub.points || 0), 0)
        : undefined;

      // Find class position (only within the current class) - using position from tie-handled rankings
      const classRankEntry = classRankings.find(r => r.studentId === student.id);
      const classPosition = classRankEntry?.position || 0;
      
      // Grade position across the whole form/stream (e.g. all Form 1 classes)
      const studentForm = (student.classEntity?.form || streamForm || '').trim();
      let formPosition = 0;
      let totalStudentsPerStream = 0;
      if (studentForm) {
        totalStudentsPerStream = formStreamTotalsMap.get(studentForm) ?? 0;
        const formRanks = formRankingsMap.get(studentForm);
        const formRankEntry = formRanks?.find((r) => r.studentId === student.id);
        if (formRankEntry) {
          formPosition = formRankEntry.position;
        }
      }
      
      // Get remarks for this student's report card
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      const remarks = await remarksRepository.findOne({
        where: {
          studentId: student.id,
          classId: classId as string,
          examType: examType as string,
        }
      });

      // Get total attendance for this student for the term
      const attendanceRepository = AppDataSource.getRepository(Attendance);
      const attendanceRecords = await attendanceRepository.find({
        where: {
          studentId: student.id,
          term: termValue,
        }
      });
      const totalAttendance = attendanceRecords.length;
      const presentAttendance = attendanceRecords.filter(a => 
        a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.EXCUSED
      ).length;

      reportCards.push({
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name || classEntity.name
        },
        examType: examType,
        exams: (() => {
          // Remove duplicate exams by name to avoid showing the same exam multiple times
          const uniqueExams = new Map<string, { id: string; name: string; examDate: Date }>();
          exams.forEach(e => {
            if (!uniqueExams.has(e.name)) {
              uniqueExams.set(e.name, { id: e.id, name: e.name, examDate: e.examDate });
            }
          });
          return Array.from(uniqueExams.values());
        })(),
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
        overallGrade: getGradeLabelOnly(overallAverage, settings),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        streamForm: streamForm || studentForm || null,
        totalStudents: students.length,
        totalStudentsPerStream: totalStudentsPerStream || 0,
        totalAttendance: totalAttendance, // Total attendance days for the term
        presentAttendance: presentAttendance, // Present/excused attendance days
        remarks: {
          id: remarks?.id || null,
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date(),
        totalPoints: totalPoints,
        isUpperForm,
        settings: {
          schoolName: settings?.schoolName,
          schoolAddress: settings?.schoolAddress,
          schoolPhone: settings?.schoolPhone,
          academicYear: settings?.academicYear
        }
      });
    }

    // Note: We now include all students, even if they have no marks (subjects will show as N/A)
    // Only skip if there are no students at all
    if (reportCards.length === 0) {
      return res.status(404).json({ message: 'No report cards generated. No students found in this class.' });
    }

    res.json({ reportCards, class: classEntity.name, form: classEntity.form, examType, term: termValue, isUpperForm });
  } catch (error: any) {
    console.error('Error generating report cards:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getResultsAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, term } = req.query;
    if (!classId || !examType || !term) {
      return res.status(400).json({ message: 'classId, examType and term are required' });
    }

    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const passMin = getPassThresholdPercentForMarkSheet(settings);

    const students = await studentRepository.find({
      where: { classId: classId as string },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });
    const totalStudents = students.length;
    if (totalStudents === 0) {
      return res.json({ classId, examType, term, passMin, results: [] });
    }

    const exams = await examRepository.find({
      where: { classId: classId as string, type: examType as any, term: String(term) },
      relations: ['subjects']
    });
    const examIds = exams.map((e) => e.id);
    if (examIds.length === 0) {
      return res.json({ classId, examType, term, passMin, results: [] });
    }

    const marks = await marksRepository.find({
      where: { examId: In(examIds), studentId: In(students.map((s) => s.id)) },
      relations: ['subject']
    });

    const subjectList = classEntity.subjects || [];
    const subjectKey = (s: any) => s?.id || s?.name;

    const marksBySubjectStudent = new Map<string, number[]>();

    const addPct = (subjectId: string, studentId: string, pct: number) => {
      const k = `${subjectId}__${studentId}`;
      const arr = marksBySubjectStudent.get(k) || [];
      arr.push(pct);
      marksBySubjectStudent.set(k, arr);
    };

    for (const m of marks) {
      if (!m.subjectId) continue;
      const maxScore = m.maxScore && Number(m.maxScore) > 0 ? parseFloat(String(m.maxScore)) : 100;
      if (!Number.isFinite(maxScore) || maxScore <= 0) continue;

      const hasUniform = m.uniformMark !== null && m.uniformMark !== undefined;
      const hasScore = m.score !== null && m.score !== undefined;

      if (hasUniform) {
        const pct = parseFloat(String(m.uniformMark));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) continue;
        addPct(m.subjectId, m.studentId, pct);
      } else if (hasScore) {
        const score = parseFloat(String(m.score));
        if (!Number.isFinite(score) || score < 0 || score > maxScore) continue;
        const pct = (score / maxScore) * 100;
        addPct(m.subjectId, m.studentId, pct);
      }
    }

    const results = subjectList.map((sub: any) => {
      const sid = String(sub.id);
      let passed = 0;
      let withMarks = 0;

      for (const st of students) {
        const arr = marksBySubjectStudent.get(`${sid}__${st.id}`) || [];
        if (arr.length === 0) continue;
        withMarks++;
        const avgPct = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (avgPct >= passMin) passed++;
      }

      const passRate = totalStudents > 0 ? (passed / totalStudents) * 100 : 0;
      return {
        subject: sub.name,
        subjectCode: sub.code || '',
        passRate: Math.round(passRate * 100) / 100,
        passed,
        totalStudents,
        withMarks
      };
    });

    res.json({ classId, examType, term, passMin, results });
  } catch (error: any) {
    console.error('Error generating results analysis:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getResultsAnalysisForSubject = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, term, subjectId } = req.query;
    if (!classId || !examType || !term || !subjectId) {
      return res
        .status(400)
        .json({ message: 'classId, examType, term and subjectId are required' });
    }

    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const examRepository = AppDataSource.getRepository(Exam);
    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
    });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const subject = await subjectRepository.findOne({
      where: { id: subjectId as string },
    });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const students = await studentRepository.find({
      where: { classId: classId as string },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    const totalStudents = students.length;

    const exams = await examRepository.find({
      where: { classId: classId as string, type: examType as any, term: String(term) },
      relations: ['subjects'],
    });
    const examIds = exams.map((e) => e.id);
    if (examIds.length === 0) {
      return res.json({
        classId,
        examType,
        term,
        subjectId,
        subjectName: subject.name,
        top5: [],
        bottom5: [],
        gradeDistribution: [],
      });
    }

    const marks = await marksRepository.find({
      where: {
        examId: In(examIds),
        studentId: In(students.map((s) => s.id)),
        subjectId: subjectId as string,
      },
      relations: ['student'],
    });

    // aggregate percentage per student across exams
    const pctMap = new Map<string, number[]>();
    for (const m of marks) {
      const maxScore = m.maxScore && Number(m.maxScore) > 0 ? parseFloat(String(m.maxScore)) : 100;
      if (!Number.isFinite(maxScore) || maxScore <= 0) continue;

      const hasUniform = m.uniformMark !== null && m.uniformMark !== undefined;
      const hasScore = m.score !== null && m.score !== undefined;

      let pct: number | null = null;
      if (hasUniform) {
        const u = parseFloat(String(m.uniformMark));
        if (Number.isFinite(u) && u >= 0 && u <= 100) pct = u;
      } else if (hasScore) {
        const s = parseFloat(String(m.score));
        if (Number.isFinite(s) && s >= 0 && s <= maxScore) pct = (s / maxScore) * 100;
      }
      if (pct === null) continue;

      const arr = pctMap.get(m.studentId) || [];
      arr.push(pct);
      pctMap.set(m.studentId, arr);
    }

    const rows = Array.from(pctMap.entries()).map(([studentId, arr]) => {
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const st = students.find((s) => s.id === studentId);
      const name = st ? `${st.firstName} ${st.lastName}`.trim() : studentId;
      const grade = getGradeInfoFromSettings(avg, settings);
      return {
        studentId,
        studentName: name,
        percentage: Math.round(avg * 100) / 100,
        gradeLabel: grade.label,
      };
    });

    const sortedDesc = [...rows].sort((a, b) => b.percentage - a.percentage);
    const sortedAsc = [...rows].sort((a, b) => a.percentage - b.percentage);

    const top5 = sortedDesc.slice(0, 5);
    const bottom5 = sortedAsc.slice(0, 5);

    const dist = new Map<string, number>();
    for (const r of rows) {
      const k = r.gradeLabel || 'N/A';
      dist.set(k, (dist.get(k) || 0) + 1);
    }
    const gradeDistribution = Array.from(dist.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      classId,
      examType,
      term,
      subjectId,
      subjectName: subject.name,
      totalStudents,
      studentsWithMarks: rows.length,
      top5,
      bottom5,
      gradeDistribution,
    });
  } catch (error: any) {
    console.error('Error generating subject analysis:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateReportCardPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, examId, classId, examType, term } = req.query;
    const user = req.user;
    const isParent = user?.role === 'parent';
    const termValue = term ? String(term).trim() : null;
    
    console.log('PDF generation request:', { studentId, examId, classId, examType, term: termValue, isParent, query: req.query });

    if (!examId && (!classId || !examType || !termValue)) {
      return res.status(400).json({ message: 'Class ID, term, and exam type are required when exam ID is not provided' });
    }

    // For parents: lock PDF when term invoice balance > 0 (not next-term fees)
    if (isParent && studentId) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const settingsRepository = AppDataSource.getRepository(Settings);
      const studentRepository = AppDataSource.getRepository(Student);

      const parent = await parentRepository.findOne({
        where: { userId: user.id }
      });

      if (!parent) {
        return res.status(404).json({ message: 'Parent profile not found' });
      }

      const student = await studentRepository.findOne({
        where: { id: studentId as string, parentId: parent.id }
      });

      if (!student) {
        return res.status(403).json({ message: 'Student not found or not linked to your account' });
      }

      const termBalance = await getTermBalanceForStudent(student.id);
      if (termBalance > 0) {
        const settingsList = await settingsRepository.find({
          order: { createdAt: 'DESC' },
          take: 1
        });
        const settings = settingsList.length > 0 ? settingsList[0] : null;
        const currencySymbol = settings?.currencySymbol || '$';
        return res.status(403).json({
          message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbol} ${termBalance.toFixed(2)} to view the report card.`,
          balance: termBalance,
          code: 'TERM_BALANCE_LOCKED'
        });
      }
    }
    
    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const examRepository = AppDataSource.getRepository(Exam);
    const classRepository = AppDataSource.getRepository(Class);

    // Load settings once for the PDF generation context
    const pdfSettingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const activeSettings = pdfSettingsList.length > 0 ? pdfSettingsList[0] : null;

    const defaultGradePointsPdf = {
      excellent: 12,
      veryGood: 10,
      good: 8,
      satisfactory: 6,
      needsImprovement: 4,
      basic: 2,
      fail: 0
    };

    const gradePointsPdf = {
      excellent: activeSettings?.gradePoints?.excellent ?? defaultGradePointsPdf.excellent,
      veryGood: activeSettings?.gradePoints?.veryGood ?? defaultGradePointsPdf.veryGood,
      good: activeSettings?.gradePoints?.good ?? defaultGradePointsPdf.good,
      satisfactory: activeSettings?.gradePoints?.satisfactory ?? defaultGradePointsPdf.satisfactory,
      needsImprovement: activeSettings?.gradePoints?.needsImprovement ?? defaultGradePointsPdf.needsImprovement,
      basic: activeSettings?.gradePoints?.basic ?? defaultGradePointsPdf.basic,
      fail: activeSettings?.gradePoints?.fail ?? defaultGradePointsPdf.fail
    };

    // Support both old format (studentId + examId) and new format (classId + examType + studentId)
    let reportCardData: any;

    if (classId && examType && studentId) {
      if (!termValue) {
        return res.status(400).json({ message: 'Term is required to generate report card PDF when using class and exam type' });
      }
      console.log('Using new format: classId + examType + studentId');
      // New format: generate from aggregated report card data
      const student = await studentRepository.findOne({
        where: { id: studentId as string },
        relations: ['classEntity']
      });

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const classDescriptor = `${student.classEntity?.form || ''} ${student.classEntity?.name || ''}`.toLowerCase();
      const upperFormKeywordsPdf = ['form 5', 'form five', 'form v', 'form 6', 'form six', 'form vi', 'lower six', 'upper six', 'a level', 'as level'];
      const isUpperForm = upperFormKeywordsPdf.some(keyword => classDescriptor.includes(keyword));

      const exams = await resolveExamsForSession(
        examRepository,
        marksRepository,
        classId as string,
        examType as string,
        termValue,
        { includeDrafts: isStaffExamViewer(req.user?.role) }
      );

      if (exams.length === 0) {
        return res.status(404).json({
          message: `No ${examType} exams found for ${termValue}. Enter marks or publish the exam session first.`,
          code: 'EXAMS_NOT_FOUND',
        });
      }

      const classWithSubjects = await classRepository.findOne({
        where: { id: classId as string },
        relations: ['subjects']
      });

      const examIds = exams.map((e) => e.id);
      const allMarks = await marksRepository.find({
        where: { examId: In(examIds), studentId: studentId as string },
        relations: ['subject', 'exam', 'student']
      });

      let allClassSubjects = mergeClassSubjectsWithExamSubjects(
        classWithSubjects?.subjects || [],
        exams
      );
      allClassSubjects = sortSubjectsByName(
        mergeSubjectsWithMarksSubjects(allClassSubjects, allMarks)
      );
      console.log(
        'PDF report card subjects (class ∪ exams ∪ marks):',
        allClassSubjects.length,
        allClassSubjects.map((s) => s.name)
      );
      
      // Get all marks for all students in the class to calculate class averages
      const allClassMarksForAverage = await marksRepository.find({
        where: { examId: In(examIds) },
        relations: ['subject', 'exam', 'student']
      });
      
      // Calculate class averages for each subject
      const classAverages: { [key: string]: number } = {};
      const marksBySubject: { [key: string]: any[] } = {};
      
      allClassMarksForAverage.forEach(mark => {
        if (!mark.subject || !mark.score || mark.maxScore === 0) {
          return;
        }
        const subjectName = mark.subject.name;
        if (!marksBySubject[subjectName]) {
          marksBySubject[subjectName] = [];
        }
        marksBySubject[subjectName].push(mark);
      });

      // Calculate class average for each subject (as percentage)
      Object.keys(marksBySubject).forEach(subjectName => {
        const subjectMarks = marksBySubject[subjectName];
        
      // Group marks by student to calculate each student's percentage
      const studentMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[] } } = {};
        
        subjectMarks.forEach(mark => {
          if (mark.studentId && mark.maxScore) {
            // Skip if no score and no uniformMark
            if ((!mark.score || mark.score === 0) && (mark.uniformMark === null || mark.uniformMark === undefined)) {
              return;
            }
            if (!studentMarksMap[mark.studentId]) {
              studentMarksMap[mark.studentId] = { scores: [], maxScores: [], percentages: [] };
            }
            // Use uniformMark if available (moderated mark), otherwise use original score
            const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
            if (hasUniformMark) {
              // uniformMark is stored as percentage (0-100)
              const uniformMarkPercentage = parseFloat(String(mark.uniformMark));
              studentMarksMap[mark.studentId].percentages.push(uniformMarkPercentage);
            } else {
              // Use original score to calculate percentage
              const score = parseFloat(String(mark.score || 0));
              const maxScore = parseFloat(String(mark.maxScore || 0));
              studentMarksMap[mark.studentId].scores.push(score);
              studentMarksMap[mark.studentId].maxScores.push(maxScore);
            }
          }
        });
        
        // Calculate percentage for each student, then average those percentages
        const studentPercentages: number[] = [];
        Object.keys(studentMarksMap).forEach(studentId => {
          const studentData = studentMarksMap[studentId];
          if (studentData.percentages && studentData.percentages.length > 0) {
            // Use uniformMark percentages if available
            const avgPercentage = studentData.percentages.reduce((a, b) => a + b, 0) / studentData.percentages.length;
            studentPercentages.push(avgPercentage);
          } else {
            // Calculate from original scores
            const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
            const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
            if (totalMaxScore > 0) {
              const percentage = (totalScore / totalMaxScore) * 100;
              studentPercentages.push(percentage);
            }
          }
        });
        
        // Calculate class average as average of all student percentages
        if (studentPercentages.length > 0) {
          const sumPercentages = studentPercentages.reduce((sum, p) => sum + p, 0);
          classAverages[subjectName] = Math.round(sumPercentages / studentPercentages.length);
        } else {
          classAverages[subjectName] = 0;
        }
      });
      
      // Note: We now include all subjects from the class, even if student has no marks

      const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; comments: string[] } } = {};

      allMarks.forEach((mark) => {
        if (!mark.subject) return;
        const hasScore = mark.score !== null && mark.score !== undefined;
        const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
        if (!hasScore && !hasUniformMark) return;

        const maxScore =
          mark.maxScore && Number(mark.maxScore) > 0
            ? parseFloat(String(mark.maxScore))
            : 100;
        const subjectName = mark.subject.name;
        if (!subjectMarksMap[subjectName]) {
          subjectMarksMap[subjectName] = { scores: [], maxScores: [], comments: [] };
        }

        if (hasUniformMark) {
          const uniformPct = parseFloat(String(mark.uniformMark));
          const scoreFromUniform = Math.round((uniformPct / 100) * maxScore);
          subjectMarksMap[subjectName].scores.push(scoreFromUniform);
          subjectMarksMap[subjectName].maxScores.push(Math.round(maxScore));
        } else {
          subjectMarksMap[subjectName].scores.push(Math.round(parseFloat(String(mark.score)) || 0));
          subjectMarksMap[subjectName].maxScores.push(Math.round(maxScore));
        }
        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      });

      const classMarksForSubjectRank = allClassMarksForAverage.filter(
        (m) => m.student && m.student.classId === student.classId
      );
      const subjectPositionLookupPdf = buildSubjectPositionLookup(
        classMarksForSubjectRank,
        allClassSubjects.map((s) => s.name)
      );

      // Calculate subject data - include ALL subjects from the class
      const subjectData = allClassSubjects.map(classSubject => {
        const subjectName = classSubject.name;
        const subjectCode = classSubject.code || '';
        const marksData = subjectMarksMap[subjectName];
        const classAverage = classAverages[subjectName] || 0;
        const spInfo = subjectPositionLookupPdf.get(subjectPositionLookupKey(student.id, subjectName));
        const subjectPosition = spInfo ? `${spInfo.position}/${spInfo.total}` : undefined;

        if (marksData && marksData.scores.length > 0) {
          // Student has marks for this subject
          const totalScore = marksData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = marksData.maxScores.reduce((a, b) => a + b, 0);
          const percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
          const gradeInfo = getGradeInfoFromSettings(percentage, activeSettings);
          const points = isUpperForm
            ? getGradePointValue(gradeInfo.key, activeSettings?.gradePoints, gradePointsPdf)
            : undefined;
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: Math.round(totalScore),
            maxScore: Math.round(totalMaxScore),
            percentage: Math.round(percentage).toString(),
            classAverage: classAverage,
            comments: marksData.comments.join('; ') || undefined,
            grade: gradeInfo.label,
            points,
            subjectPosition
          };
        } else {
          // Student has no marks for this subject - show as N/A
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: 0,
            maxScore: 0,
            percentage: '0',
            classAverage: classAverage,
            comments: 'Not taken',
            grade: 'N/A',
            points: undefined,
            subjectPosition: undefined
          };
        }
      });

      // Calculate overall average (only for subjects with marks, not N/A)
      const subjectsWithMarks = subjectData.filter(sub => sub.grade !== 'N/A');
      const totalPercentage = subjectsWithMarks.reduce((sum, sub) => sum + parseFloat(sub.percentage), 0);
      const overallAverage = subjectsWithMarks.length > 0 ? totalPercentage / subjectsWithMarks.length : 0;
      const totalPoints = isUpperForm
        ? subjectsWithMarks.reduce((sum, sub) => sum + (sub.points || 0), 0)
        : undefined;

      // Calculate class position
      const allClassMarks = await marksRepository.find({
        where: { examId: In(examIds) },
        relations: ['student', 'subject']
      });

      const classMarks = allClassMarks.filter(m => m.student.classId === student.classId);
      const studentAverages: { [key: string]: { total: number; count: number } } = {};

      classMarks.forEach(mark => {
        const sid = mark.studentId;
        if (!studentAverages[sid]) {
          studentAverages[sid] = { total: 0, count: 0 };
        }
        studentAverages[sid].total += (mark.score / mark.maxScore) * 100;
        studentAverages[sid].count += 1;
      });

      const rankingsUnsorted = Object.entries(studentAverages)
        .map(([sid, avg]) => ({
          studentId: sid,
          average: avg.count > 0 ? avg.total / avg.count : 0
        }))
        .sort((a, b) => b.average - a.average);
      
      // Assign positions with proper tie handling
      const rankings = assignPositionsWithTies(rankingsUnsorted);
      const classRankEntry = rankings.find(r => r.studentId === studentId);
      const classPosition = classRankEntry?.position || 0;

      let formPosition = 0;
      let totalStudentsPerStream = 0;
      const classEntityForPdf = await classRepository.findOne({
        where: { id: classId as string },
      });
      const streamFormPdf = (
        classEntityForPdf?.form ||
        student.classEntity?.form ||
        ''
      ).trim();

      if (streamFormPdf) {
        const formStudentsList = await findStudentsForFormStream(
          studentRepository,
          classRepository,
          streamFormPdf
        );
        totalStudentsPerStream = formStudentsList.length;

        const formClassIds = (
          await classRepository.find({ where: { form: streamFormPdf } })
        ).map((c) => c.id);

        let allFormExams = await examRepository.find({
          where: {
            classId: In(formClassIds),
            type: examType as any,
            term: termValue,
          },
          relations: ['subjects'],
        });
        if (!isStaffExamViewer(req.user?.role)) {
          allFormExams = allFormExams.filter((e) => e.status === ExamStatus.PUBLISHED);
        }
        const allFormExamIds = allFormExams.map((e) => e.id);

        const formMarks =
          allFormExamIds.length > 0 && formStudentsList.length > 0
            ? await marksRepository.find({
                where: {
                  examId: In(allFormExamIds),
                  studentId: In(formStudentsList.map((s) => s.id)),
                },
                relations: ['student', 'subject'],
              })
            : [];

        const formStudentAverages: Record<string, { total: number; count: number }> = {};
        formMarks.forEach((mark) => accumulateMarkIntoStudentAverages(formStudentAverages, mark));
        const formRankings = studentAveragesToRankings(formStudentAverages);
        const formRankEntry = formRankings.find((r) => r.studentId === studentId);
        if (formRankEntry) {
          formPosition = formRankEntry.position;
        }
      }

      // Get remarks for PDF
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      const remarks = await remarksRepository.findOne({
        where: {
          studentId: studentId as string,
          classId: classId as string,
          examType: examType as string,
        }
      });

      // Get total attendance for this student for the term
      const attendanceRepository = AppDataSource.getRepository(Attendance);
      const attendanceRecords = await attendanceRepository.find({
        where: {
          studentId: studentId as string,
          term: termValue,
        }
      });
      const totalAttendance = attendanceRecords.length;
      const presentAttendance = attendanceRecords.filter(a => 
        a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.EXCUSED
      ).length;

      // Get total number of students in the class with marks (for ranking)
      const totalStudents = rankings.length;

      reportCardData = {
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name || ''
        },
        examType: examType,
        exams: (() => {
          // Remove duplicate exams by name to avoid showing the same exam multiple times
          const uniqueExams = new Map<string, { id: string; name: string; examDate: Date }>();
          exams.forEach(e => {
            if (!uniqueExams.has(e.name)) {
              uniqueExams.set(e.name, { id: e.id, name: e.name, examDate: e.examDate });
            }
          });
          return Array.from(uniqueExams.values());
        })(),
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
        overallGrade: getGradeLabelOnly(overallAverage, activeSettings),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        totalStudents: totalStudents, // Add total number of students
        totalStudentsPerStream: totalStudentsPerStream || 0, // Add total number of students per stream
        totalAttendance: totalAttendance, // Total attendance days for the term
        presentAttendance: presentAttendance, // Present/excused attendance days
        totalPoints: totalPoints,
        isUpperForm: isUpperForm,
        remarks: {
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date(),
        term: termValue || undefined
      };
    } else if (studentId && examId) {
      // Old format: single exam
      const student = await studentRepository.findOne({
        where: { id: studentId as string },
        relations: ['classEntity']
      });

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const oldFormatClassDescriptor = `${student.classEntity?.form || ''} ${student.classEntity?.name || ''}`.toLowerCase();
      const upperFormKeywordsOld = ['form 5', 'form five', 'form v', 'form 6', 'form six', 'form vi', 'lower six', 'upper six', 'a level', 'as level'];
      const isUpperForm = upperFormKeywordsOld.some(keyword => oldFormatClassDescriptor.includes(keyword));

      const marks = await marksRepository.find({
        where: { studentId: studentId as string, examId: examId as string },
        relations: ['subject', 'exam']
      });

      if (marks.length === 0) {
        return res.status(404).json({ message: 'No marks found for this student and exam' });
      }

      const allClassMarks = await marksRepository.find({
        where: { examId: examId as string },
        relations: ['student', 'subject']
      });

      const classMarks = allClassMarks.filter(
        (m) => m.student && m.student.classId === student.classId
      );

      const subjectNamesForRank = [
        ...new Set(
          classMarks.map((m) => m.subject?.name).filter((n): n is string => Boolean(n))
        ),
      ];
      const subjectPositionLookupOld = buildSubjectPositionLookup(classMarks, subjectNamesForRank);

      // Get settings
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      // Calculate report card data
      let totalPercentage = 0;
      const subjectData = marks.map(mark => {
        const roundedScore = Math.round(parseFloat(String(mark.score)) || 0);
        const roundedMaxScore = Math.round(parseFloat(String(mark.maxScore)) || 100);
        const percentage = roundedMaxScore > 0 ? (roundedScore / roundedMaxScore) * 100 : 0;
        totalPercentage += percentage;
        const gradeInfo = getGradeInfoFromSettings(percentage, activeSettings);
        const points = isUpperForm
          ? getGradePointValue(gradeInfo.key, activeSettings?.gradePoints, gradePointsPdf)
          : undefined;
        const spInfo = subjectPositionLookupOld.get(
          subjectPositionLookupKey(studentId as string, mark.subject.name)
        );
        return {
          subject: mark.subject.name,
          subjectCode: mark.subject.code || '',
          score: roundedScore,
          maxScore: roundedMaxScore,
          percentage: Math.round(percentage).toString(),
          classAverage: undefined,
          comments: mark.comments,
          grade: gradeInfo.label,
          points,
          subjectPosition: spInfo ? `${spInfo.position}/${spInfo.total}` : undefined
        };
      });

      const overallAverage = marks.length > 0 ? totalPercentage / marks.length : 0;
      const totalPoints = isUpperForm
        ? subjectData.reduce((sum, sub) => sum + (sub.points || 0), 0)
        : undefined;

      // Calculate class position (classMarks already loaded above)
      const studentAverages: { [key: string]: { total: number; count: number } } = {};

      classMarks.forEach(mark => {
        const sid = mark.studentId;
        if (!studentAverages[sid]) {
          studentAverages[sid] = { total: 0, count: 0 };
        }
        studentAverages[sid].total += (mark.score / mark.maxScore) * 100;
        studentAverages[sid].count += 1;
      });

      const rankingsUnsorted = Object.entries(studentAverages)
        .map(([sid, avg]) => ({
          studentId: sid,
          average: avg.count > 0 ? avg.total / avg.count : 0
        }))
        .sort((a, b) => b.average - a.average);
      
      // Assign positions with proper tie handling
      const rankings = assignPositionsWithTies(rankingsUnsorted);
      const classRankEntry = rankings.find(r => r.studentId === studentId);
      const classPosition = classRankEntry?.position || 0;

      let formPosition = 0;
      let totalStudentsPerStream = 0;
      const singleExam = await examRepository.findOne({
        where: { id: examId as string },
        relations: ['subjects', 'classEntity'],
      });
      const streamFormOld = (
        singleExam?.classEntity?.form ||
        student.classEntity?.form ||
        ''
      ).trim();

      if (streamFormOld && singleExam) {
        const formStudentsList = await findStudentsForFormStream(
          studentRepository,
          classRepository,
          streamFormOld
        );
        totalStudentsPerStream = formStudentsList.length;

        const formClassIds = (
          await classRepository.find({ where: { form: streamFormOld } })
        ).map((c) => c.id);

        const whereClause: { classId: any; type: ExamType; term?: string } = {
          classId: In(formClassIds),
          type: singleExam.type,
        };
        if (singleExam.term) {
          whereClause.term = singleExam.term;
        }
        let allFormExams = await examRepository.find({
          where: whereClause,
          relations: ['subjects'],
        });
        if (!isStaffExamViewer(req.user?.role)) {
          allFormExams = allFormExams.filter((e) => e.status === ExamStatus.PUBLISHED);
        }
        const allFormExamIds = allFormExams.map((e) => e.id);

        const formMarks =
          allFormExamIds.length > 0 && formStudentsList.length > 0
            ? await marksRepository.find({
                where: {
                  examId: In(allFormExamIds),
                  studentId: In(formStudentsList.map((s) => s.id)),
                },
                relations: ['student', 'subject'],
              })
            : [];

        const formStudentAverages: Record<string, { total: number; count: number }> = {};
        formMarks.forEach((mark) => accumulateMarkIntoStudentAverages(formStudentAverages, mark));
        const formRankings = studentAveragesToRankings(formStudentAverages);
        const formRankEntry = formRankings.find((r) => r.studentId === studentId);
        if (formRankEntry) {
          formPosition = formRankEntry.position;
        }
      }

      // Get total number of students in the class with marks (for ranking)
      const totalStudents = rankings.length;

      // Get remarks for PDF (old format)
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      const exam = marks[0]?.exam;
      const remarks = exam ? await remarksRepository.findOne({
        where: {
          studentId: studentId as string,
          classId: student.classId || '',
          examType: exam.type,
        }
      }) : null;

      reportCardData = {
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name || ''
        },
        exam: exam,
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
          overallGrade: getGradeLabelOnly(overallAverage, activeSettings),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        totalStudents: totalStudents, // Add total number of students
        totalStudentsPerStream: totalStudentsPerStream || 0, // Add total number of students per stream
        totalPoints: totalPoints,
        isUpperForm: isUpperForm,
        remarks: {
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date(),
        term: activeSettings?.activeTerm || activeSettings?.currentTerm || undefined
      };
    } else {
      return res.status(400).json({ message: 'Invalid parameters. Provide either (studentId + examId) or (classId + examType + studentId)' });
    }

    // Generate PDF
    console.log('Generating PDF with data:', {
      student: reportCardData.student.name,
      examType: reportCardData.examType,
      subjectsCount: reportCardData.subjects.length,
      hasRemarks: !!(reportCardData.remarks?.classTeacherRemarks || reportCardData.remarks?.headmasterRemarks),
      hasSettings: !!activeSettings,
      schoolName: activeSettings?.schoolName,
      schoolAddress: activeSettings?.schoolAddress ? 'Present' : 'Missing',
      schoolLogo: activeSettings?.schoolLogo ? 'Present' : 'Missing',
      academicYear: activeSettings?.academicYear
    });
    
    const pdfBuffer = await createReportCardPDF(reportCardData, activeSettings);
    console.log('PDF generated, buffer size:', pdfBuffer.length);

    // Use student's full name for filename (sanitize for filesystem)
    const studentName = reportCardData.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
    const filename = reportCardData.examType 
      ? `${studentName}-${reportCardData.examType}.pdf`
      : `${studentName}-${examId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdfBuffer);
    console.log('PDF sent to client');
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateMarkSheet = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, examType, term, subjectId } = req.query;
    const user = req.user;
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!classId || !examType) {
      return res.status(400).json({ message: 'Class ID and exam type are required' });
    }

    // SubjectId is optional - if not provided, show all subjects
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Get class information
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify assignment to class
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }
    }

    const students = await findStudentsForClassListing(
      studentRepository,
      classId as string
    );

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }

    const termStr = term ? String(term).trim() : '';
    const includeDraftExams = isStaffExamViewer(user?.role);
    let exams: Exam[] = [];
    if (termStr) {
      exams = await resolveExamsForSession(
        examRepository,
        marksRepository,
        classId as string,
        examType as string,
        termStr,
        { includeDrafts: includeDraftExams }
      );
    } else {
      let found = await examRepository.find({
        where: { classId: classId as string, type: examType as ExamType },
        relations: ['subjects'],
        order: { examDate: 'DESC' },
      });
      if (!includeDraftExams) {
        found = found.filter((e) => e.status === ExamStatus.PUBLISHED);
      }
      exams = found;
    }

    if (exams.length === 0) {
      return res.status(404).json({
        message: `No ${examType} exams found for this class${termStr ? ` in ${termStr}` : ''}`,
      });
    }

    const examIds = exams.map((exam) => exam.id);
    const allMarks = await marksRepository.find({
      where: {
        examId: In(examIds),
        studentId: In(students.map((s) => s.id)),
      },
      relations: ['student', 'exam', 'subject'],
    });

    let subjects = mergeClassSubjectsWithExamSubjects(classEntity.subjects || [], exams);
    subjects = mergeSubjectsWithMarksSubjects(subjects, allMarks);

    const subjectIdStr = subjectId ? String(subjectId).trim() : '';
    if (subjectIdStr) {
      const selected = subjects.find((s) => s.id === subjectIdStr);
      if (!selected) {
        return res.status(404).json({ message: 'Subject not found for this class/exams/marks' });
      }
      subjects = [selected];
    }

    subjects = sortSubjectsByName(subjects);

    if (subjects.length === 0) {
      return res.status(404).json({ message: 'No subjects found for this class or in the exams' });
    }

    // Organize marks by student and subject
    const markSheetData: any[] = [];

    for (const student of students) {
      const studentRow: any = {
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        subjects: {} as any,
        totalScore: 0,
        totalMaxScore: 0,
        average: 0
      };

      // Get marks for this student
      const studentMarks = allMarks.filter(mark => mark.studentId === student.id);

      // For each subject, find the mark (use the latest exam if multiple)
      for (const subject of subjects) {
        const subjectMarks = studentMarks.filter(mark => mark.subjectId === subject.id);
        
        if (subjectMarks.length > 0) {
          // Use the most recent mark (latest exam)
          const latestMark = subjectMarks.sort((a, b) => 
            new Date(b.exam.examDate).getTime() - new Date(a.exam.examDate).getTime()
          )[0];

          // Prioritize uniformMark if available (moderated mark), otherwise use original score
          const hasUniformMark = latestMark.uniformMark !== null && latestMark.uniformMark !== undefined;
          const maxScore = Math.round(parseFloat(String(latestMark.maxScore)) || 100);
          
          let score: number;
          let percentage: number;
          
          if (hasUniformMark) {
            // Use moderated mark (uniformMark is stored as percentage 0-100)
            percentage = parseFloat(String(latestMark.uniformMark));
            // Calculate score from uniformMark percentage for display
            score = Math.round((percentage / 100) * maxScore);
          } else {
            // Use original score
            score = Math.round(parseFloat(String(latestMark.score)) || 0);
            percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
          }

          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: score,
            maxScore: maxScore,
            percentage: percentage
          };

          studentRow.totalScore += score;
          studentRow.totalMaxScore += maxScore;
        } else {
          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: 0,
            maxScore: 100,
            percentage: 0
          };
          studentRow.totalMaxScore += 100;
        }
      }

      // Calculate average
      if (studentRow.totalMaxScore > 0) {
        studentRow.average = Math.round((studentRow.totalScore / studentRow.totalMaxScore) * 100);
      }

      markSheetData.push(studentRow);
    }

    // Sort by average (descending)
    markSheetData.sort((a, b) => b.average - a.average);

    // Add positions
    markSheetData.forEach((row, index) => {
      row.position = index + 1;
    });

    res.json({
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form
      },
      examType,
      term: termStr || exams[0]?.term || null,
      subject: subjectIdStr ? subjects.find((s) => s.id === subjectIdStr) || null : null,
      subjects: subjects.map(s => ({ id: s.id, name: s.name })),
      exams: exams.map(e => ({
        id: e.id,
        name: e.name,
        examDate: e.examDate,
        term: e.term
      })),
      markSheet: markSheetData,
      generatedAt: new Date()
    });
  } catch (error: any) {
    console.error('Error generating mark sheet:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateMarkSheetPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, term, subjectId } = req.query;
    const user = req.user;
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!classId || !examType) {
      return res.status(400).json({ message: 'Class ID and exam type are required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Get class information
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify assignment to class and subject
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes', 'subjects']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      // Verify teacher teaches this subject
      if (subjectId) {
        const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
        if (!teachesSubject) {
          return res.status(403).json({ message: 'You are not assigned to teach this subject' });
        }
      }
    }

    const students = await findStudentsForClassListing(
      studentRepository,
      classId as string
    );

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }

    const termStr = term ? String(term).trim() : '';
    const includeDraftExams = isStaffExamViewer(user?.role);
    let exams: Exam[] = [];
    if (termStr) {
      exams = await resolveExamsForSession(
        examRepository,
        marksRepository,
        classId as string,
        examType as string,
        termStr,
        { includeDrafts: includeDraftExams }
      );
    } else {
      let found = await examRepository.find({
        where: { classId: classId as string, type: examType as ExamType },
        relations: ['subjects'],
        order: { examDate: 'DESC' },
      });
      if (!includeDraftExams) {
        found = found.filter((e) => e.status === ExamStatus.PUBLISHED);
      }
      exams = found;
    }

    if (exams.length === 0) {
      return res.status(404).json({
        message: `No ${examType} exams found for this class${termStr ? ` in ${termStr}` : ''}`,
      });
    }

    const examIds = exams.map((exam) => exam.id);
    const marksWhere: any = {
      examId: In(examIds),
      studentId: In(students.map((s) => s.id)),
    };
    if (subjectId) {
      marksWhere.subjectId = subjectId as string;
    }

    const allMarks = await marksRepository.find({
      where: marksWhere,
      relations: ['student', 'exam', 'subject'],
    });

    let subjects = mergeClassSubjectsWithExamSubjects(classEntity.subjects || [], exams);
    subjects = mergeSubjectsWithMarksSubjects(subjects, allMarks);

    const pdfSubjectIdStr = subjectId ? String(subjectId).trim() : '';
    if (pdfSubjectIdStr) {
      const selected = subjects.find((s) => s.id === pdfSubjectIdStr);
      if (!selected) {
        return res.status(404).json({ message: 'Subject not found for this class/exams/marks' });
      }
      subjects = [selected];
    }

    subjects = sortSubjectsByName(subjects);

    if (subjects.length === 0) {
      return res.status(404).json({ message: 'No subjects found for this class or in the exams' });
    }

    // Organize marks by student and subject
    const markSheetData: any[] = [];

    for (const student of students) {
      const studentRow: any = {
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        subjects: {} as any,
        totalScore: 0,
        totalMaxScore: 0,
        average: 0
      };

      // Get marks for this student
      const studentMarks = allMarks.filter(mark => mark.studentId === student.id);

      // For each subject, find the mark (use the latest exam if multiple)
      for (const subject of subjects) {
        const subjectMarks = studentMarks.filter(mark => mark.subjectId === subject.id);
        
        if (subjectMarks.length > 0) {
          // Use the most recent mark (latest exam)
          const latestMark = subjectMarks.sort((a, b) => 
            new Date(b.exam.examDate).getTime() - new Date(a.exam.examDate).getTime()
          )[0];

          // Prioritize uniformMark if available (moderated mark), otherwise use original score
          const hasUniformMark = latestMark.uniformMark !== null && latestMark.uniformMark !== undefined;
          const maxScore = Math.round(parseFloat(String(latestMark.maxScore)) || 100);
          
          let score: number;
          let percentage: number;
          
          if (hasUniformMark) {
            // Use moderated mark (uniformMark is stored as percentage 0-100)
            percentage = parseFloat(String(latestMark.uniformMark));
            // Calculate score from uniformMark percentage for display
            score = Math.round((percentage / 100) * maxScore);
          } else {
            // Use original score
            score = Math.round(parseFloat(String(latestMark.score)) || 0);
            percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
          }

          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: score,
            maxScore: maxScore,
            percentage: percentage
          };

          studentRow.totalScore += score;
          studentRow.totalMaxScore += maxScore;
        } else {
          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: 0,
            maxScore: 100,
            percentage: 0
          };
          studentRow.totalMaxScore += 100;
        }
      }

      // Calculate average
      if (studentRow.totalMaxScore > 0) {
        studentRow.average = Math.round((studentRow.totalScore / studentRow.totalMaxScore) * 100);
      }

      markSheetData.push(studentRow);
    }

    // Sort by average (descending)
    markSheetData.sort((a, b) => b.average - a.average);

    // Add positions
    markSheetData.forEach((row, index) => {
      row.position = index + 1;
    });

    // Get settings for PDF
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Prepare data for PDF
    const pdfData = {
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form
      },
      examType: examType as string,
      subjects: subjects.map(s => ({ id: s.id, name: s.name })),
      exams: exams.map(e => ({
        id: e.id,
        name: e.name,
        examDate: e.examDate,
        term: e.term
      })),
      markSheet: markSheetData,
      generatedAt: new Date()
    };

    // Generate PDF
    const pdfBuffer = await createMarkSheetPDF(pdfData, settings);

    const download =
      req.query.download === '1' ||
      req.query.download === 'true' ||
      String(req.query.download || '').toLowerCase() === 'yes';

    const safeClass = String(classEntity.name || 'class').replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeExam = String(examType || 'exam').replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `mark-sheet-${safeClass}-${safeExam}-${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating mark sheet PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** POST body: rankingType, examTypeLabel, filterSubtitle, rankings — returns PDF preview (inline). */
export const generateRankingsPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { rankingType, examTypeLabel, filterSubtitle, rankings } = req.body;

    if (!rankingType || !['class', 'subject', 'overall-performance'].includes(String(rankingType))) {
      return res.status(400).json({ message: 'Valid rankingType is required (class, subject, or overall-performance)' });
    }
    if (examTypeLabel === undefined || examTypeLabel === null || String(examTypeLabel).trim() === '') {
      return res.status(400).json({ message: 'examTypeLabel is required' });
    }
    if (filterSubtitle === undefined || filterSubtitle === null) {
      return res.status(400).json({ message: 'filterSubtitle is required' });
    }
    if (!Array.isArray(rankings)) {
      return res.status(400).json({ message: 'rankings must be an array' });
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const pdfBuffer = await createRankingsPDF(
      {
        rankingType: rankingType as 'class' | 'subject' | 'overall-performance',
        examTypeLabel: String(examTypeLabel).trim(),
        filterSubtitle: String(filterSubtitle).trim() || '—',
        rankings
      },
      settings
    );

    const safeType = String(rankingType).replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `rankings-${safeType}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating rankings PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const saveReportCardRemarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, classId, examType, classTeacherRemarks, headmasterRemarks } = req.body;
    const user = req.user;

    if (!studentId || !classId || !examType) {
      return res.status(400).json({ message: 'Student ID, Class ID, and Exam Type are required' });
    }

    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const examRepository = AppDataSource.getRepository(Exam);
    
    // Check if user is admin (headmaster) or teacher
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!isAdmin && !isTeacher) {
      return res.status(403).json({ message: 'Only teachers and administrators can add remarks' });
    }

    // Check if exam is published - prevent editing remarks
    const exams = await examRepository.find({
      where: { classId: classId as string, type: examType as any }
    });

    if (exams.length > 0 && exams.some(exam => exam.status === ExamStatus.PUBLISHED)) {
      return res.status(403).json({ 
        message: 'Cannot edit remarks. Exam results have been published and are now read-only.' 
      });
    }

    // Find existing remarks or create new
    let remarks = await remarksRepository.findOne({
      where: {
        studentId: studentId as string,
        classId: classId as string,
        examType: examType as string,
      }
    });

    if (!remarks) {
      remarks = remarksRepository.create({
        studentId: studentId as string,
        classId: classId as string,
        examType: examType as string,
      });
    }

    // Update remarks based on user role
    if (isAdmin) {
      // Admin can add headmaster remarks
      remarks.headmasterRemarks = headmasterRemarks || null;
      remarks.headmasterId = user.id;
    }

    if (isTeacher || isAdmin) {
      // Teachers and admins can add class teacher remarks
      remarks.classTeacherRemarks = classTeacherRemarks || null;
      remarks.classTeacherId = user.id;
    }

    const savedRemarks = await remarksRepository.save(remarks);
    res.json({ message: 'Remarks saved successfully', remarks: savedRemarks });
  } catch (error: any) {
    console.error('Error saving report card remarks:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Linear Scaling Mark Moderation Algorithm
 * Scales raw marks linearly from [minRaw, maxRaw] to [targetMin, targetMax]
 * Formula: moderated = targetMin + ((x - minRaw) / (maxRaw - minRaw)) × (targetMax - targetMin)
 * If maxRaw == minRaw, all marks are set to midpoint: (targetMin + targetMax) / 2
 */
function moderateMarksLinear(rawMarks: number[], targetMin: number, targetMax: number): number[] {
  if (rawMarks.length === 0) return [];
  if (rawMarks.length === 1) {
    // Single mark: set to midpoint and round to nearest whole number
    const midpoint = (targetMin + targetMax) / 2;
    const clipped = Math.max(0, Math.min(100, midpoint));
    return [Math.round(clipped)];
  }

  // Find min and max raw marks
  const minRaw = Math.min(...rawMarks);
  const maxRaw = Math.max(...rawMarks);

  // Handle edge case: all marks are the same
  if (maxRaw === minRaw) {
    const midpoint = (targetMin + targetMax) / 2;
    const clippedMidpoint = Math.max(0, Math.min(100, midpoint));
    return rawMarks.map(() => Math.round(clippedMidpoint));
  }

  // Apply linear scaling formula
  const moderated: number[] = [];
  for (let i = 0; i < rawMarks.length; i++) {
    const x = rawMarks[i];
    // Formula: moderated = targetMin + ((x - minRaw) / (maxRaw - minRaw)) × (targetMax - targetMin)
    const moderatedValue = targetMin + ((x - minRaw) / (maxRaw - minRaw)) * (targetMax - targetMin);
    
    // Clip to 0-100 range and round to nearest whole number
    const clipped = Math.max(0, Math.min(100, moderatedValue));
    moderated.push(Math.round(clipped));
  }

  return moderated;
}

/**
 * Moderate Marks Endpoint
 * POST /api/exams/moderate-marks
 * Body: { classId, subjectId, examType, targetMin, targetMax }
 */
export const moderateMarksEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, subjectId, examType, targetMin, targetMax } = req.body;

    if (!classId || !subjectId || !examType) {
      return res.status(400).json({ message: 'classId, subjectId, and examType are required' });
    }

    // Validate and set default values for targetMin and targetMax
    const minTarget = targetMin !== undefined ? parseFloat(targetMin) : 30;
    const maxTarget = targetMax !== undefined ? parseFloat(targetMax) : 90;

    // Validate target range
    if (isNaN(minTarget) || isNaN(maxTarget)) {
      return res.status(400).json({ message: 'targetMin and targetMax must be valid numbers' });
    }
    if (minTarget < 0 || minTarget > 100 || maxTarget < 0 || maxTarget > 100) {
      return res.status(400).json({ message: 'targetMin and targetMax must be between 0 and 100' });
    }
    if (minTarget >= maxTarget) {
      return res.status(400).json({ message: 'targetMin must be less than targetMax' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Verify subject and class exist
    const subject = await subjectRepository.findOne({ 
      where: { id: subjectId },
      relations: ['exams']
    });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Find exam that matches classId, subjectId (through exam subjects), and examType
    const exams = await examRepository.find({
      where: {
        classId: classId,
        type: examType as ExamType
      },
      relations: ['subjects']
    });

    // Filter exams that include this subject
    const exam = exams.find(e => 
      e.subjects?.some(s => s.id === subjectId)
    );

    if (!exam) {
      return res.status(404).json({ 
        message: `No exam found for class, subject, and exam type (${examType}) combination` 
      });
    }

    const students = await findStudentsForClassListing(studentRepository, classId as string);

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }

    // Get all marks for this exam, subject, and class
    const marks = await marksRepository.find({
      where: {
        examId: exam.id,
        subjectId,
        studentId: In(students.map(s => s.id))
      },
      relations: ['student']
    });

    if (marks.length === 0) {
      return res.status(404).json({ message: 'No marks found for this exam/subject/class combination' });
    }

    // Calculate raw mark percentages
    const studentMarks: Array<{
      studentId: string;
      studentNumber: string;
      firstName: string;
      lastName: string;
      rawMark: number;
      markId?: string;
    }> = [];

    marks.forEach(mark => {
      const rawMarkPercent = mark.maxScore > 0 ? (mark.score / mark.maxScore) * 100 : 0;
      studentMarks.push({
        studentId: mark.studentId,
        studentNumber: mark.student.studentNumber,
        firstName: mark.student.firstName,
        lastName: mark.student.lastName,
        rawMark: parseFloat(rawMarkPercent.toFixed(2)),
        markId: mark.id
      });
    });

    // Include students without marks (with 0% raw mark)
    const studentsWithMarks = new Set(marks.map(m => m.studentId));
    students.forEach(student => {
      if (!studentsWithMarks.has(student.id)) {
        studentMarks.push({
          studentId: student.id,
          studentNumber: student.studentNumber,
          firstName: student.firstName,
          lastName: student.lastName,
          rawMark: 0,
          markId: undefined
        });
      }
    });

    // Extract raw marks for moderation
    const rawMarks = studentMarks.map(sm => sm.rawMark);

    // Apply linear scaling moderation algorithm
    const uniformMarks = moderateMarksLinear(rawMarks, minTarget, maxTarget);

    // Combine results
    const moderatedResults = studentMarks.map((sm, index) => ({
      ...sm,
      uniformMark: uniformMarks[index]
    }));

    // Get subject teacher
    const subjectTeachers = await teacherRepository.find({
      where: { isActive: true },
      relations: ['subjects', 'classes']
    });
    const subjectTeacher = subjectTeachers.find(t =>
      t.subjects?.some(s => s.id === subjectId) &&
      t.classes?.some(c => c.id === classId)
    );

    // Get school name from settings
    const settings = await settingsRepository.findOne({ where: {} });
    const schoolName = settings?.schoolName || 'School';

    // Save uniform marks to database
    for (let i = 0; i < moderatedResults.length; i++) {
      const result = moderatedResults[i];
      if (result.markId) {
        // Update existing mark
        const mark = await marksRepository.findOne({ where: { id: result.markId } });
        if (mark) {
          mark.uniformMark = result.uniformMark;
          await marksRepository.save(mark);
        }
      } else if (result.rawMark > 0) {
        // Create new mark entry with uniform mark
        // Note: This shouldn't happen if rawMark is 0, but handle it anyway
        const existingMark = await marksRepository.findOne({
          where: {
            examId: exam.id,
            subjectId,
            studentId: result.studentId
          }
        });
        if (existingMark) {
          existingMark.uniformMark = result.uniformMark;
          await marksRepository.save(existingMark);
        }
      }
    }

    res.json({
      schoolName,
      subject: subject.name,
      subjectCode: subject.code,
      subjectTeacher: subjectTeacher
        ? `${subjectTeacher.firstName} ${subjectTeacher.lastName}`
        : 'Not Assigned',
      examType: exam.type,
      examName: exam.name,
      term: exam.term,
      results: moderatedResults
    });
  } catch (error: any) {
    console.error('Error moderating marks:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Save Moderated Marks Endpoint
 * POST /api/exams/save-moderated-marks
 * Body: { classId, subjectId, examType, moderatedResults: [{ studentId, uniformMark }] }
 */
export const saveModeratedMarksEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, subjectId, examType, moderatedResults } = req.body;

    if (!classId || !subjectId || !examType) {
      return res.status(400).json({ message: 'classId, subjectId, and examType are required' });
    }

    if (!moderatedResults || !Array.isArray(moderatedResults) || moderatedResults.length === 0) {
      return res.status(400).json({ message: 'moderatedResults array is required and must not be empty' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);

    // Find exam that matches classId, subjectId, and examType
    const exams = await examRepository.find({
      where: {
        classId: classId,
        type: examType as ExamType
      },
      relations: ['subjects']
    });

    // Filter exams that include this subject
    const exam = exams.find(e => 
      e.subjects?.some(s => s.id === subjectId)
    );

    if (!exam) {
      return res.status(404).json({ 
        message: `No exam found for class, subject, and exam type (${examType}) combination` 
      });
    }

    // Update marks with uniformMark values
    let savedCount = 0;
    for (const result of moderatedResults) {
      if (!result.studentId || result.uniformMark === undefined || result.uniformMark === null) {
        continue; // Skip invalid entries
      }

      // Find the mark for this student, exam, and subject
      const existingMark = await marksRepository.findOne({
        where: {
          examId: exam.id,
          subjectId: subjectId,
          studentId: result.studentId
        }
      });

      if (existingMark) {
        // Update existing mark with uniformMark
        existingMark.uniformMark = parseFloat(String(result.uniformMark));
        await marksRepository.save(existingMark);
        savedCount++;
      } else {
        // If mark doesn't exist, we could create it, but typically marks should already exist
        console.warn(`Mark not found for student ${result.studentId}, exam ${exam.id}, subject ${subjectId}`);
      }
    }

    res.json({ 
      message: `Successfully saved ${savedCount} moderated mark(s)`,
      savedCount 
    });
  } catch (error: any) {
    console.error('Error saving moderated marks:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Mark Input Progress Endpoint
 * GET /api/exams/mark-input-progress
 * Query params: examId?, subjectId?, term?, examType?
 */
export const getMarkInputProgress = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { examId, subjectId, term, examType } = req.query;
    
    console.log('[getMarkInputProgress] Request params:', { examId, subjectId, term, examType });

    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);
    const subjectRepository = AppDataSource.getRepository(Subject);

    // Get all active classes
    const classes = await classRepository.find({
      where: { isActive: true },
      order: { form: 'ASC', name: 'ASC' }
    });

    const progressData: Array<{
      stream: string;
      classes: Array<{
        classId: string;
        className: string;
        totalStudents: number;
        studentsWithMarks: number;
        completionPercentage: number;
      }>;
      streamTotal: number;
      streamWithMarks: number;
      streamCompletionPercentage: number;
    }> = [];

    // Group classes by stream (form)
    const streamMap: { [key: string]: Class[] } = {};
    classes.forEach(cls => {
      if (!streamMap[cls.form]) {
        streamMap[cls.form] = [];
      }
      streamMap[cls.form].push(cls);
    });

    // Process each stream
    for (const [stream, streamClasses] of Object.entries(streamMap)) {
      const streamData: {
        stream: string;
        classes: Array<{
          classId: string;
          className: string;
          totalStudents: number;
          studentsWithMarks: number;
          completionPercentage: number;
        }>;
        streamTotal: number;
        streamWithMarks: number;
        streamCompletionPercentage: number;
      } = {
        stream,
        classes: [],
        streamTotal: 0,
        streamWithMarks: 0,
        streamCompletionPercentage: 0
      };

      // Process each class in the stream
      for (const classEntity of streamClasses) {
        // Get all active students in this class
        const students = await studentRepository.find({
          where: { classId: classEntity.id, isActive: true }
        });

        const totalStudents = students.length;
        streamData.streamTotal += totalStudents;

        if (totalStudents === 0) {
          streamData.classes.push({
            classId: classEntity.id,
            className: classEntity.name,
            totalStudents: 0,
            studentsWithMarks: 0,
            completionPercentage: 0
          });
          continue;
        }

        // Build query for marks
        if (students.length === 0) {
          streamData.classes.push({
            classId: classEntity.id,
            className: classEntity.name,
            totalStudents: 0,
            studentsWithMarks: 0,
            completionPercentage: 0
          });
          continue;
        }

        let marksQuery = marksRepository
          .createQueryBuilder('marks')
          .where('marks.studentId IN (:...studentIds)', {
            studentIds: students.map(s => s.id)
          });

        // Apply filters
        let examIds: string[] = [];
        let shouldSkipClass = false;
        
        if (examId) {
          // If specific exam ID is provided, use it
          examIds = [examId as string];
        } else if (examType || term) {
          // Build exam query conditions
          const examWhere: any = {
            classId: classEntity.id
          };
          
          // Add examType filter if provided
          if (examType) {
            examWhere.type = examType as ExamType;
          }
          
          // Add term filter if provided
          if (term) {
            examWhere.term = term as string;
          }
          
          // Get exams matching the criteria
          const exams = await examRepository.find({
            where: examWhere
          });
          
          if (exams.length > 0) {
            examIds = exams.map(e => e.id);
          } else {
            // No exams matching criteria, so no marks
            shouldSkipClass = true;
          }
        }

        // If we need to skip this class (no matching exams), add it with zero marks
        if (shouldSkipClass) {
          streamData.classes.push({
            classId: classEntity.id,
            className: classEntity.name,
            totalStudents,
            studentsWithMarks: 0,
            completionPercentage: 0
          });
          continue;
        }

        // Apply exam filter to marks query (only if we have exam filters)
        // If we have examType or term filters but no matching exams, we already skipped
        if (examIds.length > 0) {
          marksQuery = marksQuery.andWhere('marks.examId IN (:...examIds)', {
            examIds: examIds
          });
        } else if (examId || examType || term) {
          // If we have exam filters but no matching exams, skip this class
          // (This should have been caught earlier, but adding as safety check)
          streamData.classes.push({
            classId: classEntity.id,
            className: classEntity.name,
            totalStudents,
            studentsWithMarks: 0,
            completionPercentage: 0
          });
          continue;
        }

        // Apply subject filter if provided
        if (subjectId) {
          marksQuery = marksQuery.andWhere('marks.subjectId = :subjectId', { subjectId });
        }

        // Count distinct students with marks
        let marks: Marks[] = [];
        try {
          marks = await marksQuery.getMany();
        } catch (queryError: any) {
          console.error(`[getMarkInputProgress] Error querying marks for class ${classEntity.name}:`, queryError);
          console.error(`[getMarkInputProgress] Query error details:`, {
            classId: classEntity.id,
            className: classEntity.name,
            studentCount: students.length,
            examIdsCount: examIds.length,
            hasSubjectFilter: !!subjectId,
            errorMessage: queryError.message,
            errorStack: queryError.stack
          });
          // If query fails, skip this class
          streamData.classes.push({
            classId: classEntity.id,
            className: classEntity.name,
            totalStudents,
            studentsWithMarks: 0,
            completionPercentage: 0
          });
          continue;
        }
        const studentsWithMarksSet = new Set(marks.map(m => m.studentId));
        const studentsWithMarks = studentsWithMarksSet.size;
        streamData.streamWithMarks += studentsWithMarks;

        const completionPercentage = totalStudents > 0
          ? parseFloat(((studentsWithMarks / totalStudents) * 100).toFixed(2))
          : 0;

        streamData.classes.push({
          classId: classEntity.id,
          className: classEntity.name,
          totalStudents,
          studentsWithMarks,
          completionPercentage
        });
      }

      // Calculate stream-level completion
      streamData.streamCompletionPercentage = streamData.streamTotal > 0
        ? parseFloat(((streamData.streamWithMarks / streamData.streamTotal) * 100).toFixed(2))
        : 0;

      progressData.push(streamData);
    }

    res.json({
      filters: {
        examId: examId || null,
        subjectId: subjectId || null,
        term: term || null,
        examType: examType || null
      },
      progress: progressData
    });
  } catch (error: any) {
    console.error('[getMarkInputProgress] Error getting mark input progress:', error);
    console.error('[getMarkInputProgress] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Mark Input Progress for a single class across all subjects
 * GET /api/exams/mark-input-progress/class-subjects
 * Query params: classId (required), term?, examType?
 */
export const getMarkInputProgressByClassSubjects = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, term, examType } = req.query as any;
    if (!classId) {
      return res.status(400).json({ message: 'classId is required' });
    }

    const classRepository = AppDataSource.getRepository(Class);
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const marksRepository = AppDataSource.getRepository(Marks);

    const classEntity = await classRepository.findOne({ where: { id: String(classId) } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const students = await findActiveStudentsForClass(studentRepository, classEntity.id);
    const totalStudents = students.length;
    const rosterStudentIds = students.map((s) => s.id);

    // Exams to consider (term/examType), scoped to class.
    const examWhere: any = { classId: classEntity.id };
    if (examType) examWhere.type = examType as ExamType;
    if (term) examWhere.term = String(term);

    const exams = await examRepository.find({ where: examWhere });
    const examIds = exams.map(e => e.id);

    const allSubjects = await subjectRepository.find({
      where: { isActive: true },
      order: { code: 'ASC', name: 'ASC' }
    });
    const subjects = filterSubjectsForClass(allSubjects, classEntity);
    const levelBand = inferStudentFeeLevelBand(classEntity);

    if (totalStudents === 0 || examIds.length === 0 || subjects.length === 0) {
      return res.json({
        filters: {
          classId: classEntity.id,
          term: term || null,
          examType: examType || null
        },
        class: {
          id: classEntity.id,
          name: classEntity.name,
          form: classEntity.form,
          levelBand
        },
        totalStudents,
        subjects: subjects.map(s => ({
          subjectId: s.id,
          subjectName: s.name,
          subjectCode: s.code,
          subjectCategory: s.category,
          studentsWithMarks: 0,
          completionPercentage: 0
        }))
      });
    }

    // Aggregate: for each subject, how many distinct roster students have a mark record.
    const marksQb = marksRepository
      .createQueryBuilder('marks')
      .select('marks.subjectId', 'subjectId')
      .addSelect('COUNT(DISTINCT marks.studentId)', 'studentsWithMarks')
      .where('marks.examId IN (:...examIds)', { examIds })
      .groupBy('marks.subjectId');
    if (rosterStudentIds.length > 0) {
      marksQb.andWhere('marks.studentId IN (:...rosterStudentIds)', { rosterStudentIds });
    } else {
      marksQb.andWhere('1 = 0');
    }
    const raw = await marksQb.getRawMany();

    const countsBySubject = new Map<string, number>();
    for (const row of raw) {
      const sid = String(row.subjectId);
      const count = Number(row.studentsWithMarks || 0);
      countsBySubject.set(sid, Number.isFinite(count) ? count : 0);
    }

    const subjectsProgress = subjects.map(s => {
      const studentsWithMarks = countsBySubject.get(s.id) ?? 0;
      const completionPercentage =
        totalStudents > 0 ? parseFloat(((studentsWithMarks / totalStudents) * 100).toFixed(2)) : 0;
      return {
        subjectId: s.id,
        subjectName: s.name,
        subjectCode: s.code,
        subjectCategory: s.category,
        studentsWithMarks,
        completionPercentage
      };
    });

    return res.json({
      filters: {
        classId: classEntity.id,
        term: term || null,
        examType: examType || null
      },
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form,
        levelBand
      },
      totalStudents,
      subjects: subjectsProgress
    });
  } catch (error: any) {
    console.error('[getMarkInputProgressByClassSubjects] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Mark Input Progress for every active class (subject completion per class)
 * GET /api/exams/mark-input-progress/all-classes-subjects
 * Query params: term?, examType? (same filters as single-class endpoint)
 */
export const getMarkInputProgressAllClassesSubjects = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { term, examType } = req.query as any;

    const classRepository = AppDataSource.getRepository(Class);
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const marksRepository = AppDataSource.getRepository(Marks);

    const subjectList = await subjectRepository.find({
      where: { isActive: true },
      order: { code: 'ASC', name: 'ASC' }
    });

    const classes = await classRepository.find({
      where: { isActive: true },
      order: { form: 'ASC', name: 'ASC' }
    });

    const examWhere: any = {};
    if (examType) examWhere.type = examType as ExamType;
    if (term) examWhere.term = String(term);

    const allExams =
      Object.keys(examWhere).length > 0 ? await examRepository.find({ where: examWhere }) : await examRepository.find();

    const allExamIds = allExams.map(e => e.id);

    const studentCountByClass = new Map<string, number>();
    for (const classEntity of classes) {
      const roster = await findActiveStudentsForClass(studentRepository, classEntity.id);
      studentCountByClass.set(classEntity.id, roster.length);
    }

    const countsByClassSubject = new Map<string, Map<string, number>>();

    if (allExamIds.length > 0) {
      const raw = await marksRepository
        .createQueryBuilder('m')
        .innerJoin('m.exam', 'e')
        .innerJoin(Student, 's', 's.id = m.studentId')
        .where('e.id IN (:...examIds)', { examIds: allExamIds })
        .andWhere('s.isActive = true')
        .select('e.classId', 'classId')
        .addSelect('m.subjectId', 'subjectId')
        .addSelect('COUNT(DISTINCT m.studentId)', 'studentsWithMarks')
        .groupBy('e.classId')
        .addGroupBy('m.subjectId')
        .getRawMany();

      for (const row of raw) {
        const cid = String(row.classId);
        const sid = String(row.subjectId);
        const cnt = Number(row.studentsWithMarks) || 0;
        if (!countsByClassSubject.has(cid)) countsByClassSubject.set(cid, new Map());
        countsByClassSubject.get(cid)!.set(sid, cnt);
      }
    }

    const classesOut = classes.map(classEntity => {
      const totalStudents = studentCountByClass.get(classEntity.id) ?? 0;
      const bySubject = countsByClassSubject.get(classEntity.id) ?? new Map();
      const classSubjects = filterSubjectsForClass(subjectList, classEntity);
      const levelBand = inferStudentFeeLevelBand(classEntity);

      const subjectsProgress = classSubjects.map(s => {
        const studentsWithMarks = bySubject.get(s.id) ?? 0;
        const completionPercentage =
          totalStudents > 0 ? parseFloat(((studentsWithMarks / totalStudents) * 100).toFixed(2)) : 0;
        return {
          subjectId: s.id,
          subjectName: s.name,
          subjectCode: s.code,
          subjectCategory: s.category,
          studentsWithMarks,
          completionPercentage
        };
      });

      return {
        class: {
          id: classEntity.id,
          name: classEntity.name,
          form: classEntity.form,
          levelBand
        },
        totalStudents,
        subjects: subjectsProgress
      };
    });

    return res.json({
      mode: 'all',
      filters: {
        term: term || null,
        examType: examType || null
      },
      classes: classesOut
    });
  } catch (error: any) {
    console.error('[getMarkInputProgressAllClassesSubjects] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

