import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { isInExamsManageShell } from '../exams-manage-navigation';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-exam-list',
  templateUrl: './exam-list.component.html',
  styleUrls: ['./exam-list.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class ExamListComponent implements OnInit, OnDestroy {
  // Selection form
  selectedClassId = '';
  selectedTerm = '';
  selectedExamType = '';
  selectedSubjectId = '';
  
  // Data
  classes: any[] = [];
  allSubjects: any[] = []; // All subjects in the system
  subjects: any[] = []; // Filtered subjects for selected class
  students: any[] = [];
  filteredStudents: any[] = [];
  
  // Teacher data
  teacher: any = null;
  teacherSubjects: any[] = []; // Subjects assigned to teacher
  
  // Marks entry
  marks: any = {};
  currentExam: any = null;
  
  /** Quick list filter above the marks table (desktop admin workflow). */
  marksViewFilter: 'all' | 'entered' | 'missing' = 'all';

  // UI state
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  showMarksEntry = false;
  studentSearchQuery = '';
  
  // Auto-save state
  lastSavedStudentId: string | null = null;
  autoSaveTimeout: any = null;
  isAutoSaving = false;
  pendingSaves: Set<string> = new Set();

  // Auto-load state (when selections change)
  private selectionChangeSeq = 0;
  // Separate saving states so we can show two distinct ticks:
  // 1) mark (score) saved
  // 2) comment (remark) saved
  markSavingStatus: Map<string, 'saving' | 'saved' | 'error' | null> = new Map();
  commentsSavingStatus: Map<string, 'saving' | 'saved' | 'error' | null> = new Map();
  
  // AI remark generation state
  generatingRemarks: Map<string, boolean> = new Map(); // Track AI remark generation per student
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  loadingTerm = false;
  
  // Terms and exam types
  terms: any[] = [];
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  // Admin and publish status
  isAdmin = false;
  isPublished = false;
  canPublish = false;
  checkingCompleteness = false;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private teacherService: TeacherService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
    console.log('ExamListComponent - User role check:', { user, isAdmin: this.isAdmin });
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
    this.loadTerms();
    
    // Save pending marks when page is about to unload
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  ngOnDestroy() {
    // Clean up auto-save timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Save any pending marks before component is destroyed
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }
    
    // Remove event listener
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  handleBeforeUnload(event: BeforeUnloadEvent) {
    // Save any pending marks before page unloads
    if (this.pendingSaves.size > 0) {
      // Use synchronous save if possible, or at least try to save
      this.processPendingSaves();
    }
  }

  loadTerms() {
    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const raw: any[] = Array.isArray(data) ? data : (data?.terms || []);
        // Build a label matching the settings activeTerm format: "Term 1 2026"
        this.terms = raw.map(t => ({
          ...t,
          label: `Term ${t.termNumber} ${t.year}`,
        }));
        // Auto-select the active term if not yet set
        if (!this.selectedTerm && this.terms.length > 0) {
          const active = this.terms.find((t: any) => t.status === 'active');
          if (active) this.selectedTerm = active.label;
        }
      },
      error: () => { this.terms = []; }
    });
  }

  loadActiveTerm() {
    this.loadingTerm = true;
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        const active = data.activeTerm || data.currentTerm || '';
        if (active) this.selectedTerm = active;
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.loadingTerm = false;
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

  loadClasses() {
    // For admin/superadmin - load all classes
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
        const qpClass = this.route.snapshot.queryParamMap.get('classId');
        if (qpClass && this.classes.some((c: any) => c.id === qpClass)) {
          this.selectedClassId = qpClass;
          this.onSelectionChange();
        }
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.classes = [];
      }
    });
  }

  loadAllSubjects() {
    // Load all subjects (we'll filter based on teacher and class)
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        // Update subjects list when class is selected
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
            this.onSelectionChange();
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

  onSelectionChange() {
    // Selection changes can happen multiple times in quick succession (especially for teachers).
    // Use a sequence guard so only the latest selection set triggers loading.
    this.selectionChangeSeq++;
    const seq = this.selectionChangeSeq;

    // Reset marks entry when selections change
    this.showMarksEntry = false;
    this.students = [];
    this.filteredStudents = [];
    this.marksViewFilter = 'all';
    this.marks = {};
    this.currentExam = null;
    this.studentSearchQuery = '';
    this.canPublish = false;
    this.isPublished = false;
    
    // If class changed and user is a teacher, update subjects list
    if (!this.isAdmin && this.selectedClassId) {
      this.updateSubjectsForSelectedClass();
    }
    
    // Reset subject selection if class changed
    if (!this.selectedClassId) {
      this.selectedSubjectId = '';
    }

    // Auto-load students once Class + Exam Type + Subject are all selected (term comes from settings)
    if (!this.selectedClassId || this.isPublished) {
      return;
    }

    setTimeout(() => {
      // Ignore stale callbacks
      if (this.selectionChangeSeq !== seq) return;

      if (this.isSelectionValid() && !this.loadingStudents) {
        this.loadStudents();
      }
    }, 350);
  }

  manualLoadStudents() {
    if (this.showMarksEntry || this.loadingStudents) return;
    this.loadStudents();
  }

  loadStudents() {
    if (!this.selectedClassId || !this.selectedTerm || !this.selectedExamType || !this.selectedSubjectId) {
      this.error = 'Please select Class, Term, Exam Type, and Subject';
      return;
    }

    this.loadingStudents = true;
    this.error = '';
    this.success = '';

    // First, find or create exam
    this.findOrCreateExam().then((exam: any) => {
      if (!exam) {
        this.error = 'Failed to create or find exam';
        this.loadingStudents = false;
        return;
      }
      
      // Ensure exam has an ID
      if (!exam.id) {
        console.error('Exam missing ID:', exam);
        this.error = 'Exam ID is missing. Please try again.';
        this.loadingStudents = false;
        return;
      }
      
      console.log('Setting currentExam:', exam);
      console.log('Current exam ID:', exam.id);
      this.currentExam = exam;
      this.isPublished = exam.status === 'published';
      
      // Check completeness after exam is loaded
      setTimeout(() => this.checkCompleteness(), 500);
      
      // Load students for the selected class, sorted by LastName
      this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
        next: (data: any) => {
          console.log('Received students from API:', data);
          console.log('Number of students received:', data?.length || 0);
          
          // Ensure data is an array
          const studentsArray = Array.isArray(data) ? data : [];
          
          // Sort by LastName ascending, then FirstName
          this.students = studentsArray.sort((a: any, b: any) => {
            const lastNameA = (a.lastName || '').toLowerCase();
            const lastNameB = (b.lastName || '').toLowerCase();
            if (lastNameA !== lastNameB) {
              return lastNameA.localeCompare(lastNameB);
            }
            const firstNameA = (a.firstName || '').toLowerCase();
            const firstNameB = (b.firstName || '').toLowerCase();
            return firstNameA.localeCompare(firstNameB);
          });
          
          console.log('Sorted students count:', this.students.length);
          if (this.students.length > 0) {
            console.log('First student:', this.students[0].firstName, this.students[0].lastName);
            console.log('Last student:', this.students[this.students.length - 1].firstName, this.students[this.students.length - 1].lastName);
          }
          
          this.initializeMarks();
          this.loadExistingMarks();
          this.filteredStudents = [...this.students];
          this.showMarksEntry = true;
          this.loadingStudents = false;
        },
        error: (err: any) => {
          console.error('Error loading students:', err);
          this.error = err.error?.message || 'Failed to load students';
          this.loadingStudents = false;
        }
      });
    }).catch((err: any) => {
      console.error('Error finding/creating exam:', err);
      this.error = err.error?.message || 'Failed to initialize exam';
      this.loadingStudents = false;
    });
  }

  findOrCreateExam(): Promise<any> {
    return new Promise((resolve, reject) => {
      // Try to find existing exam with matching criteria
      const examName = `${this.selectedTerm} - ${this.examTypes.find(t => t.value === this.selectedExamType)?.label} - ${this.classes.find(c => c.id === this.selectedClassId)?.name}`;
      
      // For now, create a new exam or find existing one
      // We'll need a backend endpoint for this, but for now let's use the existing exam creation
      const examData = {
        name: examName,
        type: this.selectedExamType,
        term: this.selectedTerm,
        examDate: new Date().toISOString().split('T')[0],
        classId: this.selectedClassId,
        subjectIds: [this.selectedSubjectId]
      };

      // Check if exam exists first by getting exams for this class
      this.examService.getExams(this.selectedClassId).subscribe({
        next: (exams: any) => {
          // Find exam with matching term, type, and subject
          const existingExam = exams.find((e: any) => 
            e.term === this.selectedTerm &&
            e.type === this.selectedExamType &&
            e.classId === this.selectedClassId &&
            e.subjects?.some((s: any) => s.id === this.selectedSubjectId)
          );

          if (existingExam) {
            console.log('Found existing exam:', existingExam);
            resolve(existingExam);
          } else {
            // Create new exam
            console.log('Creating new exam with data:', examData);
            this.examService.createExam(examData).subscribe({
              next: (response: any) => {
                // Backend returns { message: '...', exam: {...} }
                const exam = response.exam || response;
                console.log('Exam created, response:', response);
                console.log('Extracted exam:', exam);
                console.log('Exam ID:', exam.id);
                if (!exam.id) {
                  console.error('Created exam missing ID:', exam);
                  reject(new Error('Created exam is missing ID'));
                } else {
                  resolve(exam);
                }
              },
              error: (err: any) => {
                console.error('Error creating exam:', err);
                reject(err);
              }
            });
          }
        },
        error: (err: any) => reject(err)
      });
    });
  }

  initializeMarks() {
    this.marks = {};
    this.students.forEach((student: any) => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      this.marks[key] = {
        score: null,
        maxScore: 100, // Default max score of 100
        comments: ''
      };
    });
  }

  loadExistingMarks() {
    if (!this.currentExam || !this.selectedSubjectId) return;

    this.examService.getMarks(this.currentExam.id).subscribe({
      next: (marksData: any) => {
        // Filter marks for the selected subject
        const subjectMarks = marksData.filter((m: any) => m.subjectId === this.selectedSubjectId);
        
        subjectMarks.forEach((mark: any) => {
          const key = this.getMarkKey(mark.studentId, this.selectedSubjectId);
          if (this.marks[key]) {
            this.marks[key].score = mark.score;
            this.marks[key].maxScore = mark.maxScore;
            
            // Don't overwrite AI-generated remarks that haven't been saved yet
            // Only update comments if:
            // 1. There's no existing comments, OR
            // 2. The existing comments are not AI-generated, OR
            // 3. The backend has comments (meaning they were saved)
            const existingMark = this.marks[key];
            const hasAIGenerated = (existingMark as any)?.aiGenerated === true;
            const hasExistingComments = existingMark.comments && existingMark.comments.trim() !== '';
            
            if (!hasAIGenerated || !hasExistingComments || (mark.comments && mark.comments.trim() !== '')) {
              this.marks[key].comments = mark.comments || '';
              // Clear AI-generated flag if we're loading from backend (means it was saved)
              if (mark.comments && mark.comments.trim() !== '') {
                (this.marks[key] as any).aiGenerated = false;
              }
            }
          }
        });
      },
      error: (err: any) => {
        console.error('Error loading existing marks:', err);
      }
    });
  }

  getMarkKey(studentId: string, subjectId: string): string {
    return `${studentId}_${subjectId}`;
  }

  getSelectedClassName(): string {
    const cls = this.classes.find(c => c.id == this.selectedClassId);
    return cls ? cls.name : '';
  }

  getSelectedSubjectName(): string {
    const subject = this.subjects.find(s => s.id == this.selectedSubjectId);
    return subject ? subject.name : '';
  }

  getSelectedExamTypeLabel(): string {
    const examType = this.examTypes.find(t => t.value == this.selectedExamType);
    return examType ? examType.label : '';
  }

  getSelectionSummary(): string {
    const className = this.getSelectedClassName();
    const examTypeLabel = this.getSelectedExamTypeLabel();
    const subjectName = this.getSelectedSubjectName();
    return `${className} | ${this.selectedTerm} | ${examTypeLabel} | ${subjectName}`;
  }

  /** Rows shown in the table: search filter, then marks status chip. */
  get displayStudents(): any[] {
    const base = this.filteredStudents;
    if (this.marksViewFilter === 'entered') {
      return base.filter((s) => this.hasMarks(s.id));
    }
    if (this.marksViewFilter === 'missing') {
      return base.filter((s) => !this.hasMarks(s.id));
    }
    return base;
  }

  get missingMarksCount(): number {
    return this.filteredStudents.filter((s) => !this.hasMarks(s.id)).length;
  }

  setMarksViewFilter(mode: 'all' | 'entered' | 'missing'): void {
    this.marksViewFilter = mode;
  }

  trackByStudentId(_index: number, student: any): string {
    return student?.id ?? String(_index);
  }

  /**
   * Focus the next student in the search list with no score, starting after the focused mark field (wraps).
   * Helps rapid desktop entry without scrolling.
   */
  focusNextEmptyScore(): void {
    const list = this.filteredStudents;
    let start = 0;
    const active = document.activeElement as HTMLInputElement | null;
    if (active?.id?.startsWith('mc-score-')) {
      const sid = active.id.slice('mc-score-'.length);
      const idx = list.findIndex((s) => s.id === sid);
      if (idx >= 0) {
        start = idx + 1;
      }
    }
    const ordered = [...list.slice(start), ...list.slice(0, start)];
    const next = ordered.find((s) => !this.hasMarks(s.id));
    if (!next) {
      return;
    }
    setTimeout(() => {
      const el = document.getElementById(`mc-score-${next.id}`) as HTMLInputElement | null;
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  cancelMarksEntry() {
    // Save any pending marks before canceling
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }
    
    this.showMarksEntry = false;
    this.students = [];
    this.filteredStudents = [];
    this.marksViewFilter = 'all';
    this.marks = {};
    this.studentSearchQuery = '';
    this.lastSavedStudentId = null;
    this.pendingSaves.clear();
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
  }

  // Validation methods
  isSelectionValid(): boolean {
    return !!(this.selectedClassId && this.selectedTerm && this.selectedExamType && this.selectedSubjectId);
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  resetSelection() {
    this.selectedClassId = '';
    // Don't reset term - it should remain from settings
    // this.selectedTerm = '';
    this.selectedExamType = '';
    this.selectedSubjectId = '';
    this.onSelectionChange();
    this.fieldErrors = {};
    this.touchedFields.clear();
  }

  // Student filtering
  filterStudents() {
    if (!this.studentSearchQuery.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }
    const query = this.studentSearchQuery.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      return fullName.includes(query) || studentNumber.includes(query);
    });
  }

  // Marks statistics
  hasMarks(studentId: string): boolean {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    return mark && (mark.score !== null && mark.score !== undefined && mark.score !== '');
  }

  hasRemark(studentId: string): boolean {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    return !!(mark && mark.comments && mark.comments.trim() !== '');
  }

  getEnteredMarksCount(): number {
    return this.filteredStudents.filter(student => this.hasMarks(student.id)).length;
  }

  getEnteredRemarksCount(): number {
    return this.filteredStudents.filter(student => this.hasRemark(student.id)).length;
  }

  getMarksProgress(): number {
    if (this.filteredStudents.length === 0) return 0;
    return Math.round((this.getEnteredMarksCount() / this.filteredStudents.length) * 100);
  }

  getAverageScore(): number {
    const marksWithScores = this.filteredStudents
      .map(student => {
        const key = this.getMarkKey(student.id, this.selectedSubjectId);
        const mark = this.marks[key];
        return mark && mark.score !== null && mark.score !== undefined && mark.score !== '' 
          ? Math.round(parseFloat(mark.score)) 
          : null;
      })
      .filter(score => score !== null) as number[];

    if (marksWithScores.length === 0) return 0;
    const sum = marksWithScores.reduce((acc, score) => acc + score, 0);
    return Math.round(sum / marksWithScores.length);
  }

  openPublishResults() {
    if (!this.selectedExamType || !this.selectedTerm) return;
    const qp = { examType: this.selectedExamType, term: this.selectedTerm };
    if (isInExamsManageShell(this.router)) {
      this.router.navigate(['/exams', 'manage', 'publish-results'], { queryParams: qp });
    } else {
      this.router.navigate(['/publish-results'], { queryParams: qp });
    }
  }

  openMarkInputProgress() {
    this.router.navigate(['/marks-progress']);
  }

  // Quick actions
  clearAllMarks() {
    if (!confirm('Are you sure you want to clear all entered marks? This action cannot be undone.')) {
      return;
    }
    this.filteredStudents.forEach(student => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      if (this.marks[key]) {
        this.marks[key].score = null;
        this.marks[key].comments = '';
      }
    });
  }

  fillRemainingWithZero() {
    this.filteredStudents.forEach(student => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      if (this.marks[key] && (this.marks[key].score === null || this.marks[key].score === undefined || this.marks[key].score === '')) {
        this.marks[key].score = 0;
      }
    });
  }

  validateMark(studentId: string) {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    if (mark && mark.score !== null && mark.score !== undefined && mark.score !== '') {
      const score = parseFloat(mark.score);
      if (isNaN(score) || score < 0) {
        mark.score = null;
      } else {
        // Round to integer
        const roundedScore = Math.round(score);
        if (roundedScore > 100) {
          if (confirm(`Score ${roundedScore} exceeds 100. Do you want to keep it?`)) {
            mark.score = roundedScore;
          } else {
            mark.score = 100;
          }
        } else {
          mark.score = roundedScore;
        }
      }
    }
  }

  onMarkChange(studentId: string) {
    // Mark as pending save
    this.markSavingStatus.set(studentId, 'saving');
    // Round to integer when user types
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    if (mark && mark.score !== null && mark.score !== undefined && mark.score !== '') {
      const score = parseFloat(mark.score);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        const roundedScore = Math.round(score);
        mark.score = roundedScore;
        
        // Auto-generate AI remark if comments field is empty
        // Use a small delay to avoid generating while user is still typing
        const existingTimeout = (mark as any).aiRemarkTimeout;
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        if (!mark.comments || mark.comments.trim() === '') {
          // Wait 1 second after user stops typing before generating remark
          (mark as any).aiRemarkTimeout = setTimeout(() => {
            this.generateAIRemark(studentId, roundedScore);
            (mark as any).aiRemarkTimeout = null;
          }, 1000);
        }
      }
    }
    // Schedule auto-save for this student
    this.scheduleAutoSave(studentId);
  }

  onCommentsChange(studentId: string) {
    // Mark as pending save
    this.commentsSavingStatus.set(studentId, 'saving');
    // Schedule auto-save when comments change
    this.scheduleAutoSave(studentId);
  }

  onStudentFocus(studentId: string) {
    // Auto-save previous student when moving to a new one
    if (this.lastSavedStudentId && this.lastSavedStudentId !== studentId) {
      this.autoSaveStudent(this.lastSavedStudentId);
    }
    this.lastSavedStudentId = studentId;
  }

  onStudentBlur(studentId: string) {
    // Auto-save when leaving a student's row
    this.autoSaveStudent(studentId);
  }

  scheduleAutoSave(studentId: string) {
    // Add to pending saves
    this.pendingSaves.add(studentId);
    
    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Schedule auto-save after 2 seconds of inactivity
    this.autoSaveTimeout = setTimeout(() => {
      this.processPendingSaves();
    }, 2000);
  }

  processPendingSaves() {
    if (this.pendingSaves.size === 0 || this.isAutoSaving || !this.currentExam) {
      return;
    }

    // Save all pending students
    const studentsToSave = Array.from(this.pendingSaves);
    this.pendingSaves.clear();
    
    // Save marks for all pending students
    this.autoSaveStudents(studentsToSave);
  }

  autoSaveStudent(studentId: string) {
    if (!this.currentExam || !this.currentExam.id) {
      return;
    }

    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    
    // Only save if there's data to save (score or comments)
    if (!mark || (mark.score === null && (!mark.comments || mark.comments.trim() === ''))) {
      this.markSavingStatus.set(studentId, null);
      this.commentsSavingStatus.set(studentId, null);
      return;
    }

    // Mark as saving (field-specific)
    if (mark.score !== null && mark.score !== undefined) {
      this.markSavingStatus.set(studentId, 'saving');
    }
    if (mark.comments && mark.comments.trim() !== '') {
      this.commentsSavingStatus.set(studentId, 'saving');
    }

    const marksData = [{
      studentId: studentId,
      subjectId: this.selectedSubjectId,
      score: mark.score !== null && mark.score !== undefined ? Math.round(parseFloat(String(mark.score))) : null,
      maxScore: 100,
      comments: mark.comments || ''
    }];
    
    console.log('Auto-saving mark with AI-generated comment:', {
      studentId,
      score: marksData[0].score,
      comments: marksData[0].comments,
      hasComments: !!(mark.comments && mark.comments.trim() !== '')
    });

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        console.log('Mark saved successfully:', {
          studentId,
          savedCount: data.savedCount,
          comments: marksData[0].comments
        });
        // Clear AI-generated flag after successful save
        if ((mark as any).aiGenerated) {
          (mark as any).aiGenerated = false;
          console.log('AI-generated flag cleared after successful save');
        }
        // Mark as saved (field-specific)
        if (marksData[0].score !== null) {
          this.markSavingStatus.set(studentId, 'saved');
        } else {
          this.markSavingStatus.set(studentId, null);
        }

        if (marksData[0].comments && marksData[0].comments.trim() !== '') {
          this.commentsSavingStatus.set(studentId, 'saved');
        } else {
          this.commentsSavingStatus.set(studentId, null);
        }

        // Clear saved status after a short delay
        setTimeout(() => {
          if (this.markSavingStatus.get(studentId) === 'saved') {
            this.markSavingStatus.set(studentId, null);
          }
          if (this.commentsSavingStatus.get(studentId) === 'saved') {
            this.commentsSavingStatus.set(studentId, null);
          }
        }, 6000);
      },
      error: (err: any) => {
        // Mark as error (field-specific)
        if (marksData[0].score !== null) {
          this.markSavingStatus.set(studentId, 'error');
        }
        if (marksData[0].comments && marksData[0].comments.trim() !== '') {
          this.commentsSavingStatus.set(studentId, 'error');
        }
        console.error('Auto-save failed:', err);
        // Clear error status after 3 seconds
        setTimeout(() => {
          if (this.markSavingStatus.get(studentId) === 'error') {
            this.markSavingStatus.set(studentId, null);
          }
          if (this.commentsSavingStatus.get(studentId) === 'error') {
            this.commentsSavingStatus.set(studentId, null);
          }
        }, 3000);
      }
    });
  }

  autoSaveStudents(studentIds: string[]) {
    if (!this.currentExam || !this.currentExam.id || studentIds.length === 0) {
      return;
    }

    const marksData = studentIds.map(studentId => {
      const key = this.getMarkKey(studentId, this.selectedSubjectId);
      const mark = this.marks[key];
      
      if (mark && (mark.score !== null || mark.comments)) {
        return {
          studentId: studentId,
          subjectId: this.selectedSubjectId,
          score: mark.score ? Math.round(parseFloat(mark.score)) : null,
          maxScore: 100,
          comments: mark.comments || ''
        };
      }
      return null;
    }).filter((m: any) => m !== null);

    if (marksData.length === 0) {
      studentIds.forEach(id => {
        this.markSavingStatus.set(id, null);
        this.commentsSavingStatus.set(id, null);
      });
      return;
    }

    // Create quick lookup for the payload per student
    const marksDataById = new Map<string, any>(marksData.map((m: any) => [m.studentId, m]));

    // Mark students as saving (field-specific)
    studentIds.forEach(id => {
      const md = marksDataById.get(id);
      if (!md) return;
      if (md.score !== null) this.markSavingStatus.set(id, 'saving');
      if (md.comments && md.comments.trim() !== '') this.commentsSavingStatus.set(id, 'saving');
    });

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        // Mark each student as saved (field-specific)
        studentIds.forEach(id => {
          const md = marksDataById.get(id);
          if (!md) {
            this.markSavingStatus.set(id, null);
            this.commentsSavingStatus.set(id, null);
            return;
          }

          if (md.score !== null) this.markSavingStatus.set(id, 'saved');
          else this.markSavingStatus.set(id, null);

          if (md.comments && md.comments.trim() !== '') this.commentsSavingStatus.set(id, 'saved');
          else this.commentsSavingStatus.set(id, null);

          // Clear saved status after a short delay (long enough for comment tick to appear)
          setTimeout(() => {
            if (this.markSavingStatus.get(id) === 'saved') this.markSavingStatus.set(id, null);
            if (this.commentsSavingStatus.get(id) === 'saved') this.commentsSavingStatus.set(id, null);
          }, 6000);
        });
      },
      error: (err: any) => {
        // Mark each student as error (field-specific)
        studentIds.forEach(id => {
          const md = marksDataById.get(id);
          const hasScore = md && md.score !== null;
          const hasComments = md && md.comments && md.comments.trim() !== '';

          if (hasScore) this.markSavingStatus.set(id, 'error');
          if (hasComments) this.commentsSavingStatus.set(id, 'error');

          setTimeout(() => {
            if (this.markSavingStatus.get(id) === 'error') this.markSavingStatus.set(id, null);
            if (this.commentsSavingStatus.get(id) === 'error') this.commentsSavingStatus.set(id, null);
          }, 3000);
        });
        console.error('Auto-save failed:', err);
      }
    });
  }

  getMarkSavingStatus(studentId: string): 'saving' | 'saved' | 'error' | null {
    return this.markSavingStatus.get(studentId) || null;
  }

  getCommentsSavingStatus(studentId: string): 'saving' | 'saved' | 'error' | null {
    return this.commentsSavingStatus.get(studentId) || null;
  }

  isGeneratingRemark(studentId: string): boolean {
    return this.generatingRemarks.get(studentId) || false;
  }

  generateAIRemark(studentId: string, score: number) {
    if (!this.selectedSubjectId || !this.currentExam || this.isPublished) {
      console.log('AI Remark generation skipped:', { 
        selectedSubjectId: this.selectedSubjectId, 
        currentExam: !!this.currentExam, 
        isPublished: this.isPublished 
      });
      return;
    }

    // Check if already generating for this student
    if (this.generatingRemarks.get(studentId)) {
      console.log('AI Remark already generating for student:', studentId);
      return;
    }

    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    
    // Check if comments field already has content
    if (mark && mark.comments && mark.comments.trim() !== '') {
      console.log('AI Remark skipped - comments already exist for student:', studentId);
      return;
    }

    console.log('Generating AI remark for student:', studentId, 'score:', score, 'subject:', this.selectedSubjectId);

    // Set generating state
    this.generatingRemarks.set(studentId, true);

    // Generate AI remark
    this.examService.generateAIRemark(studentId, this.selectedSubjectId, score, 100).subscribe({
      next: (response: any) => {
        console.log('AI Remark generated successfully:', response);
        const key = this.getMarkKey(studentId, this.selectedSubjectId);
        const mark = this.marks[key];
        
        if (mark && response.remark) {
          // Only set remark if comments field is still empty (user hasn't manually entered one)
          if (!mark.comments || mark.comments.trim() === '') {
            mark.comments = response.remark;
            console.log('AI Remark set in comments field:', response.remark);
            
            // Mark this as an AI-generated remark to prevent loadExistingMarks from overwriting it
            (mark as any).aiGenerated = true;
            (mark as any).aiGeneratedAt = new Date().getTime();
            
            // Immediately save the generated remark (don't wait for auto-save)
            this.autoSaveStudent(studentId);
          } else {
            console.log('AI Remark not set - comments field was filled while generating');
          }
        } else {
          console.warn('AI Remark response missing or invalid:', response);
        }
        
        this.generatingRemarks.set(studentId, false);
      },
      error: (err: any) => {
        const body = err.error;
        console.error('Error generating AI remark:', err.status, err.statusText);
        console.error('API response body (JSON):', typeof body === 'object' && body !== null ? JSON.stringify(body, null, 2) : body);
        
        // Show detailed error message to user
        let errorMessage = 'Failed to generate AI remark';
        if (err.error) {
          if (err.error.message) {
            errorMessage = err.error.message;
          } else if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else {
            errorMessage = JSON.stringify(err.error);
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        // Show error message to user
        if (err.status === 429 || err.error?.code === 'insufficient_quota') {
          this.error =
            'AI remarks are paused: your OpenAI account has no quota or billing. Add payment method or credits at platform.openai.com (organization billing), then retry.';
          setTimeout(() => (this.error = ''), 12000);
        } else if (err.status === 500) {
          if (errorMessage.includes('OpenAI API key')) {
            this.error = 'AI remark generation is not configured. Please contact the administrator to set up OpenAI API key.';
          } else {
            this.error = `AI remark generation failed: ${errorMessage}`;
          }
          setTimeout(() => this.error = '', 8000);
        } else if (err.status !== 0) {
          // Only show error if it's not a network error (status 0 usually means server is down)
          this.error = `Failed to generate AI remark: ${errorMessage}`;
          setTimeout(() => this.error = '', 5000);
        }
        
        this.generatingRemarks.set(studentId, false);
      }
    });
  }

  cancelMarkAndRemark(studentId: string) {
    if (this.isPublished || !this.currentExam || !this.currentExam.id) {
      return;
    }

    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];

    // Only proceed if there's something to cancel
    if (!mark || (mark.score === null && (!mark.comments || mark.comments.trim() === ''))) {
      return;
    }

    // Clear local data immediately
    if (mark) {
      mark.score = null;
      mark.comments = '';
    }

    // Clear from backend
    const marksData = [{
      studentId: studentId,
      subjectId: this.selectedSubjectId,
      score: null,
      maxScore: 100,
      comments: ''
    }];

    // Mark as saving (field-specific)
    this.markSavingStatus.set(studentId, 'saving');
    this.commentsSavingStatus.set(studentId, 'saving');

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        // Mark and remarks are cleared; hide ticks
        this.markSavingStatus.set(studentId, null);
        this.commentsSavingStatus.set(studentId, null);
      },
      error: (err: any) => {
        // Revert local changes on error
        if (mark) {
          // Restore from backend if available
          this.loadExistingMarks();
        }
        this.markSavingStatus.set(studentId, 'error');
        this.commentsSavingStatus.set(studentId, 'error');
        this.error = err.error?.message || 'Failed to cancel mark and remark';
        setTimeout(() => {
          this.error = '';
          if (this.markSavingStatus.get(studentId) === 'error') this.markSavingStatus.set(studentId, null);
          if (this.commentsSavingStatus.get(studentId) === 'error') this.commentsSavingStatus.set(studentId, null);
        }, 3000);
        console.error('Cancel failed:', err);
      }
    });
  }

  showAutoSaveSuccess(message: string) {
    this.success = message;
    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (this.success === message) {
        this.success = '';
      }
    }, 3000);
  }

  deleteAllExams() {
    if (!confirm('Are you sure you want to delete ALL scheduled exams? This will also delete all marks associated with these exams. This action cannot be undone.')) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.examService.deleteAllExams().subscribe({
      next: (data: any) => {
        this.success = data.message || `Successfully deleted ${data.deletedCount || 0} exam(s)`;
        this.loading = false;
        // Reset the form
        this.showMarksEntry = false;
        this.students = [];
        this.marks = {};
        this.currentExam = null;
      },
      error: (err: any) => {
        console.error('Error deleting all exams:', err);
        console.error('Error response:', err.error);
        
        let errorMessage = 'Failed to delete all exams';
        
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;
      }
    });
  }

  onSubmit() {
    if (!this.currentExam) {
      this.error = 'No exam selected';
      return;
    }

    if (!this.currentExam.id) {
      this.error = 'Exam ID is missing. Please try loading students again.';
      return;
    }

    // Process any pending auto-saves first
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Prepare marks data for the selected subject only
    const marksData = this.filteredStudents.map((student: any) => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      const mark = this.marks[key];
      
      if (mark && (mark.score !== null || mark.comments)) {
        return {
          studentId: student.id,
          subjectId: this.selectedSubjectId,
          score: mark.score ? Math.round(parseFloat(mark.score)) : null,
          maxScore: 100, // Default max score of 100
          comments: mark.comments || ''
        };
      }
      return null;
    }).filter((m: any) => m !== null);

    if (marksData.length === 0) {
      this.error = 'Please enter at least one mark or remark';
      this.loading = false;
      return;
    }

    console.log('Saving marks for examId:', this.currentExam.id);
    console.log('Marks data to send:', marksData);

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.success = `Successfully saved marks for ${marksData.length} student(s)`;
        this.loading = false;
        // Reload existing marks to reflect saved data
        setTimeout(() => {
          this.loadExistingMarks();
          // Check completeness after saving
          this.checkCompleteness();
        }, 500);
      },
      error: (err: any) => {
        console.error('Error saving marks:', err);
        if (err.status === 403) {
          this.error = 'You do not have permission to save marks. Please contact an administrator.';
        } else if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to save marks. Please try again.';
        }
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  checkCompleteness() {
    if (!this.currentExam || !this.currentExam.id || !this.selectedClassId || !this.selectedExamType || !this.selectedTerm) {
      this.canPublish = false;
      return;
    }

    if (this.isPublished) {
      this.canPublish = false;
      return;
    }

    this.checkingCompleteness = true;

    // Get all marks for this exam
    this.examService.getMarks(this.currentExam.id, undefined, this.selectedClassId).subscribe({
      next: (allMarks: any) => {
        // Get all subjects for this exam
        const examSubjects = this.currentExam.subjects || [];
        if (examSubjects.length === 0) {
          this.canPublish = false;
          this.checkingCompleteness = false;
          return;
        }

        // Check if all students have marks for all subjects
        const studentIds = this.students.map(s => s.id);
        const subjectIds = examSubjects.map((s: any) => s.id);
        
        let allMarksComplete = true;
        for (const studentId of studentIds) {
          for (const subjectId of subjectIds) {
            const mark = allMarks.find((m: any) => 
              m.studentId === studentId && 
              m.subjectId === subjectId && 
              m.examId === this.currentExam.id
            );
            // Marks must have a score (can be 0, but must be a number)
            if (!mark || mark.score === null || mark.score === undefined || mark.score === '') {
              allMarksComplete = false;
              break;
            }
          }
          if (!allMarksComplete) break;
        }

        // Check report card remarks (class teacher and headmaster)
        // We'll check this by trying to get report card data
        this.examService.getReportCard(
          this.selectedClassId,
          this.selectedExamType,
          this.selectedTerm
        ).subscribe({
          next: (reportCardData: any) => {
            const reportCards = reportCardData.reportCards || [];
            let allRemarksComplete = true;

            for (const studentId of studentIds) {
              const card = reportCards.find((c: any) => c.student?.id === studentId);
              if (!card || !card.remarks) {
                allRemarksComplete = false;
                break;
              }
              // Check if class teacher and headmaster remarks are entered
              const hasClassTeacherRemarks = card.remarks.classTeacherRemarks && 
                card.remarks.classTeacherRemarks.trim().length > 0;
              const hasHeadmasterRemarks = card.remarks.headmasterRemarks && 
                card.remarks.headmasterRemarks.trim().length > 0;
              
              if (!hasClassTeacherRemarks || !hasHeadmasterRemarks) {
                allRemarksComplete = false;
                break;
              }
            }

            // Require both marks and remarks to be complete
            this.canPublish = allMarksComplete && allRemarksComplete;
            this.checkingCompleteness = false;
          },
          error: (err: any) => {
            // If we can't get report cards, just check marks
            // But we should still require remarks, so set to false if we can't verify
            this.canPublish = false;
            this.checkingCompleteness = false;
          }
        });
      },
      error: (err: any) => {
        console.error('Error checking completeness:', err);
        this.canPublish = false;
        this.checkingCompleteness = false;
      }
    });
  }

}

