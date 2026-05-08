import OpenAI from 'openai';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Marks } from '../entities/Marks';
import { Attendance, AttendanceStatus } from '../entities/Attendance';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

interface StudentPerformanceData {
  student: {
    firstName: string;
    lastName: string;
    studentNumber: string;
    class?: string;
  };
  marks: Array<{
    subject: string;
    score: number;
    maxScore: number;
    percentage: number;
    grade: string;
    comments?: string;
  }>;
  attendance: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    attendanceRate: number;
  };
  overallPercentage: number;
  classPosition?: number;
  formPosition?: number;
  term: string;
}

/**
 * Generate AI-powered report card comment based on student performance
 */
export async function generateAIComment(
  studentId: string,
  term: string,
  commentType: 'classTeacher' | 'headmaster' = 'classTeacher'
): Promise<string> {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not configured. Returning default comment.');
      return generateDefaultComment(studentId, term, commentType);
    }

    // Fetch student data
    const performanceData = await getStudentPerformanceData(studentId, term);
    
    if (!performanceData) {
      return generateDefaultComment(studentId, term, commentType);
    }

    // Build prompt for OpenAI
    const prompt = buildCommentPrompt(performanceData, commentType);

    // Call OpenAI API
    const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an experienced school teacher/principal writing report card comments. Write professional, encouraging, and constructive comments that highlight strengths and suggest areas for improvement. Keep comments concise (2-3 sentences) and appropriate for school report cards.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const comment = completion.choices[0]?.message?.content?.trim() || '';
    
    if (!comment) {
      return generateDefaultComment(studentId, term, commentType);
    }

    return comment;
  } catch (error: any) {
    console.error('Error generating AI comment:', error);
    // Fallback to default comment on error
    return generateDefaultComment(studentId, term, commentType);
  }
}

/**
 * Get student performance data for AI comment generation
 */
async function getStudentPerformanceData(
  studentId: string,
  term: string
): Promise<StudentPerformanceData | null> {
  try {
    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const attendanceRepository = AppDataSource.getRepository(Attendance);

    // Get student
    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return null;
    }

    // Get marks for the term
    // Note: This assumes marks are linked to exams which have terms
    // You may need to adjust based on your data structure
    const allMarks = await marksRepository.find({
      where: { studentId },
      relations: ['subject', 'exam']
    });

    // Filter marks by term (assuming exam has term field or we can infer from dates)
    const termMarks = allMarks.filter(mark => {
      // Adjust this logic based on your exam/term structure
      return true; // For now, include all marks
    });

    // Calculate subject performance
    const subjectPerformance: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[] } } = {};
    
    termMarks.forEach(mark => {
      if (!mark.subject) return;
      
      const subjectName = mark.subject.name;
      if (!subjectPerformance[subjectName]) {
        subjectPerformance[subjectName] = { scores: [], maxScores: [], percentages: [] };
      }

      const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
      const score = mark.uniformMark !== null && mark.uniformMark !== undefined
        ? parseFloat(String(mark.uniformMark))
        : parseFloat(String(mark.score));
      const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

      subjectPerformance[subjectName].scores.push(score);
      subjectPerformance[subjectName].maxScores.push(maxScore);
      subjectPerformance[subjectName].percentages.push(percentage);
    });

    // Convert to array format
    const marks = Object.keys(subjectPerformance).map(subjectName => {
      const data = subjectPerformance[subjectName];
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const avgMaxScore = data.maxScores.reduce((a, b) => a + b, 0) / data.maxScores.length;
      const avgPercentage = data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length;
      
      // Determine grade
      let grade = 'F';
      if (avgPercentage >= 90) grade = 'A+';
      else if (avgPercentage >= 80) grade = 'A';
      else if (avgPercentage >= 70) grade = 'B';
      else if (avgPercentage >= 60) grade = 'C';
      else if (avgPercentage >= 50) grade = 'D';
      else if (avgPercentage >= 40) grade = 'E';

      return {
        subject: subjectName,
        score: avgScore,
        maxScore: avgMaxScore,
        percentage: avgPercentage,
        grade
      };
    });

    // Calculate overall percentage
    const overallPercentage = marks.length > 0
      ? marks.reduce((sum, m) => sum + m.percentage, 0) / marks.length
      : 0;

    // Get attendance data
    const attendanceRecords = await attendanceRepository.find({
      where: { studentId, term }
    });

    const present = attendanceRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
    const absent = attendanceRecords.filter(a => a.status === AttendanceStatus.ABSENT).length;
    const late = attendanceRecords.filter(a => a.status === AttendanceStatus.LATE).length;
    const excused = attendanceRecords.filter(a => a.status === AttendanceStatus.EXCUSED).length;
    const total = attendanceRecords.length;
    const attendanceRate = total > 0 ? ((present + excused) / total) * 100 : 0;

    return {
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        studentNumber: student.studentNumber,
        class: student.classEntity?.name || 'Unknown'
      },
      marks,
      attendance: {
        present,
        absent,
        late,
        excused,
        total,
        attendanceRate
      },
      overallPercentage,
      term
    };
  } catch (error) {
    console.error('Error fetching student performance data:', error);
    return null;
  }
}

/**
 * Build prompt for AI comment generation
 */
function buildCommentPrompt(
  data: StudentPerformanceData,
  commentType: 'classTeacher' | 'headmaster'
): string {
  const { student, marks, attendance, overallPercentage } = data;
  
  const topSubjects = marks
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3)
    .map(m => `${m.subject} (${m.percentage.toFixed(1)}%)`)
    .join(', ');

  const weakSubjects = marks
    .filter(m => m.percentage < 50)
    .map(m => m.subject)
    .join(', ');

  const attendanceStatus = attendance.attendanceRate >= 90 
    ? 'excellent' 
    : attendance.attendanceRate >= 75 
      ? 'good' 
      : attendance.attendanceRate >= 60 
        ? 'satisfactory' 
        : 'needs improvement';

  if (commentType === 'classTeacher') {
    return `Write a class teacher comment for ${student.firstName} ${student.lastName} (${student.studentNumber}) in ${student.class} for ${data.term}.

Performance Summary:
- Overall Performance: ${overallPercentage.toFixed(1)}%
- Top Subjects: ${topSubjects || 'N/A'}
- Weak Subjects: ${weakSubjects || 'None'}
- Attendance: ${attendance.attendanceRate.toFixed(1)}% (${attendanceStatus})
- Present: ${attendance.present} days, Absent: ${attendance.absent} days, Late: ${attendance.late} days

Write an encouraging, constructive comment (2-3 sentences) that:
1. Acknowledges their strengths
2. Identifies areas for improvement
3. Provides motivation for the next term

Keep it professional and appropriate for a school report card.`;
  } else {
    return `Write a headmaster/principal comment for ${student.firstName} ${student.lastName} (${student.studentNumber}) in ${student.class} for ${data.term}.

Performance Summary:
- Overall Performance: ${overallPercentage.toFixed(1)}%
- Attendance: ${attendance.attendanceRate.toFixed(1)}%

Write a brief, authoritative comment (2-3 sentences) from the headmaster/principal perspective that:
1. Recognizes overall performance
2. Encourages continued effort
3. Provides school-level perspective

Keep it professional and appropriate for a school report card.`;
  }
}

/**
 * Generate default comment when AI is unavailable
 */
function generateDefaultComment(
  studentId: string,
  term: string,
  commentType: 'classTeacher' | 'headmaster'
): string {
  if (commentType === 'classTeacher') {
    return `This student has shown consistent effort throughout ${term}. Continue to work hard and maintain good attendance.`;
  } else {
    return `The school acknowledges this student's performance in ${term}. Keep up the good work and continue striving for excellence.`;
  }
}

/**
 * Batch generate comments for multiple students
 */
export async function generateBatchComments(
  studentIds: string[],
  term: string,
  commentType: 'classTeacher' | 'headmaster' = 'classTeacher'
): Promise<{ [studentId: string]: string }> {
  const results: { [studentId: string]: string } = {};
  
  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < studentIds.length; i += batchSize) {
    const batch = studentIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (studentId) => {
        try {
          const comment = await generateAIComment(studentId, term, commentType);
          results[studentId] = comment;
          // Add small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error generating comment for student ${studentId}:`, error);
          results[studentId] = generateDefaultComment(studentId, term, commentType);
        }
      })
    );
  }
  
  return results;
}

