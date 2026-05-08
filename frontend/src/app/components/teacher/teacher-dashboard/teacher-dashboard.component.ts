import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { ModuleAccessService } from '../../../services/module-access.service';
import { ClassService } from '../../../services/class.service';
import { EtaskService } from '../../../services/etask.service';

@Component({
  selector: 'app-teacher-dashboard',
  templateUrl: './teacher-dashboard.component.html',
  styleUrls: ['../../dashboard/dashboard.component.css', './teacher-dashboard.component.css']
})
export class TeacherDashboardComponent implements OnInit, OnDestroy {
  teacher: any = null;
  teacherClasses: any[] = [];
  selectedClassId: string = '';
  loading = false;
  error = '';
  teacherName = '';
  /** Male / Female / etc. from teacher profile — drives Mr / Mrs on welcome line */
  teacherGender: string | null = null;
  schoolName = '';
  /** Active term label from school settings */
  activeTerm = '';
  /** Count of subjects linked to this teacher */
  subjectCount = 0;
  moduleAccess: any = null;
  availableModules: any[] = [];

  /** Live dashboard clock */
  daypartGreeting = '';
  clockTime = '';
  clockDate = '';
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;

  /** E-learning metrics (when record book / e-learning is enabled) */
  elearningLoading = false;
  tasksCreatedCount = 0;
  submissionsReceivedCount = 0;

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    private moduleAccessService: ModuleAccessService,
    private classService: ClassService,
    private etaskService: EtaskService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.teacher) {
      const g = user.teacher.gender;
      if (g != null && String(g).trim()) {
        this.teacherGender = String(g).trim();
      }
      if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
        this.teacherName = user.teacher.fullName.trim();
      } else {
        this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
      }
    } else {
      this.teacherName = 'Teacher';
    }
  }

  private getFullName(firstName?: string, lastName?: string): string {
    // Handle null, undefined, or empty strings
    const first = (firstName && typeof firstName === 'string') ? firstName.trim() : '';
    const last = (lastName && typeof lastName === 'string') ? lastName.trim() : '';
    
    const validFirst = (first && first !== 'Teacher' && first !== 'Account') ? first : '';
    const validLast = (last && last !== 'Teacher' && last !== 'Account') ? last : '';
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    const fullName = parts.join(' ').trim();
    return fullName || 'Teacher';
  }

  ngOnInit() {
    if (!this.authService.hasRole('teacher') && !this.authService.hasRole('hod')) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.startClock();
    this.loadSettings();
    this.updateAvailableModules();
    this.loadModuleAccess();
    this.loadTeacherInfo();
  }

  ngOnDestroy(): void {
    if (this.clockIntervalId !== null) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
  }

  private startClock(): void {
    this.tickClock();
    this.clockIntervalId = setInterval(() => this.tickClock(), 1000);
  }

  private tickClock(): void {
    const now = new Date();
    const h = now.getHours();
    if (h < 12) {
      this.daypartGreeting = 'Good morning';
    } else if (h < 17) {
      this.daypartGreeting = 'Good afternoon';
    } else {
      this.daypartGreeting = 'Good evening';
    }
    this.clockTime = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    this.clockDate = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.schoolName = row?.schoolName || 'School';
        this.activeTerm = (row?.activeTerm || row?.currentTerm || '').trim() || '';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadModuleAccess() {
    // Ensure module access service is loaded
    this.moduleAccessService.loadModuleAccess();
    
    // Get module access (will use default if not loaded yet)
    this.moduleAccess = this.moduleAccessService.getModuleAccess();
    
    // Load from settings and update
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        // Update module access from settings
        if (settings?.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
          // Update the service as well
          (this.moduleAccessService as any).moduleAccess = settings.moduleAccess;
        }
        
        this.updateAvailableModules();
        console.log('Available modules for teacher:', this.availableModules);
        console.log('Module access from settings:', this.moduleAccess?.teachers);
      },
      error: (err: any) => {
        console.error('Error loading module access:', err);
        // Use default module access from service
        this.updateAvailableModules();
      }
    });
  }

  private updateAvailableModules() {
    // Get module access (use service which has defaults)
    const access = this.moduleAccessService.getModuleAccess();
    const teacherModules = access?.teachers || {};
    
    const allModules = [
      { key: 'students', name: 'Students', route: '/students', icon: '👥', description: 'View students you are allowed to see' },
      { key: 'classes', name: 'Classes', route: '/classes', icon: '🏫', description: 'Browse class information' },
      { key: 'subjects', name: 'Subjects', route: '/subjects', icon: '📚', description: 'View subject details' },
      { key: 'exams', name: 'Exams', route: '/exams', icon: '📝', description: 'Marks capturing and exams' },
      { key: 'reportCards', name: 'Report Cards', route: '/report-cards', icon: '📊', description: 'View and generate report cards' },
      { key: 'rankings', name: 'Rankings', route: '/rankings', icon: '🏆', description: 'View rankings' },
      { key: 'recordBook', name: 'Record Book', route: '/teacher/elearning-manage/record-book', icon: '📖', description: 'Enter and view marks' },
      { key: 'etask', name: 'Create Task', route: '/teacher/elearning-manage/tasks', icon: '✏️', description: 'E-learning tasks for your classes' },
      { key: 'inventory', name: 'Inventory Manager', route: '/teacher/inventory_manage', icon: '📦', description: 'Issue textbooks and class furniture' },
      { key: 'attendance', name: 'Attendance', route: '/attendance/mark', icon: '✅', description: 'Mark register & attendance' },
      { key: 'finance', name: 'Finance', route: '/invoices', icon: '💰', description: 'View financial information' },
      { key: 'settings', name: 'Settings', route: '/settings', icon: '⚙️', description: 'School settings (if allowed)' }
    ];

    this.availableModules = allModules.filter((module) => {
      if (module.key === 'etask' && !this.canAccessModule('recordBook')) {
        return false;
      }
      const moduleAccess = teacherModules as { [key: string]: boolean | undefined };
      return moduleAccess[module.key] !== false;
    });
  }

  /** Loads e-task and submission counts for the overview strip. */
  loadElearningStats(): void {
    if (!this.canAccessModule('recordBook')) {
      return;
    }
    this.elearningLoading = true;
    forkJoin({
      tasks: this.etaskService.listTeacherTasks(),
      subs: this.etaskService.listTeacherSubmissions()
    }).subscribe({
      next: ({ tasks, subs }) => {
        this.tasksCreatedCount = Array.isArray(tasks) ? tasks.length : 0;
        this.submissionsReceivedCount = Array.isArray(subs) ? subs.length : 0;
        this.elearningLoading = false;
      },
      error: () => {
        this.tasksCreatedCount = 0;
        this.submissionsReceivedCount = 0;
        this.elearningLoading = false;
      }
    });
  }

  loadTeacherInfo() {
    const user = this.authService.getCurrentUser();
    
    // Check if user is a teacher
    if (!user || (user.role !== 'teacher' && user.role !== 'hod')) {
      this.error = 'Only teachers and HODs can access this dashboard';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Load teacher info first
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        this.subjectCount = Array.isArray(teacher.subjects) ? teacher.subjects.length : 0;

        if (teacher.gender != null && String(teacher.gender).trim()) {
          this.teacherGender = String(teacher.gender).trim();
        }

        // Update teacher name - prioritize fullName from response, otherwise construct it
        // Filter out default placeholder values ("Teacher", "Account")
        const hasValidName = teacher.firstName && 
                            teacher.firstName.trim() && 
                            teacher.firstName !== 'Teacher' && 
                            teacher.firstName !== 'Account' &&
                            teacher.lastName && 
                            teacher.lastName.trim() && 
                            teacher.lastName !== 'Teacher' && 
                            teacher.lastName !== 'Account';
        
        if (teacher.formattedTitleName && String(teacher.formattedTitleName).trim()) {
          this.teacherName = String(teacher.formattedTitleName).trim();
        } else if (hasValidName) {
          const firstName = teacher.firstName.trim();
          const lastName = teacher.lastName.trim();
          this.teacherName = this.getFullName(firstName, lastName);
        } else if (teacher.fullName && teacher.fullName.trim() && teacher.fullName !== 'Teacher' && teacher.fullName !== 'Account Teacher') {
          this.teacherName = teacher.fullName.trim();
        } else {
          const firstName = (teacher.firstName && teacher.firstName.trim()) ? teacher.firstName.trim() : '';
          const lastName = (teacher.lastName && teacher.lastName.trim()) ? teacher.lastName.trim() : '';
          this.teacherName = this.getFullName(firstName, lastName);
        }

        this.cdr.detectChanges();

        if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          this.teacherClasses = teacher.classes || [];
          this.loading = false;
          this.loadElearningStats();
        }

        this.cdr.detectChanges();

        if (!this.teacherName || this.teacherName === 'Teacher' || this.teacherName.trim() === '') {
          const user = this.authService.getCurrentUser();
          if (user?.teacher) {
            if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
              this.teacherName = user.teacher.fullName.trim();
            } else if (user.teacher.firstName && user.teacher.lastName &&
                     user.teacher.firstName !== 'Teacher' && user.teacher.lastName !== 'Account') {
              this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
            }
            if (this.teacherName && this.teacherName !== 'Teacher') {
              this.cdr.detectChanges();
            }
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading teacher:', err);
        this.loading = false;
        
        // Fallback: Try to get name from user object if API call fails
        const user = this.authService.getCurrentUser();
        if (user?.teacher) {
          if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
            this.teacherName = user.teacher.fullName.trim();
          } else {
            this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
          }
          this.cdr.detectChanges();
        }
        
        if (err.status === 404) {
          this.error = 'No teacher profile found for your account. Please contact the administrator.';
        } else if (err.status === 401) {
          this.error = 'You are not authenticated. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = 'Failed to load teacher information. Please try again.';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        const classes = response.classes || [];
        // Only use classes from the dedicated endpoint (these are from junction table)
        this.teacherClasses = this.classService.sortClasses(classes);
        this.loading = false;
        this.loadElearningStats();
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        const fallbackClasses = this.teacher?.classes || [];
        this.teacherClasses = this.classService.sortClasses(fallbackClasses);
        this.loading = false;
        this.loadElearningStats();
      }
    });
  }

  openRecordBook(classItem?: any) {
    // Use selected class from dropdown or passed classItem
    const classId = classItem?.id || this.selectedClassId;
    if (!classId) {
      this.error = 'Please select a class first';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    // Navigate to record book with class ID
    this.router.navigate(['/teacher/elearning-manage/record-book'], {
      queryParams: { classId: classId }
    });
  }

  onClassSelected() {
    // Reserved for future: jump hints or analytics
  }

  navigateToModule(module: any) {
    if (module.route) {
      this.router.navigate([module.route]);
    }
  }

  getDisplayName(): string {
    return this.teacherName && this.teacherName.trim() ? this.teacherName.trim() : 'Teacher';
  }

  /** Title-case each word (for Mrs … Yeukai Zhou) */
  private toTitleCaseWords(s: string): string {
    if (!s || typeof s !== 'string') return '';
    return s
      .trim()
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .filter(Boolean)
      .join(' ');
  }

  private isGenderMale(g: string): boolean {
    const x = g.trim().toLowerCase();
    return x === 'male' || x === 'm' || x.startsWith('male');
  }

  private isGenderFemale(g: string): boolean {
    const x = g.trim().toLowerCase();
    return x === 'female' || x === 'f' || x.startsWith('female');
  }

  /**
   * Full welcome line with honorific when gender is set:
   * Male: "Welcome back Mr FIRSTNAME LASTNAME" (uppercase, e.g. TRYNOS ZHOU)
   * Female: "Welcome back Mrs Firstname Lastname" (title case, e.g. Yeukai Zhou)
   */
  getWelcomeLine(): string {
    const g = (this.teacherGender || '').trim();
    const fn = (this.teacher?.firstName || '').trim();
    const ln = (this.teacher?.lastName || '').trim();
    const user = this.authService.getCurrentUser();
    const first = fn || (user?.teacher?.firstName || '').trim();
    const last = ln || (user?.teacher?.lastName || '').trim();

    if (g && this.isGenderMale(g) && (first || last)) {
      const upper = `${first} ${last}`.trim().toUpperCase();
      return `Welcome back Mr ${upper}`;
    }
    if (g && this.isGenderFemale(g) && (first || last)) {
      const pretty = `${this.toTitleCaseWords(first)} ${this.toTitleCaseWords(last)}`.trim();
      return `Welcome back Mrs ${pretty}`;
    }

    const display = this.getDisplayName();
    return `Welcome back, ${display}`;
  }

  /** Hero emoji: subtle hint by gender */
  getTeacherHeroEmoji(): string {
    const g = (this.teacherGender || '').trim();
    if (g && this.isGenderFemale(g)) return '👩‍🏫';
    if (g && this.isGenderMale(g)) return '👨‍🏫';
    return '👨‍🏫';
  }

  canAccessModule(moduleName: string): boolean {
    return this.moduleAccessService.canAccessModule(moduleName);
  }
}

