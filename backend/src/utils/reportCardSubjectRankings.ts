import { Marks } from '../entities/Marks';

/**
 * Tie-aware positions: same percentage → same rank; next rank skips (e.g. 1,1,3).
 */
function assignPositionsByPercentage(
  rankings: Array<{ studentId: string; percentage: number }>
): Array<{ studentId: string; percentage: number; position: number }> {
  if (rankings.length === 0) return [];
  const result: Array<{ studentId: string; percentage: number; position: number }> = [];
  let currentPosition = 1;
  for (let i = 0; i < rankings.length; i++) {
    const currentScore = rankings[i].percentage;
    const previousScore = i > 0 ? rankings[i - 1].percentage : null;
    if (i === 0 || previousScore === null || Math.abs(currentScore - previousScore) > 0.001) {
      currentPosition = i + 1;
    }
    result.push({ ...rankings[i], position: currentPosition });
  }
  return result;
}

/**
 * One percentage per student per subject from class marks (matches report-card aggregation:
 * uniformMark as percentage when present, else score/maxScore).
 */
export function aggregateStudentSubjectPercentagesForSubject(marks: Marks[]): Map<string, number> {
  const byStudent: Record<
    string,
    { scores: number[]; maxScores: number[]; percentages: number[] }
  > = {};

  for (const mark of marks) {
    if (!mark.studentId || !mark.subject) continue;
    const hasScore = mark.score !== null && mark.score !== undefined;
    const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
    if (!hasScore && !hasUniformMark) continue;

    const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
    if (!byStudent[mark.studentId]) {
      byStudent[mark.studentId] = { scores: [], maxScores: [], percentages: [] };
    }

    if (hasUniformMark) {
      const uniformMarkPercentage = parseFloat(String(mark.uniformMark));
      const scoreFromUniform = Math.round((uniformMarkPercentage / 100) * maxScore);
      byStudent[mark.studentId].scores.push(scoreFromUniform);
      byStudent[mark.studentId].percentages.push(uniformMarkPercentage);
      byStudent[mark.studentId].maxScores.push(Math.round(maxScore));
    } else if (hasScore) {
      const originalScore = Math.round(parseFloat(String(mark.score)) || 0);
      const originalPercentage = maxScore > 0 ? (originalScore / maxScore) * 100 : 0;
      byStudent[mark.studentId].scores.push(originalScore);
      byStudent[mark.studentId].percentages.push(originalPercentage);
      byStudent[mark.studentId].maxScores.push(Math.round(maxScore));
    }
  }

  const out = new Map<string, number>();
  for (const [sid, data] of Object.entries(byStudent)) {
    if (data.percentages.length > 0) {
      const p = data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length;
      out.set(sid, p);
    } else {
      const ts = data.scores.reduce((a, b) => a + b, 0);
      const tm = data.maxScores.reduce((a, b) => a + b, 0);
      out.set(sid, tm > 0 ? (ts / tm) * 100 : 0);
    }
  }
  return out;
}

const LOOKUP_SEP = '|||';

export function subjectPositionLookupKey(studentId: string, subjectName: string): string {
  return `${studentId}${LOOKUP_SEP}${subjectName}`;
}

/**
 * For each subject, rank class students by aggregated percentage. Denominator = students with marks in that subject.
 */
export function buildSubjectPositionLookup(
  classMarks: Marks[],
  subjectNames: string[]
): Map<string, { position: number; total: number }> {
  const lookup = new Map<string, { position: number; total: number }>();
  for (const subjectName of subjectNames) {
    const subjMarks = classMarks.filter((m) => m.subject?.name === subjectName);
    const pctMap = aggregateStudentSubjectPercentagesForSubject(subjMarks);
    const ranked = Array.from(pctMap.entries())
      .map(([studentId, percentage]) => ({ studentId, percentage }))
      .sort(
        (a, b) =>
          b.percentage - a.percentage || String(a.studentId).localeCompare(String(b.studentId))
      );
    const withPos = assignPositionsByPercentage(ranked);
    const total = withPos.length;
    for (const row of withPos) {
      lookup.set(subjectPositionLookupKey(row.studentId, subjectName), {
        position: row.position,
        total,
      });
    }
  }
  return lookup;
}
