import { AppDataSource } from '../config/database';
import { Exam, ExamType } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { In } from 'typeorm';

/**
 * Overall percentage for a student for a given class + term + exam type
 * (weighted by subject max scores). Returns null if no matching exams or no usable marks.
 */
export async function computeStudentOverallPercentForTerm(
  studentId: string,
  classId: string,
  term: string,
  examType: ExamType = ExamType.END_TERM
): Promise<number | null> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const examRepository = AppDataSource.getRepository(Exam);
  const marksRepository = AppDataSource.getRepository(Marks);

  const exams = await examRepository.find({
    where: {
      classId,
      type: examType,
      term: term as any,
    },
  });

  if (exams.length === 0) return null;

  const examIds = exams.map((e) => e.id);
  const allMarks = await marksRepository.find({
    where: { studentId, examId: In(examIds) },
    relations: ['subject'],
  });

  const subjectAgg: { [subjectName: string]: { scores: number[]; maxes: number[] } } = {};

  for (const mark of allMarks) {
    if (!mark.subject?.name) continue;
    const sub = mark.subject.name;
    if (!subjectAgg[sub]) subjectAgg[sub] = { scores: [], maxes: [] };

    const maxScore =
      mark.maxScore && Number(mark.maxScore) > 0 ? Number.parseFloat(String(mark.maxScore)) : 100;
    if (!Number.isFinite(maxScore) || maxScore <= 0) continue;

    const hasUniform =
      mark.uniformMark !== null && mark.uniformMark !== undefined && String(mark.uniformMark) !== '';
    if (hasUniform) {
      const uniformPct = Number.parseFloat(String(mark.uniformMark));
      if (!Number.isFinite(uniformPct) || uniformPct < 0 || uniformPct > 100) continue;
      const scoreFromUniform = (uniformPct / 100) * maxScore;
      subjectAgg[sub].scores.push(scoreFromUniform);
      subjectAgg[sub].maxes.push(maxScore);
      continue;
    }

    if (mark.score === null || mark.score === undefined) continue;
    const score = Number.parseFloat(String(mark.score));
    if (!Number.isFinite(score) || score < 0) continue;
    subjectAgg[sub].scores.push(score);
    subjectAgg[sub].maxes.push(maxScore);
  }

  let totalScore = 0;
  let totalMax = 0;
  for (const key of Object.keys(subjectAgg)) {
    const { scores, maxes } = subjectAgg[key];
    if (scores.length === 0 || maxes.length === 0) continue;
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgMax = maxes.reduce((a, b) => a + b, 0) / maxes.length;
    totalScore += avgScore;
    totalMax += avgMax;
  }

  if (totalMax <= 0) return null;
  return (totalScore / totalMax) * 100;
}
