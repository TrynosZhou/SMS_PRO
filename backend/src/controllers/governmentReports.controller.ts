import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Marks } from '../entities/Marks';
import { Attendance, AttendanceStatus } from '../entities/Attendance';
import { Invoice } from '../entities/Invoice';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Settings } from '../entities/Settings';
import { createGovernmentReportPDF } from '../utils/governmentReportPdfGenerator';

/**
 * Generate government-ready student enrollment report
 */
export const generateEnrollmentReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can generate government reports' });
    }

    const { term, year, format } = req.query;

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get all enrolled students
    const students = await studentRepository.find({
      where: { 
        enrollmentStatus: 'Enrolled',
        isActive: true
      },
      relations: ['classEntity', 'parent']
    });

    // Filter by term/year if provided
    let filteredStudents = students;
    // Note: You may need to add term/year filtering based on enrollment dates

    // Group by class
    const studentsByClass: { [className: string]: Student[] } = {};
    filteredStudents.forEach(student => {
      const className = student.classEntity?.name || 'Unassigned';
      if (!studentsByClass[className]) {
        studentsByClass[className] = [];
      }
      studentsByClass[className].push(student);
    });

    // Get settings for school information
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const reportData = {
      schoolName: settings?.schoolName || 'School Name',
      schoolAddress: settings?.schoolAddress || '',
      term: term || 'Current Term',
      year: year || new Date().getFullYear().toString(),
      generatedDate: new Date().toISOString(),
      studentsByClass,
      totalStudents: filteredStudents.length,
      summary: {
        byGender: {
          male: filteredStudents.filter(s => s.gender?.toLowerCase() === 'male').length,
          female: filteredStudents.filter(s => s.gender?.toLowerCase() === 'female').length,
          other: filteredStudents.filter(s => s.gender?.toLowerCase() !== 'male' && s.gender?.toLowerCase() !== 'female').length
        },
        byClass: Object.keys(studentsByClass).map(className => ({
          className,
          count: studentsByClass[className].length
        }))
      }
    };

    if (format === 'json') {
      return res.json(reportData);
    }

    // Generate PDF
    const pdfBuffer = await createGovernmentReportPDF(reportData, 'enrollment');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=enrollment-report-${term || 'current'}-${year || new Date().getFullYear()}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating enrollment report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Generate government-ready academic performance report
 */
export const generateAcademicPerformanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can generate government reports' });
    }

    const { term, year, classId, format } = req.query;

    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get students
    let students: Student[];
    if (classId) {
      students = await studentRepository.find({
        where: { classId: classId as string, isActive: true },
        relations: ['classEntity']
      });
    } else {
      students = await studentRepository.find({
        where: { isActive: true },
        relations: ['classEntity']
      });
    }

    // Get marks for the term
    // Note: Adjust this based on how terms are stored in your Exam entity
    const allMarks = await marksRepository.find({
      where: {},
      relations: ['student', 'subject', 'exam']
    });

    // Calculate performance metrics
    const performanceData = students.map(student => {
      const studentMarks = allMarks.filter(m => m.studentId === student.id);
      
      // Calculate average percentage
      let totalPercentage = 0;
      let subjectCount = 0;
      
      const subjectScores: { [subject: string]: number } = {};
      
      studentMarks.forEach(mark => {
        if (mark.subject) {
          const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
          const score = mark.uniformMark !== null && mark.uniformMark !== undefined
            ? parseFloat(String(mark.uniformMark))
            : parseFloat(String(mark.score));
          const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
          
          if (!subjectScores[mark.subject.name]) {
            subjectScores[mark.subject.name] = 0;
          }
          subjectScores[mark.subject.name] += percentage;
          totalPercentage += percentage;
          subjectCount++;
        }
      });

      const averagePercentage = subjectCount > 0 ? totalPercentage / subjectCount : 0;

      // Determine grade
      let grade = 'F';
      if (averagePercentage >= 90) grade = 'A+';
      else if (averagePercentage >= 80) grade = 'A';
      else if (averagePercentage >= 70) grade = 'B';
      else if (averagePercentage >= 60) grade = 'C';
      else if (averagePercentage >= 50) grade = 'D';
      else if (averagePercentage >= 40) grade = 'E';

      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.classEntity?.name || 'Unknown',
        averagePercentage: averagePercentage.toFixed(2),
        grade,
        subjectCount,
        subjectScores
      };
    });

    // Get settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const reportData = {
      schoolName: settings?.schoolName || 'School Name',
      schoolAddress: settings?.schoolAddress || '',
      term: term || 'Current Term',
      year: year || new Date().getFullYear().toString(),
      generatedDate: new Date().toISOString(),
      performanceData,
      summary: {
        totalStudents: students.length,
        averagePerformance: performanceData.length > 0
          ? (performanceData.reduce((sum, p) => sum + parseFloat(p.averagePercentage), 0) / performanceData.length).toFixed(2)
          : '0.00',
        gradeDistribution: {
          'A+': performanceData.filter(p => p.grade === 'A+').length,
          'A': performanceData.filter(p => p.grade === 'A').length,
          'B': performanceData.filter(p => p.grade === 'B').length,
          'C': performanceData.filter(p => p.grade === 'C').length,
          'D': performanceData.filter(p => p.grade === 'D').length,
          'E': performanceData.filter(p => p.grade === 'E').length,
          'F': performanceData.filter(p => p.grade === 'F').length
        }
      }
    };

    if (format === 'json') {
      return res.json(reportData);
    }

    // Generate PDF
    const pdfBuffer = await createGovernmentReportPDF(reportData, 'academic');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=academic-performance-report-${term || 'current'}-${year || new Date().getFullYear()}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating academic performance report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Generate government-ready attendance report
 */
export const generateAttendanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can generate government reports' });
    }

    const { term, year, classId, format } = req.query;

    const studentRepository = AppDataSource.getRepository(Student);
    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get students
    let students: Student[];
    if (classId) {
      students = await studentRepository.find({
        where: { classId: classId as string, isActive: true },
        relations: ['classEntity']
      });
    } else {
      students = await studentRepository.find({
        where: { isActive: true },
        relations: ['classEntity']
      });
    }

    // Get attendance records
    const query: any = {};
    if (term) {
      query.term = term;
    }

    const attendanceRecords = await attendanceRepository.find({
      where: query,
      relations: ['student']
    });

    // Calculate attendance for each student
    const attendanceData = students.map(student => {
      const studentRecords = attendanceRecords.filter(a => a.studentId === student.id);
      const present = studentRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
      const absent = studentRecords.filter(a => a.status === AttendanceStatus.ABSENT).length;
      const late = studentRecords.filter(a => a.status === AttendanceStatus.LATE).length;
      const excused = studentRecords.filter(a => a.status === AttendanceStatus.EXCUSED).length;
      const total = studentRecords.length;
      const attendanceRate = total > 0 ? ((present + excused) / total) * 100 : 0;

      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.classEntity?.name || 'Unknown',
        present,
        absent,
        late,
        excused,
        total,
        attendanceRate: attendanceRate.toFixed(2)
      };
    });

    // Get settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const reportData = {
      schoolName: settings?.schoolName || 'School Name',
      schoolAddress: settings?.schoolAddress || '',
      term: term || 'Current Term',
      year: year || new Date().getFullYear().toString(),
      generatedDate: new Date().toISOString(),
      attendanceData,
      summary: {
        totalStudents: students.length,
        averageAttendanceRate: attendanceData.length > 0
          ? (attendanceData.reduce((sum, a) => sum + parseFloat(a.attendanceRate), 0) / attendanceData.length).toFixed(2)
          : '0.00',
        totalPresent: attendanceData.reduce((sum, a) => sum + a.present, 0),
        totalAbsent: attendanceData.reduce((sum, a) => sum + a.absent, 0),
        totalLate: attendanceData.reduce((sum, a) => sum + a.late, 0)
      }
    };

    if (format === 'json') {
      return res.json(reportData);
    }

    // Generate PDF
    const pdfBuffer = await createGovernmentReportPDF(reportData, 'attendance');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=attendance-report-${term || 'current'}-${year || new Date().getFullYear()}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Generate comprehensive government report (all data)
 */
export const generateComprehensiveReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can generate government reports' });
    }

    const { term, year, format } = req.query;

    // This would combine enrollment, academic, and attendance data
    // For now, return a summary
    const reportData = {
      message: 'Comprehensive report generation - combine enrollment, academic, and attendance reports',
      term: term || 'Current Term',
      year: year || new Date().getFullYear().toString()
    };

    if (format === 'json') {
      return res.json(reportData);
    }

    res.json({
      message: 'Comprehensive report feature - implement by combining enrollment, academic, and attendance reports',
      data: reportData
    });
  } catch (error: any) {
    console.error('Error generating comprehensive report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

