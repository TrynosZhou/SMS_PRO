import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { navigateToExamsList } from '../exams-manage-navigation';

@Component({
  selector: 'app-mark-sheet',
  templateUrl: './mark-sheet.component.html',
  styleUrls: ['./mark-sheet.component.css']
})
export class MarkSheetComponent implements OnInit {
  classes: any[] = [];
  allSubjects: any[] = [];
  subjects: any[] = [];
  selectedClassId = '';
  selectedExamType = '';
  selectedTerm = '';
  selectedSubjectId = '';
  
  // Teacher data
  teacher: any = null;
  teacherSubjects: any[] = [];
  isAdmin = false;
  loadingTerm = false;
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  markSheetData: any = null;
  filteredMarkSheet: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  // School settings
  schoolLogo: string | null = null;
  schoolName: string = 'JUNIOR HIGH SCHOOL';
  schoolMotto: string = 'After instruction we soar';
  
  // Modern features
  searchQuery = '';
  sortColumn = 'position';
  sortDirection: 'asc' | 'desc' = 'asc';
  showStatistics = true;

  /** PDF: print preview vs file download */
  pdfBusy: null | 'print' | 'download' = null;
  pdfError = '';
  
  // Statistics
  statistics: any = {
    totalStudents: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: 0,
    passRate: 0,
    topPerformers: []
  };

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    public authService: AuthService,
    public router: Router
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  goToExamsList(): void {
    navigateToExamsList(this.router);
  }

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    
    // If user is a teacher, load teacher-specific data
    if (user && user.role === 'teacher' && !this.isAdmin) {
      this.loadTeacherInfo();
    } else {
      // Admin/SuperAdmin can see all classes and subjects
      this.loadClasses();
      this.loadSubjects();
    }
    
    this.loadActiveTerm();
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        console.log('Settings loaded:', settings);
        // Handle both array and single object responses
        let settingsData = settings;
        if (Array.isArray(settings) && settings.length > 0) {
          settingsData = settings[0];
        }
        
        if (settingsData) {
          // Get logo - check both schoolLogo and schoolLogo2
          const logo = settingsData.schoolLogo || settingsData.schoolLogo2;
          if (logo) {
            // Handle base64 data URLs
            if (typeof logo === 'string') {
              if (logo.startsWith('data:image')) {
                this.schoolLogo = logo;
              } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
                this.schoolLogo = logo;
              } else if (logo.length > 100) {
                // Assume it's a base64 string without data URL prefix
                this.schoolLogo = `data:image/png;base64,${logo}`;
              } else {
                // Might be a file path, try to construct URL
                this.schoolLogo = logo;
              }
              console.log('School logo set:', this.schoolLogo ? 'Yes' : 'No', this.schoolLogo ? '(length: ' + this.schoolLogo.length + ')' : '');
            }
          } else {
            console.log('No logo found in settings');
          }
          
          if (settingsData.schoolName) {
            this.schoolName = settingsData.schoolName.toUpperCase();
          }
          if (settingsData.schoolMotto) {
            this.schoolMotto = settingsData.schoolMotto;
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Use default values if settings fail to load
      }
    });
  }

  loadTeacherInfo() {
    // Load teacher profile to get teacher ID and subjects
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        this.teacherSubjects = teacher.subjects || [];
        
        // Load classes assigned to this teacher
        if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          this.classes = [];
          this.error = 'Teacher ID not found. Please contact administrator.';
        }
        
        // Load all subjects (we'll filter them later based on selected class)
        this.loadAllSubjects();
      },
      error: (err: any) => {
        console.error('Error loading teacher info:', err);
        this.error = 'Failed to load teacher information. Please try again.';
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        const classesList = (response.classes || []).filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(classesList);
        console.log('Loaded teacher classes:', this.classes.length);
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        this.classes = [];
        this.error = 'Failed to load assigned classes. Please try again.';
      }
    });
  }

  loadClasses() {
    // For admin/superadmin - load all classes
    this.loading = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(activeClasses);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadAllSubjects() {
    // Load all subjects (we'll filter based on teacher and class)
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        this.updateSubjectsForSelectedClass();
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.allSubjects = [];
      }
    });
  }

  loadSubjects() {
    // For admin/superadmin - load all subjects
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        this.subjects = data || [];
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.allSubjects = [];
        this.subjects = [];
      }
    });
  }

  updateSubjectsForSelectedClass() {
    if (!this.selectedClassId || this.isAdmin) {
      // If no class selected or admin, show all subjects (or teacher's subjects if teacher)
      if (!this.isAdmin && this.teacherSubjects.length > 0) {
        this.subjects = this.teacherSubjects;
      } else {
        this.subjects = this.allSubjects;
      }
      return;
    }

    // For teachers: filter subjects that:
    // 1. Teacher is assigned to teach
    // 2. Are taught in the selected class
    if (this.teacher && this.teacherSubjects.length > 0) {
      // Get class details to check which subjects are taught in this class
      this.classService.getClassById(this.selectedClassId).subscribe({
        next: (classData: any) => {
          const classSubjectIds = (classData.subjects || []).map((s: any) => s.id);
          
          // Find intersection: subjects teacher teaches AND that are in the class
          this.subjects = this.teacherSubjects.filter((teacherSubject: any) => 
            classSubjectIds.includes(teacherSubject.id)
          );
          
          console.log('Filtered subjects for class:', this.subjects.length);
          
          // Reset subject selection if current selection is not in filtered list
          if (this.selectedSubjectId && !this.subjects.find(s => s.id === this.selectedSubjectId)) {
            this.selectedSubjectId = '';
          }
        },
        error: (err: any) => {
          console.error('Error loading class details:', err);
          // Fallback: show only teacher's subjects
          this.subjects = this.teacherSubjects;
        }
      });
    } else {
      // Fallback: show all subjects if teacher info not loaded
      this.subjects = this.allSubjects;
    }
  }

  loadActiveTerm() {
    this.loadingTerm = true;
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
        }
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.loadingTerm = false;
      }
    });
  }

  onClassChange() {
    this.selectedSubjectId = '';
    this.markSheetData = null;
    this.filteredMarkSheet = [];
    
    // If class changed and user is a teacher, update subjects list
    if (!this.isAdmin && this.selectedClassId) {
      this.updateSubjectsForSelectedClass();
    }
  }

  generateMarkSheet() {
    if (!this.selectedClassId || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Please select class, exam type, and term';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.markSheetData = null;

    this.examService.generateMarkSheet(
      this.selectedClassId, 
      this.selectedExamType, 
      this.selectedTerm
    ).subscribe({
      next: (data: any) => {
        this.markSheetData = data;
        // Calculate grade statistics for each student
        this.calculateGradeStatistics(data.markSheet);
        this.filteredMarkSheet = [...data.markSheet];
        this.calculateStatistics();
        this.loading = false;
        this.success = 'Mark sheet generated successfully';
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error generating mark sheet:', err);
        this.error = err.error?.message || 'Failed to generate mark sheet';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  printMarkSheet() {
    if (!this.canRequestMarkSheetPdf()) {
      return;
    }

    this.pdfError = '';
    this.error = '';
    this.pdfBusy = 'print';

    this.examService
      .getMarkSheetPdf(
        this.selectedClassId,
        this.selectedExamType,
        this.selectedTerm,
        this.selectedSubjectId || undefined,
        { download: false }
      )
      .subscribe({
        next: (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank', 'noopener,noreferrer');
          if (!win) {
            this.pdfError =
              'Pop-up blocked. Allow pop-ups to open the PDF print preview, or use Download to save the file.';
          }
          setTimeout(() => URL.revokeObjectURL(url), 120000);
          this.pdfBusy = null;
        },
        error: (err: any) => {
          console.error('Error opening mark sheet PDF for print:', err);
          this.pdfBusy = null;
          this.pdfError =
            err?.error?.message || err?.message || 'Could not open mark sheet PDF for printing.';
          setTimeout(() => (this.pdfError = ''), 8000);
        }
      });
  }

  downloadPDF() {
    if (!this.canRequestMarkSheetPdf()) {
      return;
    }

    this.pdfError = '';
    this.error = '';
    this.success = '';
    this.pdfBusy = 'download';

    this.examService
      .getMarkSheetPdf(
        this.selectedClassId,
        this.selectedExamType,
        this.selectedTerm,
        this.selectedSubjectId || undefined,
        { download: true }
      )
      .subscribe({
        next: (blob: Blob) => {
          const fileURL = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = fileURL;
          const base = this.sanitizeFileName(this.markSheetData?.class?.name || 'class');
          const exam = this.sanitizeFileName(this.selectedExamType.replace('_', '-'));
          link.download = `mark-sheet-${base}-${exam}-${new Date().toISOString().split('T')[0]}.pdf`;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(fileURL);
          this.pdfBusy = null;
          this.success = 'Mark sheet PDF downloaded';
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (err: any) => {
          console.error('Error downloading mark sheet PDF:', err);
          this.pdfBusy = null;
          const status = err?.status ? `HTTP ${err.status}` : '';
          const message = err?.error?.message || err?.message || 'Failed to download mark sheet PDF';
          this.pdfError = status ? `${status}: ${message}` : message;
          setTimeout(() => (this.pdfError = ''), 8000);
        }
      });
  }

  private canRequestMarkSheetPdf(): boolean {
    if (!this.selectedClassId || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Please select class, exam type, and term';
      setTimeout(() => (this.error = ''), 5000);
      return false;
    }
    if (!this.markSheetData) {
      this.error = 'Please generate the mark sheet first';
      setTimeout(() => (this.error = ''), 5000);
      return false;
    }
    return true;
  }

  private sanitizeFileName(name: string): string {
    const s = String(name || 'class').trim() || 'class';
    return s.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_|_$/g, '') || 'class';
  }

  exportToCSV() {
    if (!this.markSheetData) return;

    const csvRows: string[] = [];
    
    // Header row
    const headers = ['Position', 'Student Number', 'Student Name', ...this.markSheetData.subjects.map((s: any) => s.name), 'Total Score', 'Total Max Score', 'Average %'];
    csvRows.push(headers.join(','));

    // Data rows
    this.markSheetData.markSheet.forEach((row: any) => {
      const values = [
        row.position,
        row.studentNumber,
        `"${row.studentName}"`,
        ...this.markSheetData.subjects.map((subject: any) => {
          const subjectData = row.subjects[subject.id];
          return subjectData ? `${subjectData.score}/${subjectData.maxScore} (${subjectData.percentage}%)` : '0/100 (0%)';
        }),
        row.totalScore,
        row.totalMaxScore,
        row.average
      ];
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `mark-sheet-${this.markSheetData.class.name}-${this.selectedExamType}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getSubjectMark(row: any, subjectId: string) {
    const subjectData = row.subjects[subjectId];
    if (!subjectData) return { score: 0, maxScore: 100, percentage: 0 };
    return subjectData;
  }

  // Modern features
  onSearch() {
    if (!this.markSheetData) return;
    
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredMarkSheet = [...this.markSheetData.markSheet];
      return;
    }

    this.filteredMarkSheet = this.markSheetData.markSheet.filter((row: any) => {
      return row.studentName.toLowerCase().includes(query) ||
             row.studentNumber.toLowerCase().includes(query) ||
             String(row.position).includes(query);
    });
  }

  sortTable(column: string) {
    if (!this.markSheetData) return;

    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filteredMarkSheet = [...this.filteredMarkSheet].sort((a: any, b: any) => {
      let aVal: any, bVal: any;

      switch (column) {
        case 'position':
          aVal = a.position;
          bVal = b.position;
          break;
        case 'studentName':
          aVal = a.studentName.toLowerCase();
          bVal = b.studentName.toLowerCase();
          break;
        case 'studentNumber':
          aVal = a.studentNumber;
          bVal = b.studentNumber;
          break;
        case 'average':
          aVal = a.average;
          bVal = b.average;
          break;
        case 'totalScore':
          aVal = a.totalScore;
          bVal = b.totalScore;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '⇅';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  calculateStatistics() {
    if (!this.markSheetData || !this.markSheetData.markSheet.length) return;

    const marks = this.markSheetData.markSheet;
    const averages = marks.map((m: any) => m.average);
    
    this.statistics.totalStudents = marks.length;
    this.statistics.averageScore = Math.round(
      averages.reduce((sum: number, avg: number) => sum + avg, 0) / averages.length
    );
    this.statistics.highestScore = Math.max(...averages);
    this.statistics.lowestScore = Math.min(...averages);
    this.statistics.passRate = Math.round(
      (averages.filter((avg: number) => avg >= 50).length / averages.length) * 100
    );
    this.statistics.topPerformers = marks
      .sort((a: any, b: any) => b.average - a.average)
      .slice(0, 3)
      .map((m: any) => ({ name: m.studentName, average: m.average }));
  }

  getPerformanceClass(average: number): string {
    if (average >= 80) return 'excellent';
    if (average >= 70) return 'very-good';
    if (average >= 60) return 'good';
    if (average >= 50) return 'satisfactory';
    return 'needs-improvement';
  }

  getPerformanceColor(average: number): string {
    if (average >= 80) return '#28a745';
    if (average >= 70) return '#17a2b8';
    if (average >= 60) return '#ffc107';
    if (average >= 50) return '#fd7e14';
    return '#dc3545';
  }

  calculateGradeStatistics(markSheet: any[]) {
    markSheet.forEach((row: any) => {
      // Count grades for each subject
      row.gradeCounts = {
        a: 0,      // As (80-100)
        b: 0,      // BS (70-79)
        c: 0,      // CS (60-69)
        d: 0,      // Ds (50-59)
        e: 0,      // Es (1-49)
        u: 0       // Us (0 only)
      };
      row.passed = 0;

      if (this.markSheetData && this.markSheetData.subjects) {
        this.markSheetData.subjects.forEach((subject: any) => {
          const subjectMark = this.getSubjectMark(row, subject.id);
          const percentage = subjectMark.percentage;

          // Count grades
          if (percentage >= 80) row.gradeCounts.a++;
          else if (percentage >= 70) row.gradeCounts.b++;
          else if (percentage >= 60) row.gradeCounts.c++;
          else if (percentage >= 50) row.gradeCounts.d++;
          else if (percentage > 0) row.gradeCounts.e++;
          else row.gradeCounts.u++;

          // Count passed subjects (>= 50%)
          if (percentage >= 50) row.passed++;
        });
      }
    });
  }

  getGradeCount(row: any, grade: string): number {
    if (!row.gradeCounts) return 0;
    switch(grade) {
      case 'a': return row.gradeCounts.a || 0;
      case 'b': return row.gradeCounts.b || 0;
      case 'c': return row.gradeCounts.c || 0;
      case 'd': return row.gradeCounts.d || 0;
      case 'e': return row.gradeCounts.e || 0;
      case 'u': return row.gradeCounts.u || 0;
      default: return 0;
    }
  }

  getSelectedSubjectName(): string {
    if (!this.markSheetData || !this.selectedSubjectId) return '';
    const subject = this.markSheetData.subjects.find((s: any) => s.id === this.selectedSubjectId);
    return subject ? subject.name : '';
  }

  getSelectedSubjectMark(row: any): any {
    if (!this.selectedSubjectId) return { score: 0, percentage: 0 };
    return this.getSubjectMark(row, this.selectedSubjectId);
  }

  getSelectedExamTypeLabel(): string {
    const examType = this.examTypes.find(et => et.value === this.selectedExamType);
    return examType ? examType.label : this.selectedExamType;
  }

  onLogoError() {
    console.error('Error loading school logo image');
    this.schoolLogo = null; // Fallback to placeholder icon
  }

  getSubjectAverage(subjectId: string): number {
    if (!this.markSheetData) return 0;
    
    const subjectMarks = this.markSheetData.markSheet
      .map((row: any) => row.subjects[subjectId]?.percentage || 0)
      .filter((p: number) => p > 0);
    
    if (subjectMarks.length === 0) return 0;
    return Math.round(
      subjectMarks.reduce((sum: number, p: number) => sum + p, 0) / subjectMarks.length
    );
  }
}

