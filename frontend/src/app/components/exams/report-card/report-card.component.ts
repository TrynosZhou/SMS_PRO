import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { TeacherService } from '../../../services/teacher.service';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-report-card',
  templateUrl: './report-card.component.html',
  styleUrls: ['./report-card.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('fadeInUp', [
      state('void', style({ opacity: 0, transform: 'translateY(20px)' })),
      transition(':enter', [
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class ReportCardComponent implements OnInit, OnDestroy {
  classes: any[] = [];
  allSubjects: any[] = [];
  subjects: any[] = [];
  selectedClass = '';
  selectedExamType = '';
  selectedTerm = '';
  selectedSubjectId = '';
  reportCards: any[] = [];
  filteredReportCards: any[] = [];
  classInfo: any = null;
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];
  loading = false;
  error = '';
  success = '';
  canEditRemarks = false;
  studentSearchQuery = '';
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Parent-specific fields
  isParent = false;
  parentStudentId: string | null = null;
  studentBalance: number | null = null;
  currencySymbol = 'KES';
  accessDenied = false;
  availableTerms: string[] = [];
  loadingTerms = false;
  parentStudentClassName = '';
  schoolLogo: string | null = null;
  /** School name from settings (banner fallback / labels) */
  schoolName = '';
  schoolAddress = '';
  schoolEmail = '';
  gradeThresholds: any = null;
  gradeLabels: any = null;

  /** Keys `${studentId}:class_teacher` | `${studentId}:headmaster` while AI remark is loading */
  private readonly aiReportRemarkBusy = new Set<string>();

  /** Short delay so typing feels “immediate” without flooding the API */
  private readonly REMARK_AUTOSAVE_MS = 320;
  private readonly remarkAutosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-student UI state after debounced remark save */
  remarkAutosaveStatus: Record<string, 'idle' | 'saving' | 'saved' | 'error'> = {};

  // Teacher data
  teacher: any = null;
  teacherSubjects: any[] = [];
  isAdmin = false;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private teacherService: TeacherService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private parentService: ParentService,
    private settingsService: SettingsService
  ) {
    this.canEditRemarks =
      this.authService.hasRole('teacher') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin');
    this.isParent = this.authService.hasRole('parent');
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  ngOnDestroy(): void {
    for (const t of this.remarkAutosaveTimers.values()) {
      clearTimeout(t);
    }
    this.remarkAutosaveTimers.clear();
  }

  ngOnInit() {
    this.loadSettings();
    this.loadTermOptions();
    
    // Check if parent is accessing via studentId query param
    this.route.queryParams.subscribe(params => {
      if (params['studentId'] && this.isParent) {
        this.parentStudentId = params['studentId'];
        this.checkStudentBalance();
      } else {
        // If user is a teacher, load teacher-specific data
        const user = this.authService.getCurrentUser();
        if (user && user.role === 'teacher' && !this.isAdmin && !this.isParent) {
          this.loadTeacherInfo();
        } else {
          // Admin/SuperAdmin can see all classes and subjects
          this.loadClasses();
          this.loadSubjects();
        }
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
        const classesList = response.classes || [];
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

  updateSubjectsForSelectedClass() {
    if (!this.selectedClass || this.isAdmin || this.isParent) {
      // If no class selected or admin/parent, show all subjects (or teacher's subjects if teacher)
      if (!this.isAdmin && !this.isParent && this.teacherSubjects.length > 0) {
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
      this.classService.getClassById(this.selectedClass).subscribe({
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

  loadTermOptions() {
    this.loadingTerms = true;
    const currentYear = new Date().getFullYear();
    this.availableTerms = []; // Reset terms
    const nextYear = currentYear + 1;

    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];

    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        const activeTerm = data?.activeTerm || data?.currentTerm;
        if (activeTerm) {
          if (!this.availableTerms.includes(activeTerm)) {
            this.availableTerms.unshift(activeTerm);
          }
          // Auto-select the active term
          this.selectedTerm = activeTerm;
        } else if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
      },
      error: (err: any) => {
        // Use default terms if active term fails to load
        if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        // Only log error if it's not a connection error (backend might not be running)
        if (err.status !== 0) {
          console.error('Error loading active term:', err);
        }
      }
    });
  }

  /** Normalize School Logo 1 / 2 from API (data URL, URL, or raw base64). */
  private normalizeSchoolLogo(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    const v = raw.trim();
    if (!v || v === 'null' || v === 'undefined') {
      return null;
    }
    if (v.startsWith('data:image')) {
      return v;
    }
    if (v.startsWith('http://') || v.startsWith('https://')) {
      return v;
    }
    if (v.length > 100) {
      return v.startsWith('data:') ? v : `data:image/png;base64,${v}`;
    }
    return v;
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (raw: any) => {
        const data = Array.isArray(raw) && raw.length > 0 ? raw[0] : raw;
        if (!data) {
          return;
        }
        this.currencySymbol = data.currencySymbol || 'KES';
        this.schoolName = (data.schoolName && String(data.schoolName).trim()) || '';
        this.schoolAddress = (data.schoolAddress && String(data.schoolAddress).trim()) || '';
        this.schoolEmail = (data.schoolEmail && String(data.schoolEmail).trim()) || '';
        // Logo 1 — full-width banner image (letterhead); Logo 2 is not used on report cards
        this.schoolLogo = this.normalizeSchoolLogo(data.schoolLogo);
        this.gradeThresholds = data.gradeThresholds || {
          excellent: 90,
          veryGood: 80,
          good: 60,
          satisfactory: 40,
          needsImprovement: 20,
          basic: 1
        };
        this.gradeLabels = data.gradeLabels || {
          excellent: 'OUTSTANDING',
          veryGood: 'VERY HIGH',
          good: 'HIGH',
          satisfactory: 'GOOD',
          needsImprovement: 'ASPIRING',
          basic: 'BASIC',
          fail: 'UNCLASSIFIED'
        };
      },
      error: (err: any) => {
        // Use default values if settings fail to load
        this.currencySymbol = 'KES';
        this.gradeThresholds = {
          excellent: 90,
          veryGood: 80,
          good: 60,
          satisfactory: 40,
          needsImprovement: 20,
          basic: 1
        };
        this.gradeLabels = {
          excellent: 'OUTSTANDING',
          veryGood: 'VERY HIGH',
          good: 'HIGH',
          satisfactory: 'GOOD',
          needsImprovement: 'ASPIRING',
          basic: 'BASIC',
          fail: 'UNCLASSIFIED'
        };
        // Only log error if it's not a connection error (backend might not be running)
        if (err.status !== 0) {
          console.error('Error loading settings:', err);
        }
      }
    });
  }

  checkStudentBalance() {
    if (!this.parentStudentId) return;

    this.loading = true;
    this.error = '';
    
    // Get parent's students to find balance
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        const student = (response.students || []).find((s: any) => s.id === this.parentStudentId);
        
        if (!student) {
          this.loading = false;
          this.error = 'Student not found or not linked to your account';
          this.accessDenied = true;
          return;
        }

        const termBalance = parseFloat(String(student.termBalance || 0));
        this.studentBalance = termBalance;

        // Check if term balance allows access (term balance must be zero)
        if (termBalance > 0) {
          this.loading = false;
          this.accessDenied = true;
          this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
          return;
        }

        // Balance is OK, load student's class and generate report card
        // Check both 'class' and 'classEntity' properties (backend may use either)
        const studentClass = student.class || student.classEntity;
        if (studentClass?.id) {
          this.selectedClass = studentClass.id;
          this.parentStudentClassName = studentClass.name || '';
          // Load available exam types and let parent select
          this.loadClasses();
        } else {
          this.error = 'Student class information not available';
          this.loading = false;
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to check student balance';
        this.accessDenied = true;
      }
    });
  }

  loadClasses() {
    this.loading = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.classes = data;
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        // Only show error message if it's not a connection error
        if (err.status === 0) {
          this.error = 'Unable to connect to server. Please ensure the backend server is running.';
        } else {
          this.error = err.error?.message || 'Failed to load classes';
          console.error('Error loading classes:', err);
        }
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

  generateReportCards() {
    if (!this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Please select class, term, and exam type';
      return;
    }

    // For parents, check balance again before generating
    if (this.isParent && this.parentStudentId) {
      if (this.studentBalance !== null && this.studentBalance > 0) {
        this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${this.studentBalance.toFixed(2)} to view the report card.`;
        this.accessDenied = true;
        return;
      }
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.reportCards = [];
    this.accessDenied = false;

    // Ensure subjectId is passed correctly (empty string should be treated as missing)
    const subjectIdParam = this.selectedSubjectId && this.selectedSubjectId.trim() !== '' 
      ? this.selectedSubjectId.trim() 
      : undefined;
    
    // Ensure all required parameters are strings
    const classIdParam = String(this.selectedClass).trim();
    const examTypeParam = String(this.selectedExamType).trim();
    const termParam = String(this.selectedTerm).trim();
    const studentIdParam = this.parentStudentId && this.parentStudentId.trim() !== ''
      ? this.parentStudentId.trim()
      : undefined;
    
    console.log('Calling getReportCard with:', {
      classId: classIdParam,
      examType: examTypeParam,
      term: termParam,
      studentId: studentIdParam,
      subjectId: subjectIdParam,
      isTeacher: !this.isAdmin && !this.isParent
    });
    
    this.examService.getReportCard(
      classIdParam,
      examTypeParam,
      termParam,
      studentIdParam,
      subjectIdParam
    ).subscribe({
      next: (data: any) => {
        let cards = data.reportCards || [];
        
        // For parents, filter to only their student
        if (this.isParent && this.parentStudentId) {
          cards = cards.filter((card: any) => card.student?.id === this.parentStudentId);
        }
        
        this.reportCards = cards.map((card: any) => {
          // Ensure remarks object exists
          if (!card.remarks) {
            card.remarks = {
              id: null,
              classTeacherRemarks: null,
              headmasterRemarks: null
            };
          }
          card.subjects = (card.subjects || []).map((subject: any) => this.normalizeSubjectEntry(subject));
          return card;
        });
        this.filteredReportCards = [...this.reportCards];
        this.classInfo = { 
          name: data.class, 
          examType: data.examType, 
          term: data.term || this.selectedTerm,
          isUpperForm: data.isUpperForm === true
        };
        this.success = `Generated ${this.reportCards.length} report card(s) for ${data.class} - ${this.selectedTerm}`;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error generating report cards:', err);
        console.error('Error status:', err.status);
        console.error('Error URL:', err.url);
        console.error('Error message:', err.message);
        console.error('Error error:', err.error);
        
        if (err.status === 0) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.status === 404) {
          this.error = err.error?.message || 'Report card endpoint not found. Please check the server configuration.';
        } else if (err.status === 400) {
          this.error = err.error?.message || 'Invalid request parameters. Please check your selections.';
        } else if (err.status === 403) {
          this.error = err.error?.message || 'Access denied';
          this.accessDenied = true;
        } else {
          this.error = err.error?.message || 'Failed to generate report cards';
        }
        this.loading = false;
      }
    });
  }

  downloadPDF(reportCard: any) {
    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Invalid report card data or missing class/term/exam type';
      return;
    }

    this.loading = true;
    this.error = '';
    console.log('Downloading PDF for:', {
      classId: this.selectedClass,
      examType: this.selectedExamType,
      term: this.selectedTerm,
      studentId: reportCard.student.id
    });

    // Use the new format: classId + examType + studentId
    this.examService.downloadAllReportCardsPDF(this.selectedClass, this.selectedExamType, this.selectedTerm, reportCard.student.id).subscribe({
      next: (blob: Blob) => {
        console.log('PDF blob received, size:', blob.size);
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          this.loading = false;
          return;
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Use student's full name for filename (sanitize for filesystem)
        const studentName = reportCard.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
        link.download = `${studentName}-${this.selectedExamType}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.loading = false;
        this.success = 'PDF downloaded successfully';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        console.error('PDF download error:', err);
        this.error = err.error?.message || err.message || 'Failed to download PDF';
        this.loading = false;
      }
    });
  }

  /** Called when class teacher or headmaster textarea changes (debounced auto-save). */
  onReportCardRemarksChange(reportCard: any): void {
    if (!reportCard?.student?.id) return;
    if (this.isParent || !this.isSelectionValid()) return;
    if (!this.canEditRemarks && !this.isAdmin) return;
    const sid = reportCard.student.id as string;
    if (this.remarkAutosaveStatus[sid] === 'saved') {
      this.remarkAutosaveStatus = { ...this.remarkAutosaveStatus, [sid]: 'idle' };
    }
    this.scheduleRemarksAutosave(reportCard);
  }

  getRemarkAutosaveState(studentId: string): 'idle' | 'saving' | 'saved' | 'error' {
    return this.remarkAutosaveStatus[studentId] || 'idle';
  }

  /**
   * Grade scale footer: same band logic as backend report-card `getGradeInfo`
   * (settings gradeThresholds + gradeLabels).
   */
  getGradeScaleFooterRows(): { range: string; label: string }[] {
    const t = this.gradeThresholds;
    const l = this.gradeLabels || {};
    if (!t) {
      return [];
    }

    const vg = this.clampPct(this.toPctThreshold(t.veryGood, 80));
    const g = this.clampPct(this.toPctThreshold(t.good, 60));
    const sat = this.clampPct(this.toPctThreshold(t.satisfactory, 40));
    const ni = this.clampPct(this.toPctThreshold(t.needsImprovement, 20));
    const basic = this.clampPct(this.toPctThreshold(t.basic, 1));

    const rows: { range: string; label: string }[] = [];

    const pushBand = (low: number, high: number, labelKey: string, fallback: string) => {
      if (low > high) return;
      const raw = (l as Record<string, string | undefined>)[labelKey];
      const label =
        raw !== undefined && raw !== null && String(raw).trim() !== ''
          ? String(raw).trim()
          : fallback;
      rows.push({
        range: low === high ? `${low}` : `${low} – ${high}`,
        label,
      });
    };

    pushBand(vg, 100, 'veryGood', 'VERY HIGH');
    if (g <= vg - 1) pushBand(g, vg - 1, 'good', 'HIGH');
    if (sat <= g - 1) pushBand(sat, g - 1, 'satisfactory', 'GOOD');
    if (ni <= sat - 1) pushBand(ni, sat - 1, 'needsImprovement', 'ASPIRING');
    if (basic <= ni - 1) pushBand(basic, ni - 1, 'basic', 'BASIC');

    const failLabel = l.fail || 'UNCLASSIFIED';
    if (basic <= 1) {
      rows.push({ range: '0', label: failLabel });
    } else {
      pushBand(0, basic - 1, 'fail', failLabel);
    }

    return rows;
  }

  private toPctThreshold(v: unknown, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  private clampPct(n: number): number {
    return Math.max(0, Math.min(100, n));
  }

  private clearRemarkAutosaveTimer(studentId: string): void {
    const t = this.remarkAutosaveTimers.get(studentId);
    if (t) {
      clearTimeout(t);
      this.remarkAutosaveTimers.delete(studentId);
    }
  }

  private scheduleRemarksAutosave(reportCard: any): void {
    const sid = reportCard?.student?.id as string | undefined;
    if (!sid || !this.selectedClass || !this.selectedExamType) return;
    if (this.isAIReportRemarkBusyForStudent(sid)) return;

    this.clearRemarkAutosaveTimer(sid);
    const timer = setTimeout(() => {
      this.remarkAutosaveTimers.delete(sid);
      this.persistReportCardRemarks(reportCard);
    }, this.REMARK_AUTOSAVE_MS);
    this.remarkAutosaveTimers.set(sid, timer);
  }

  private isAIReportRemarkBusyForStudent(studentId: string): boolean {
    return (
      this.aiReportRemarkBusy.has(`${studentId}:class_teacher`) ||
      this.aiReportRemarkBusy.has(`${studentId}:headmaster`)
    );
  }

  /**
   * Persists class teacher + headmaster remarks for one student (backend applies fields by role).
   */
  private persistReportCardRemarks(reportCard: any): void {
    const sid = reportCard?.student?.id as string;
    if (!sid || !this.selectedClass || !this.selectedExamType || !reportCard.student) return;
    if (this.isAIReportRemarkBusyForStudent(sid)) return;

    this.remarkAutosaveStatus = { ...this.remarkAutosaveStatus, [sid]: 'saving' };

    const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || '';
    const headmasterRemarks = reportCard.remarks?.headmasterRemarks || '';

    this.examService
      .saveReportCardRemarks(
        sid,
        this.selectedClass,
        this.selectedExamType,
        classTeacherRemarks,
        headmasterRemarks
      )
      .subscribe({
        next: (response: any) => {
          if (!reportCard.remarks) {
            reportCard.remarks = {};
          }
          reportCard.remarks.id = response.remarks.id;
          reportCard.remarks.classTeacherRemarks = response.remarks.classTeacherRemarks;
          reportCard.remarks.headmasterRemarks = response.remarks.headmasterRemarks;
          this.showRemarkSavedTick(sid);
        },
        error: (err: any) => {
          const msg = err.error?.message || 'Failed to save remarks';
          this.remarkAutosaveStatus = { ...this.remarkAutosaveStatus, [sid]: 'error' };
          if (err.status === 403) {
            this.error = msg;
            setTimeout(() => (this.error = ''), 10000);
          }
          setTimeout(() => {
            if (this.remarkAutosaveStatus[sid] === 'error') {
              const next = { ...this.remarkAutosaveStatus };
              next[sid] = 'idle';
              this.remarkAutosaveStatus = next;
            }
          }, 6000);
        },
      });
  }

  /** Solid green tick stays until the user edits the remarks again (see onReportCardRemarksChange). */
  private showRemarkSavedTick(studentId: string): void {
    this.remarkAutosaveStatus = { ...this.remarkAutosaveStatus, [studentId]: 'saved' };
  }

  // Search and filtering
  filterReportCards() {
    if (!this.studentSearchQuery.trim()) {
      this.filteredReportCards = [...this.reportCards];
      return;
    }
    const query = this.studentSearchQuery.toLowerCase().trim();
    this.filteredReportCards = this.reportCards.filter(card => {
      const studentName = (card.student?.name || '').toLowerCase();
      const studentNumber = (card.student?.studentNumber || '').toLowerCase();
      return studentName.includes(query) || studentNumber.includes(query);
    });
  }

  // Statistics
  getOverallAverage(): number {
    if (this.filteredReportCards.length === 0) return 0;
    const sum = this.filteredReportCards.reduce((acc, card) => acc + (card.overallAverage || 0), 0);
    return sum / this.filteredReportCards.length;
  }

  // Validation
  isSelectionValid(): boolean {
    return !!(this.selectedClass && this.selectedExamType && this.selectedTerm);
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  onSelectionChange() {
    this.fieldErrors = {};
    this.touchedFields.clear();
    
    // If class changed and user is a teacher, update subjects list
    if (!this.isAdmin && !this.isParent && this.selectedClass) {
      this.updateSubjectsForSelectedClass();
    }
    
    // Reset subject selection if class changed
    if (!this.selectedClass) {
      this.selectedSubjectId = '';
    }
  }

  resetSelection() {
    if (!this.isParent) {
      this.selectedClass = '';
    }
    this.selectedExamType = '';
    this.selectedTerm = this.availableTerms.length > 0 ? this.availableTerms[0] : '';
    this.reportCards = [];
    this.filteredReportCards = [];
    this.classInfo = null;
    this.studentSearchQuery = '';
    this.onSelectionChange();
  }

  // Download all PDFs
  downloadAllPDFs() {
    if (this.filteredReportCards.length === 0) {
      this.error = 'No report cards to download';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Download each PDF sequentially to avoid browser blocking
    let downloadCount = 0;
    const downloadNext = () => {
      if (downloadCount >= this.filteredReportCards.length) {
        this.loading = false;
        this.success = `Successfully downloaded ${downloadCount} PDF(s)`;
        setTimeout(() => this.success = '', 5000);
        return;
      }

      const reportCard = this.filteredReportCards[downloadCount];
      this.examService.downloadAllReportCardsPDF(this.selectedClass, this.selectedExamType, this.selectedTerm, reportCard.student.id).subscribe({
        next: (blob: Blob) => {
          if (blob.size > 0) {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const studentName = reportCard.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
            link.download = `${studentName}-${this.selectedExamType}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          }
          downloadCount++;
          // Wait a bit before downloading next to avoid browser blocking
          setTimeout(downloadNext, 500);
        },
        error: (err: any) => {
          console.error(`Error downloading PDF for ${reportCard.student.name}:`, err);
          downloadCount++;
          setTimeout(downloadNext, 500);
        }
      });
    };

    downloadNext();
  }

  private normalizeSubjectEntry(subject: any) {
    const normalized: any = { ...subject };
    const subjectName = subject?.subject || subject?.subjectName || subject?.name || subject?.title;
    normalized.subject = subjectName ? String(subjectName).trim() : 'N/A';
    normalized.subjectCode = subject?.subjectCode || subject?.code || subject?.subject_code || '-';
    normalized.score = this.toNumber(subject?.score);
    normalized.maxScore = this.toNumber(subject?.maxScore);
    normalized.classAverage = this.toNumber(subject?.classAverage);
    normalized.percentage = this.toNumber(subject?.percentage);
    normalized.points = subject?.points !== undefined && subject?.points !== null
      ? this.toNumber(subject.points)
      : undefined;
    return normalized;
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.round(parsed);
  }

  isAIReportRemarkBusy(studentId: string, kind: 'class_teacher' | 'headmaster'): boolean {
    return this.aiReportRemarkBusy.has(`${studentId}:${kind}`);
  }

  private buildReportRemarkContext(reportCard: any): Record<string, unknown> {
    const examLabel =
      this.examTypes.find((e) => e.value === this.selectedExamType)?.label || this.selectedExamType || '';
    return {
      studentName: reportCard?.student?.name,
      className: reportCard?.student?.class,
      term: this.selectedTerm,
      examTypeLabel: examLabel,
      overallAverage: reportCard?.overallAverage,
      overallGrade: reportCard?.overallGrade,
      classPosition:
        reportCard?.classPosition && reportCard?.totalStudents
          ? `${reportCard.classPosition} / ${reportCard.totalStudents}`
          : reportCard?.classPosition,
      formPosition:
        reportCard?.formPosition && reportCard?.totalStudentsPerStream
          ? `${reportCard.formPosition} / ${reportCard.totalStudentsPerStream}`
          : reportCard?.formPosition,
      subjects: (reportCard?.subjects || []).map((s: any) => ({
        subject: s.subject,
        grade: s.grade,
        percentage: s.percentage,
      })),
    };
  }

  generateAIReportRemark(reportCard: any, kind: 'class_teacher' | 'headmaster'): void {
    if (!reportCard?.student?.id) return;
    const sid = reportCard.student.id as string;
    const key = `${sid}:${kind}`;
    if (this.aiReportRemarkBusy.has(key)) return;

    if (kind === 'headmaster' && !this.isAdmin) return;
    if (kind === 'class_teacher' && !this.canEditRemarks) return;

    this.aiReportRemarkBusy.add(key);
    this.error = '';
    const context = this.buildReportRemarkContext(reportCard);

    this.examService
      .generateAIReportRemark(sid, kind, context, this.selectedClass || undefined, this.selectedExamType || undefined)
      .subscribe({
        next: (res) => {
          const text = (res?.remark || '').trim().slice(0, 500);
          if (!reportCard.remarks) {
            reportCard.remarks = { id: null, classTeacherRemarks: null, headmasterRemarks: null };
          }
          if (kind === 'class_teacher') {
            reportCard.remarks = { ...reportCard.remarks, classTeacherRemarks: text || null };
          } else {
            reportCard.remarks = { ...reportCard.remarks, headmasterRemarks: text || null };
          }
          this.aiReportRemarkBusy.delete(key);
          this.clearRemarkAutosaveTimer(sid);
          this.persistReportCardRemarks(reportCard);
        },
        error: (err: any) => {
          this.aiReportRemarkBusy.delete(key);
          const body = err.error;
          let msg = 'Failed to generate AI remark';
          if (err.status === 429 || body?.code === 'insufficient_quota') {
            msg =
              'AI is unavailable: OpenAI quota or billing. Add credits at platform.openai.com, then retry.';
          } else if (body?.message) {
            msg = body.message;
          } else if (typeof err.error === 'string') {
            msg = err.error;
          }
          this.error = msg;
          setTimeout(() => (this.error = ''), 10000);
        },
      });
  }
}

