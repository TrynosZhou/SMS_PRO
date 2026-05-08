import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { ClassService } from '../../services/class.service';
import { FinanceService } from '../../services/finance.service';
import { SubjectService } from '../../services/subject.service';
import { ModuleAccessService } from '../../services/module-access.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: any;
  moduleAccess: any = null;
  schoolName: string = '';
  /** Single banner line: alternates school name and each non-empty motto (never both at once). */
  displayedHeadline: string = '';
  showBulkMessage = false;
  private headlineRotateInterval: any;
  teacherName: string = '';

  // Sidebar collapse state
  studentManagementOpen = true;
  examManagementOpen = true;
  financeManagementOpen = true;
  reportsOpen = true;
  generalSettingsOpen = true;
  
  // Activity tab state
  activeActivityTab: 'students' | 'invoices' = 'students';

  // Statistics
  stats = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSubjects: 0,
    totalInvoices: 0,
    totalBalance: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    dayScholars: 0,
    boarders: 0,
    staffChildren: 0
  };

  get collectionRatePercent(): number {
    if (!this.stats.totalInvoiced || this.stats.totalInvoiced <= 0) return 0;
    return Math.min(100, Math.round((this.stats.totalPaid / this.stats.totalInvoiced) * 100));
  }
  
  loadingStats = true;
  /** Pending XHRs for admin/accountant stats (5 sources). */
  private statsLoadRemaining = 0;
  currencySymbol = '';
  academicYear = '';
  currentTerm = '';
  recentStudents: any[] = [];
  recentInvoices: any[] = [];

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private financeService: FinanceService,
    private subjectService: SubjectService,
    private moduleAccessService: ModuleAccessService
  ) { }

  ngOnInit() {
    this.user = this.authService.getCurrentUser();

    // Teachers use the dedicated Teacher Portal — keep admin/accountant dashboard separate
    if (this.authService.hasRole('teacher') || this.authService.hasRole('hod')) {
      this.router.navigate(['/teacher/dashboard'], { replaceUrl: true });
      return;
    }

    // Load module access from service
    this.moduleAccessService.loadModuleAccess();
    this.loadSettings();
    if (this.isAdmin() || this.isAccountant()) {
      this.loadStatistics();
    }
  }

  ngOnDestroy() {
    if (this.headlineRotateInterval) {
      clearInterval(this.headlineRotateInterval);
    }
  }
  
  loadStatistics() {
    this.loadingStats = true;
    this.statsLoadRemaining = 5;
    const done = () => {
      this.statsLoadRemaining--;
      if (this.statsLoadRemaining <= 0) {
        this.loadingStats = false;
      }
    };

    this.studentService.getStudents().subscribe({
      next: (students: any[]) => {
        this.stats.totalStudents = students.length;
        this.stats.dayScholars = students.filter(s => s.studentType === 'Day Scholar').length;
        this.stats.boarders = students.filter(s => s.studentType === 'Boarder').length;
        this.stats.staffChildren = students.filter(s => s.isStaffChild).length;
        this.recentStudents = students
          .sort((a, b) => new Date(b.enrollmentDate || b.createdAt || 0).getTime() - new Date(a.enrollmentDate || a.createdAt || 0).getTime())
          .slice(0, 5);
        done();
      },
      error: (err) => {
        console.error('Error loading students:', err);
        done();
      }
    });

    this.teacherService.getTeachers().subscribe({
      next: (teachers: any[]) => {
        this.stats.totalTeachers = teachers.length;
        done();
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
        done();
      }
    });

    this.classService.getClasses().subscribe({
      next: (classes: any) => {
        const list = Array.isArray(classes) ? classes : classes?.data || [];
        this.stats.totalClasses = list.filter((c: any) => c.isActive).length;
        done();
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        done();
      }
    });

    this.subjectService.getSubjects().subscribe({
      next: (subjects: any) => {
        const list = Array.isArray(subjects) ? subjects : subjects?.data || [];
        this.stats.totalSubjects = list.length;
        done();
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
        done();
      }
    });

    if (this.isAdmin() || this.isAccountant()) {
      this.financeService.getInvoices().subscribe({
        next: (invoices: any) => {
          const list = Array.isArray(invoices) ? invoices : invoices?.data || [];
          this.stats.totalInvoices = list.length;
          this.stats.totalBalance = list.reduce((sum: number, inv: any) => sum + (parseFloat(String(inv.balance)) || 0), 0);
          this.stats.totalInvoiced = list.reduce((sum: number, inv: any) => sum + (parseFloat(String(inv.amount)) || 0), 0);
          this.stats.totalPaid = list.reduce((sum: number, inv: any) => sum + (parseFloat(String(inv.paidAmount)) || 0), 0);
          this.recentInvoices = list
            .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 5);
          done();
        },
        error: (err) => {
          console.error('Error loading invoices:', err);
          done();
        }
      });
    }
  }

  getRoleLabel(): string {
    if (this.isSuperAdmin()) return 'Super admin';
    if (this.isAdmin()) return 'Admin';
    if (this.isAccountant()) return 'Accountant';
    if (this.authService.hasRole('librarian')) return 'Librarian';
    if (this.authService.hasRole('inventory_clerk')) return 'Inventory clerk';
    if (this.isParent()) return 'Parent';
    if (this.isStudent()) return 'Student';
    return 'Staff';
  }

  trackByStudentId(_i: number, s: any): string {
    return s?.id ?? String(_i);
  }

  trackByInvoiceId(_i: number, inv: any): string {
    return inv?.id ?? String(_i);
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        // For demo users, always use "Demo School"
        if (this.isDemoUser()) {
          this.schoolName = 'Demo School';
        } else {
          this.schoolName = row?.schoolName || '';
        }
        this.currencySymbol = row?.currencySymbol || '';
        this.academicYear = row?.academicYear || '';
        this.currentTerm = row?.currentTerm || '';
        this.moduleAccess = row?.moduleAccess || {};

        // Update module access service with latest settings
        if (row?.moduleAccess) {
          (this.moduleAccessService as any).moduleAccess = row.moduleAccess;
        }

        this.startHeadlineRotation(row || {});
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.schoolName = '';
        this.currencySymbol = '';
        this.academicYear = '';
        this.currentTerm = '';
        this.startHeadlineRotation({});
        // Use default module access from service
        this.moduleAccess = this.moduleAccessService.getModuleAccess();
      }
    });
  }


  isAdmin(): boolean {
    // Check if user is SUPERADMIN or ADMIN
    const user = this.authService.getCurrentUser();
    return user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user ? user.role === 'superadmin' : false;
  }

  isAccountant(): boolean {
    return this.authService.hasRole('accountant');
  }

  isInventoryStaff(): boolean {
    return (
      this.authService.hasRole('librarian') ||
      this.authService.hasRole('inventory_clerk') ||
      this.isAdmin()
    );
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher') || this.authService.hasRole('hod');
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isStudent(): boolean {
    return this.authService.hasRole('student');
  }

  openBulkMessage() {
    this.showBulkMessage = true;
  }

  closeBulkMessage() {
    this.showBulkMessage = false;
  }

  toggleSection(section: string) {
    switch (section) {
      case 'studentManagement':
        this.studentManagementOpen = !this.studentManagementOpen;
        break;
      case 'examManagement':
        this.examManagementOpen = !this.examManagementOpen;
        break;
      case 'financeManagement':
        this.financeManagementOpen = !this.financeManagementOpen;
        break;
      case 'reports':
        this.reportsOpen = !this.reportsOpen;
        break;
      case 'generalSettings':
        this.generalSettingsOpen = !this.generalSettingsOpen;
        break;
    }
  }

  hasModuleAccess(module: string): boolean {
    // Use module access service which has proper defaults and settings integration
    return this.moduleAccessService.canAccessModule(module);
  }

  canAccessModule(module: string): boolean {
    // Alias for hasModuleAccess for consistency
    return this.moduleAccessService.canAccessModule(module);
  }

  private normalizeModuleKey(module: string): string {
    const baseMap: any = {
      exams: 'exams',
      reportCards: 'reportCards',
      rankings: 'rankings',
      students: 'students',
      classes: 'classes',
      subjects: 'subjects',
      finance: 'finance',
      invoices: 'invoices',
      settings: 'settings',
      dashboard: 'dashboard',
      attendance: 'attendance',
      assignments: 'assignments',
      teachers: 'teachers'
    };
    return baseMap[module] || module;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getCurrentDateTime(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return now.toLocaleDateString('en-US', options);
  }

  loadTeacherName() {
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'teacher') {
      return;
    }

    // First, try to get name from user object (from login response)
    if (user.teacher) {
      // Prioritize fullName from login response
      if (user.teacher.fullName && 
          user.teacher.fullName.trim() && 
          user.teacher.fullName !== 'Teacher' && 
          user.teacher.fullName !== 'Account Teacher') {
        this.teacherName = user.teacher.fullName.trim();
        return;
      }
      
      // Fallback to extracting from firstName/lastName
        const name = this.extractTeacherName(user.teacher);
        if (name && name !== 'Teacher' && name.trim()) {
          this.teacherName = name;
          return;
        }
    }

    // If not available in user object, fetch from API as fallback
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        // Prioritize fullName from API response
        if (teacher.fullName && 
            teacher.fullName.trim() && 
            teacher.fullName !== 'Teacher' && 
            teacher.fullName !== 'Account Teacher') {
          this.teacherName = teacher.fullName.trim();
        } else {
          const name = this.extractTeacherName(teacher);
          if (name && name !== 'Teacher' && name.trim()) {
            this.teacherName = name;
          }
        }
      },
      error: (err) => {
        console.error('Error loading teacher name from API:', err);
        // Keep teacherName empty, getDisplayName() will handle fallback
        this.teacherName = '';
      }
    });
  }

  private extractTeacherName(teacher: any): string {
    if (!teacher) {
      return '';
    }

    // Use fullName if available and valid
    if (teacher.fullName && teacher.fullName.trim() && teacher.fullName !== 'Teacher' && teacher.fullName !== 'Account Teacher') {
      return teacher.fullName.trim();
    }

    // Otherwise construct from firstName and lastName
    const firstName = (teacher.firstName && typeof teacher.firstName === 'string') ? teacher.firstName.trim() : '';
    const lastName = (teacher.lastName && typeof teacher.lastName === 'string') ? teacher.lastName.trim() : '';
    
    // Filter out placeholder values
    const validFirst = (firstName && firstName !== 'Teacher' && firstName !== 'Account') ? firstName : '';
    const validLast = (lastName && lastName !== 'Teacher' && lastName !== 'Account') ? lastName : '';
    
    // Combine as LastName + FirstName
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    return parts.join(' ').trim();
  }

  getDisplayName(): string {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return 'User';
    }

    // For teachers, prioritize teacher fullName from login response
    if (user.role === 'teacher') {
      // First check if we have a cached teacher name
      if (this.teacherName && this.teacherName !== 'Teacher' && this.teacherName.trim()) {
        return this.teacherName;
      }
      
      // Then check user.teacher object from login response (most reliable)
      if (user.teacher) {
        // Prioritize fullName from login response
        if (user.teacher.fullName && 
            user.teacher.fullName.trim() && 
            user.teacher.fullName !== 'Teacher' && 
            user.teacher.fullName !== 'Account Teacher') {
          return user.teacher.fullName.trim();
        }
        
        // Fallback to extracting from firstName/lastName
        const extractedName = this.extractTeacherName(user.teacher);
        if (extractedName && extractedName !== 'Teacher' && extractedName.trim()) {
          return extractedName;
        }
      }
      
      // If teacher name is still not available, return generic 'Teacher' instead of username
      return 'Teacher';
    }

    // For other roles, return email or username
    return user.email || user.username || 'User';
  }

  /**
   * Rotates one line at a time: school name (if any), then motto 1–3 (if any).
   * Same typography in the template — no simultaneous name + motto.
   */
  private startHeadlineRotation(data: any) {
    if (this.headlineRotateInterval) {
      clearInterval(this.headlineRotateInterval);
      this.headlineRotateInterval = null;
    }

    const slides: string[] = [];
    const name = (this.schoolName || '').trim();
    if (name) {
      slides.push(name);
    }

    const mottos = [data?.schoolMotto, data?.schoolMotto2, data?.schoolMotto3]
      .map((s: any) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s: string) => !!s);
    slides.push(...mottos);

    if (slides.length === 0) {
      this.displayedHeadline = '';
      return;
    }

    this.displayedHeadline = slides[0];
    if (slides.length < 2) {
      return;
    }

    let idx = 0;
    this.headlineRotateInterval = setInterval(() => {
      idx = (idx + 1) % slides.length;
      this.displayedHeadline = slides[idx];
    }, 4000);
  }
}

