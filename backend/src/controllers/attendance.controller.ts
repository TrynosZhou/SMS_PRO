import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Attendance, AttendanceStatus } from '../entities/Attendance';
import { Student } from '../entities/Student';
import { Class } from '../entities/Class';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';

export const markAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission (teacher, admin, or superadmin)
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to mark attendance' });
    }

    const { classId, date, attendanceData } = req.body;

    if (!classId || !date || !attendanceData || !Array.isArray(attendanceData)) {
      return res.status(400).json({ message: 'Class ID, date, and attendance data are required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Verify class exists
    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get current term from settings
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const currentTerm = settings?.activeTerm || settings?.currentTerm || null;

    const attendanceDate = new Date(date);

    // School policy: Week is Sunday -> Saturday, but attendance can only be marked Mon-Fri.
    // Compute weekday from date parts to avoid timezone parsing issues.
    const parts = String(date).split('-').map((p) => Number(p));
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      const [y, m, d] = parts;
      const dayUTC = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun ... 6=Sat
      if (dayUTC === 0 || dayUTC === 6) {
        return res.status(400).json({
          message: 'Attendance can only be marked Monday to Friday (Sundays and Saturdays are not allowed).'
        });
      }
    } else {
      // If date format is unexpected, be safe and reject weekend marking.
      const day = attendanceDate.getDay(); // fallback
      if (day === 0 || day === 6) {
        return res.status(400).json({
          message: 'Attendance can only be marked Monday to Friday (Sundays and Saturdays are not allowed).'
        });
      }
    }

    const results = [];

    // Delete existing attendance records for this class and date
    await attendanceRepository.delete({
      classId,
      date: attendanceDate
    });

    // Create new attendance records
    for (const item of attendanceData) {
      const { studentId, status, remarks } = item;

      if (!studentId || !status) {
        continue;
      }

      // Verify student exists and belongs to the class
      const student = await studentRepository.findOne({
        where: { id: studentId, classId }
      });

      if (!student) {
        continue;
      }

      const attendance = attendanceRepository.create({
        studentId,
        classId,
        date: attendanceDate,
        status: status as AttendanceStatus,
        term: currentTerm,
        remarks: remarks || null,
        markedBy: user.id
      });

      const saved = await attendanceRepository.save(attendance);
      results.push(saved);
    }

    res.json({
      message: `Attendance marked successfully for ${results.length} student(s)`,
      count: results.length,
      date: attendanceDate.toISOString().split('T')[0],
      classId
    });
  } catch (error: any) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    
    // Check if user has permission
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to view attendance' });
    }

    const { classId, date, studentId, term, startDate, endDate } = req.query;

    const attendanceRepository = AppDataSource.getRepository(Attendance);

    const query: any = {};

    if (classId) {
      query.classId = classId as string;
    }

    if (studentId) {
      query.studentId = studentId as string;
    }

    if (date) {
      const dateObj = new Date(date as string);
      if (!isNaN(dateObj.getTime())) {
        query.date = dateObj;
      }
    }

    if (term) {
      query.term = term as string;
    }

    // Build find options
    const findOptions: any = {
      relations: ['student', 'classEntity'],
      order: { date: 'DESC', createdAt: 'DESC' }
    };

    // Add markedByUser relation if it exists in the entity
    try {
      findOptions.relations.push('markedByUser');
    } catch (e) {
      // Relation might not exist, continue without it
    }

    // Only add where clause if we have filters
    if (Object.keys(query).length > 0) {
      findOptions.where = query;
    }

    let attendance;
    try {
      attendance = await attendanceRepository.find(findOptions);
    } catch (dbError: any) {
      // If markedByUser relation fails, try without it
      if (dbError.message && dbError.message.includes('markedByUser')) {
        console.warn('Failed to load markedByUser relation, retrying without it');
        findOptions.relations = ['student', 'classEntity'];
        attendance = await attendanceRepository.find(findOptions);
      } else {
        throw dbError;
      }
    }

    // Filter by date range if provided
    let filteredAttendance = attendance;
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      filteredAttendance = attendance.filter(a => {
        const attDate = new Date(a.date);
        return attDate >= start && attDate <= end;
      });
    }

    res.json({ attendance: filteredAttendance });
  } catch (error: any) {
    console.error('Error fetching attendance:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name
    });
    res.status(500).json({ 
      message: 'Server error', 
      error: error?.message || 'Unknown error' 
    });
  }
};

export const getAttendanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to view attendance reports' });
    }

    const { classId, term, startDate, endDate } = req.query;

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const studentRepository = AppDataSource.getRepository(Student);

    // Get all students in the class
    const students = await studentRepository.find({
      where: { classId: classId as string, isActive: true },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    // Build query for attendance
    const query: any = { classId: classId as string };

    if (term) {
      query.term = term as string;
    }

    // Get all attendance records
    let attendanceRecords = await attendanceRepository.find({
      where: query,
      relations: ['student']
    });

    // Filter by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      attendanceRecords = attendanceRecords.filter(a => {
        const attDate = new Date(a.date);
        return attDate >= start && attDate <= end;
      });
    }

    // Calculate statistics for each student
    const report = students.map(student => {
      const studentAttendance = attendanceRecords.filter(a => a.studentId === student.id);
      
      const present = studentAttendance.filter(a => a.status === AttendanceStatus.PRESENT).length;
      const absent = studentAttendance.filter(a => a.status === AttendanceStatus.ABSENT).length;
      const late = studentAttendance.filter(a => a.status === AttendanceStatus.LATE).length;
      const excused = studentAttendance.filter(a => a.status === AttendanceStatus.EXCUSED).length;
      const total = studentAttendance.length;

      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        present,
        absent,
        late,
        excused,
        total,
        attendanceRate: total > 0 ? ((present + excused) / total * 100).toFixed(2) : '0.00'
      };
    });

    res.json({
      classId,
      term: term || null,
      startDate: startDate || null,
      endDate: endDate || null,
      report,
      summary: {
        totalStudents: students.length,
        totalRecords: attendanceRecords.length,
        averageAttendanceRate: report.length > 0
          ? (report.reduce((sum, r) => sum + parseFloat(r.attendanceRate), 0) / report.length).toFixed(2)
          : '0.00'
      }
    });
  } catch (error: any) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentTotalAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, term } = req.query;

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);

    const query: any = { studentId: studentId as string };

    if (term) {
      query.term = term as string;
    }

    const attendanceRecords = await attendanceRepository.find({
      where: query
    });

    const present = attendanceRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
    const excused = attendanceRecords.filter(a => a.status === AttendanceStatus.EXCUSED).length;
    const total = attendanceRecords.length;

    res.json({
      studentId,
      term: term || null,
      totalAttendance: total,
      present,
      excused,
      totalPresent: present + excused
    });
  } catch (error: any) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Get advanced attendance analytics
 */
export const getAttendanceAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to view attendance analytics' });
    }

    const { classId, term, startDate, endDate, groupBy } = req.query;

    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    let query: any = {};

    if (classId) {
      query.classId = classId as string;
    }

    if (term) {
      query.term = term as string;
    }

    // Get attendance records
    let attendanceRecords = await attendanceRepository.find({
      where: query,
      relations: ['student', 'classEntity'],
      order: { date: 'ASC' }
    });

    // Filter by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      attendanceRecords = attendanceRecords.filter(a => {
        const attDate = new Date(a.date);
        return attDate >= start && attDate <= end;
      });
    }

    // Calculate analytics based on groupBy parameter
    const groupByValue = (groupBy as string) || 'overall';

    let analytics: any = {};

    switch (groupByValue) {
      case 'daily':
        analytics = getDailyAnalytics(attendanceRecords);
        break;
      case 'weekly':
        analytics = getWeeklyAnalytics(attendanceRecords);
        break;
      case 'monthly':
        analytics = getMonthlyAnalytics(attendanceRecords);
        break;
      case 'class':
        analytics = await getClassAnalytics(attendanceRecords, classRepository);
        break;
      case 'student':
        analytics = getStudentAnalytics(attendanceRecords);
        break;
      default:
        analytics = getOverallAnalytics(attendanceRecords);
    }

    res.json({
      groupBy: groupByValue,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        term: term || null
      },
      analytics
    });
  } catch (error: any) {
    console.error('Error generating attendance analytics:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Get overall attendance analytics
 */
function getOverallAnalytics(records: Attendance[]) {
  const total = records.length;
  const present = records.filter(a => a.status === AttendanceStatus.PRESENT).length;
  const absent = records.filter(a => a.status === AttendanceStatus.ABSENT).length;
  const late = records.filter(a => a.status === AttendanceStatus.LATE).length;
  const excused = records.filter(a => a.status === AttendanceStatus.EXCUSED).length;

  const attendanceRate = total > 0 ? ((present + excused) / total) * 100 : 0;
  const absenceRate = total > 0 ? (absent / total) * 100 : 0;
  const latenessRate = total > 0 ? (late / total) * 100 : 0;

  // Get unique students
  const uniqueStudents = new Set(records.map(r => r.studentId));
  
  // Calculate average attendance per student
  const avgAttendancePerStudent = uniqueStudents.size > 0 
    ? total / uniqueStudents.size 
    : 0;

  return {
    summary: {
      totalRecords: total,
      uniqueStudents: uniqueStudents.size,
      present,
      absent,
      late,
      excused,
      attendanceRate: attendanceRate.toFixed(2),
      absenceRate: absenceRate.toFixed(2),
      latenessRate: latenessRate.toFixed(2),
      avgAttendancePerStudent: avgAttendancePerStudent.toFixed(2)
    },
    trends: {
      attendanceRate,
      absenceRate,
      latenessRate
    }
  };
}

/**
 * Get daily attendance analytics
 */
function getDailyAnalytics(records: Attendance[]) {
  const dailyData: { [date: string]: { present: number; absent: number; late: number; excused: number; total: number } } = {};

  records.forEach(record => {
    const dateKey = new Date(record.date).toISOString().split('T')[0];
    
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    dailyData[dateKey].total++;
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        dailyData[dateKey].present++;
        break;
      case AttendanceStatus.ABSENT:
        dailyData[dateKey].absent++;
        break;
      case AttendanceStatus.LATE:
        dailyData[dateKey].late++;
        break;
      case AttendanceStatus.EXCUSED:
        dailyData[dateKey].excused++;
        break;
    }
  });

  const dailyTrends = Object.keys(dailyData).map(date => ({
    date,
    ...dailyData[date],
    attendanceRate: dailyData[date].total > 0 
      ? ((dailyData[date].present + dailyData[date].excused) / dailyData[date].total * 100).toFixed(2)
      : '0.00'
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    dailyTrends,
    averageDailyAttendance: dailyTrends.length > 0
      ? (dailyTrends.reduce((sum, day) => sum + parseFloat(day.attendanceRate), 0) / dailyTrends.length).toFixed(2)
      : '0.00'
  };
}

/**
 * Get weekly attendance analytics
 */
function getWeeklyAnalytics(records: Attendance[]) {
  const weeklyData: { [week: string]: { present: number; absent: number; late: number; excused: number; total: number } } = {};

  records.forEach(record => {
    const date = new Date(record.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    weeklyData[weekKey].total++;
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        weeklyData[weekKey].present++;
        break;
      case AttendanceStatus.ABSENT:
        weeklyData[weekKey].absent++;
        break;
      case AttendanceStatus.LATE:
        weeklyData[weekKey].late++;
        break;
      case AttendanceStatus.EXCUSED:
        weeklyData[weekKey].excused++;
        break;
    }
  });

  const weeklyTrends = Object.keys(weeklyData).map(week => ({
    week,
    ...weeklyData[week],
    attendanceRate: weeklyData[week].total > 0 
      ? ((weeklyData[week].present + weeklyData[week].excused) / weeklyData[week].total * 100).toFixed(2)
      : '0.00'
  })).sort((a, b) => a.week.localeCompare(b.week));

  return {
    weeklyTrends,
    averageWeeklyAttendance: weeklyTrends.length > 0
      ? (weeklyTrends.reduce((sum, week) => sum + parseFloat(week.attendanceRate), 0) / weeklyTrends.length).toFixed(2)
      : '0.00'
  };
}

/**
 * Get monthly attendance analytics
 */
function getMonthlyAnalytics(records: Attendance[]) {
  const monthlyData: { [month: string]: { present: number; absent: number; late: number; excused: number; total: number } } = {};

  records.forEach(record => {
    const date = new Date(record.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    monthlyData[monthKey].total++;
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        monthlyData[monthKey].present++;
        break;
      case AttendanceStatus.ABSENT:
        monthlyData[monthKey].absent++;
        break;
      case AttendanceStatus.LATE:
        monthlyData[monthKey].late++;
        break;
      case AttendanceStatus.EXCUSED:
        monthlyData[monthKey].excused++;
        break;
    }
  });

  const monthlyTrends = Object.keys(monthlyData).map(month => ({
    month,
    ...monthlyData[month],
    attendanceRate: monthlyData[month].total > 0 
      ? ((monthlyData[month].present + monthlyData[month].excused) / monthlyData[month].total * 100).toFixed(2)
      : '0.00'
  })).sort((a, b) => a.month.localeCompare(b.month));

  return {
    monthlyTrends,
    averageMonthlyAttendance: monthlyTrends.length > 0
      ? (monthlyTrends.reduce((sum, month) => sum + parseFloat(month.attendanceRate), 0) / monthlyTrends.length).toFixed(2)
      : '0.00'
  };
}

/**
 * Get class-based attendance analytics
 */
async function getClassAnalytics(records: Attendance[], classRepository: any) {
  const classData: { [classId: string]: { present: number; absent: number; late: number; excused: number; total: number; className?: string } } = {};

  records.forEach(record => {
    const classId = record.classId;
    
    if (!classData[classId]) {
      classData[classId] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    classData[classId].total++;
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        classData[classId].present++;
        break;
      case AttendanceStatus.ABSENT:
        classData[classId].absent++;
        break;
      case AttendanceStatus.LATE:
        classData[classId].late++;
        break;
      case AttendanceStatus.EXCUSED:
        classData[classId].excused++;
        break;
    }
  });

  // Get class names
  for (const classId of Object.keys(classData)) {
    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (classEntity) {
      classData[classId].className = classEntity.name;
    }
  }

  const classTrends = Object.keys(classData).map(classId => ({
    classId,
    className: classData[classId].className || 'Unknown',
    ...classData[classId],
    attendanceRate: classData[classId].total > 0 
      ? ((classData[classId].present + classData[classId].excused) / classData[classId].total * 100).toFixed(2)
      : '0.00'
  }));

  return {
    classTrends,
    averageClassAttendance: classTrends.length > 0
      ? (classTrends.reduce((sum, cls) => sum + parseFloat(cls.attendanceRate), 0) / classTrends.length).toFixed(2)
      : '0.00'
  };
}

/**
 * Get student-based attendance analytics
 */
function getStudentAnalytics(records: Attendance[]) {
  const studentData: { [studentId: string]: { 
    present: number; 
    absent: number; 
    late: number; 
    excused: number; 
    total: number;
    studentName?: string;
    studentNumber?: string;
  } } = {};

  records.forEach(record => {
    const studentId = record.studentId;
    
    if (!studentData[studentId]) {
      studentData[studentId] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }

    studentData[studentId].total++;
    if (record.student) {
      studentData[studentId].studentName = `${record.student.firstName} ${record.student.lastName}`;
      studentData[studentId].studentNumber = record.student.studentNumber;
    }
    
    switch (record.status) {
      case AttendanceStatus.PRESENT:
        studentData[studentId].present++;
        break;
      case AttendanceStatus.ABSENT:
        studentData[studentId].absent++;
        break;
      case AttendanceStatus.LATE:
        studentData[studentId].late++;
        break;
      case AttendanceStatus.EXCUSED:
        studentData[studentId].excused++;
        break;
    }
  });

  const studentTrends = Object.keys(studentData).map(studentId => ({
    studentId,
    studentName: studentData[studentId].studentName || 'Unknown',
    studentNumber: studentData[studentId].studentNumber || 'N/A',
    ...studentData[studentId],
    attendanceRate: studentData[studentId].total > 0 
      ? ((studentData[studentId].present + studentData[studentId].excused) / studentData[studentId].total * 100).toFixed(2)
      : '0.00'
  })).sort((a, b) => parseFloat(b.attendanceRate) - parseFloat(a.attendanceRate));

  return {
    studentTrends,
    topPerformers: studentTrends.slice(0, 10),
    needsAttention: studentTrends.filter(s => parseFloat(s.attendanceRate) < 75).slice(0, 10)
  };
}

