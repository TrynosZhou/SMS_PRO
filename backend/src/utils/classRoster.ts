import { Repository } from 'typeorm';
import { Student } from '../entities/Student';
import { Class } from '../entities/Class';

/**
 * Active students belonging to a class — matches GET /students?classId= logic
 * (direct classId, classEntity relation, or active enrollment row).
 */
export async function findActiveStudentsForClass(
  studentRepository: Repository<Student>,
  classId: string
): Promise<Student[]> {
  const cid = String(classId).trim();
  if (!cid) return [];

  return studentRepository
    .createQueryBuilder('student')
    .leftJoin('student.classEntity', 'classEntity')
    .leftJoin('student.enrollments', 'enrollments')
    .where('student.isActive IS DISTINCT FROM false')
    .andWhere(
      `(
        student.classId = :classId
        OR classEntity.id = :classId
        OR (enrollments.classId = :classId AND enrollments.isActive = true)
      )`,
      { classId: cid }
    )
    .andWhere(
      '(student.enrollmentStatus IS NULL OR student.enrollmentStatus != :transferredOut)',
      { transferredOut: 'Transferred Out' }
    )
    .getMany();
}

export async function activeStudentIdsForClass(
  studentRepository: Repository<Student>,
  classId: string
): Promise<Set<string>> {
  const students = await findActiveStudentsForClass(studentRepository, classId);
  return new Set(students.map((s) => s.id));
}

/**
 * Students in a class for report cards / listings — matches GET /students?classId=
 * (includes enrollment rows even when student.classId is unset).
 */
export async function findStudentsForClassListing(
  studentRepository: Repository<Student>,
  classId: string
): Promise<Student[]> {
  const cid = String(classId).trim();
  if (!cid) return [];

  return studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .leftJoin('student.enrollments', 'enrollments')
    .where('student.isActive IS DISTINCT FROM false')
    .andWhere(
      `(
        student.classId = :classId
        OR classEntity.id = :classId
        OR enrollments.classId = :classId
      )`,
      { classId: cid }
    )
    .andWhere(
      '(student.enrollmentStatus IS NULL OR student.enrollmentStatus != :transferredOut)',
      { transferredOut: 'Transferred Out' }
    )
    .orderBy('student.firstName', 'ASC')
    .addOrderBy('student.lastName', 'ASC')
    .getMany();
}

/** All active students in every class that shares the same form/stream (e.g. all Form 1 classes). */
export async function findStudentsForFormStream(
  studentRepository: Repository<Student>,
  classRepository: Repository<Class>,
  form: string
): Promise<Student[]> {
  const formValue = String(form).trim();
  if (!formValue) return [];

  const classesInForm = await classRepository.find({ where: { form: formValue } });
  const seen = new Map<string, Student>();

  for (const cls of classesInForm) {
    const roster = await findStudentsForClassListing(studentRepository, cls.id);
    for (const s of roster) {
      if (!seen.has(s.id)) {
        seen.set(s.id, s);
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    `${a.firstName || ''} ${a.lastName || ''}`.localeCompare(
      `${b.firstName || ''} ${b.lastName || ''}`,
      undefined,
      { sensitivity: 'base' }
    )
  );
}
