import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';
import { Router, NavigationEnd, IsActiveMatchOptions } from '@angular/router';
import { filter } from 'rxjs/operators';
import { UserActivityService } from './services/user-activity.service';
import { AddTeacherModalService } from './services/add-teacher-modal.service';

interface NavChild {
  label: string;
  route?: string;
  icon?: string;
  action?: 'addTeacher';
  queryParams?: Record<string, string>;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route?: string;        // present when item is a direct link (no submenu)
  children?: NavChild[]; // present when item has a submenu
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  /**
   * Subset match for nested admin routes. Must set queryParams/matrixParams/fragment:
   * partial `{ paths: 'subset' }` is treated as full IsActiveMatchOptions and breaks Router.isActive.
   */
  readonly linkActiveSubset: IsActiveMatchOptions = {
    paths: 'subset',
    queryParams: 'subset',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  schoolName = 'School Management System';
  mobileMenuOpen = false;
  /** Live URL so views can toggle layout (e.g. dashboard renders its own shell). */
  currentUrl = '';
  private lastMenuAccessLogged = '';
  private lastMenuAccessLoggedAt = 0;

  // ── Modern sidebar state (mirrors the dashboard's own sidebar so navigation
  //    is available on every route, not just /dashboard) ───────────────────
  /** Mobile drawer open state (visible on small screens). */
  sidebarOpen = false;
  /** Which submenu group is expanded — keyed by NavItem.id. Only one at a time. */
  openSubmenu: string | null = null;
  /** Top-level navigation items shown in the left sidebar. */
  navItems: NavItem[] = [];
  constructor(
    public authService: AuthService,
    private settingsService: SettingsService,
    public moduleAccessService: ModuleAccessService,
    public router: Router,
    private userActivityService: UserActivityService,
    private addTeacherModal: AddTeacherModalService
  ) { }

  ngOnInit(): void {
    // Angular initialNavigation is disabled — bootstrap to the current URL when
    // the user is still signed in (browser refresh), otherwise splash or login.
    const bootstrapUrl = this.resolveBootstrapUrl();
    this.router.navigateByUrl(bootstrapUrl, { replaceUrl: true }).catch(() => { });

    // Seed currentUrl on first load (NavigationEnd fires only after subsequent navigations).
    this.currentUrl = this.router.url || '';

    // React to auth state changes so role-specific settings/menu items
    // appear right after the user signs in and disappear after logout.
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.settingsService.getSettings().subscribe({
          next: (settings: any) => {
            this.schoolName = settings?.schoolName || 'School Management System';
          },
          error: () => {
            // ignore settings fetch errors to avoid blocking UI
          }
        });
        this.moduleAccessService.loadModuleAccess();
      } else {
        this.schoolName = 'School Management System';
      }
      this.buildNavMenu();
    });

    // Track menu access (used by Activity Log)
    this.router.events
      .pipe(filter((event: any) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentUrl = event.urlAfterRedirects || event.url || '';
        this.closeSidebar();

        if (!this.authService.isAuthenticated()) return;

        const user = this.authService.getCurrentUser();
        const role = user?.role;
        const shouldLog =
          role === 'admin' || role === 'superadmin' || role === 'accountant';

        if (!shouldLog) return;

        const url: string = event.urlAfterRedirects || event.url || '';
        const cleanUrl = url.split('?')[0];

        const now = Date.now();
        if (cleanUrl === this.lastMenuAccessLogged && now - this.lastMenuAccessLoggedAt < 3000) {
          return;
        }

        this.lastMenuAccessLogged = cleanUrl;
        this.lastMenuAccessLoggedAt = now;

        // Fire-and-forget: activity log should never block navigation.
        this.userActivityService.logMenuAccess(cleanUrl).subscribe({
          next: () => {},
          error: () => {}
        });
      });
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  /**
   * Dashboard renders its own self-contained shell (top header + side nav).
   * On that route we hide the app-level sidebar/top navbar so they don't double up.
   */
  isDashboardRoute(): boolean {
    const url = (this.currentUrl || this.router.url || '').split('?')[0].split('#')[0];
    return url === '/dashboard' || url.startsWith('/dashboard/');
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher') || this.authService.hasRole('hod');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  isAccountant(): boolean {
    return this.authService.hasRole('accountant');
  }

  isInventoryStaff(): boolean {
    return (
      this.authService.hasRole('teacher') ||
      this.authService.hasRole('librarian') ||
      this.authService.hasRole('inventory_clerk') ||
      this.authService.hasRole('hod') ||
      this.isAdmin()
    );
  }

  isStudent(): boolean {
    return this.authService.hasRole('student');
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  canAccessModule(moduleName: string): boolean {
    return this.moduleAccessService.canAccessModule(moduleName);
  }

  /** Who may use Student Manager → Enroll Student / enrollment APIs */
  canEnrollStudents(): boolean {
    return (
      this.isTeacher() ||
      this.isAdmin() ||
      this.authService.hasRole('accountant')
    );
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  logout(): void {
    this.closeMobileMenu();
    this.closeSidebar();
    this.authService.logout();
  }

  /**
   * Where to send the app on load/refresh: keep the current page when still
   * authenticated; otherwise splash, login, or login with return URL.
   */
  private resolveBootstrapUrl(): string {
    if (typeof window === 'undefined') {
      return '/';
    }

    const path = window.location.pathname || '/';
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const fullPath = `${path}${search}${hash}`;

    if (this.authService.isAuthenticated()) {
      if (path === '/' || path === '/login') {
        return this.authService.getDefaultHomeRoute();
      }
      return fullPath;
    }

    if (path === '/' || path === '/login') {
      return fullPath;
    }

    return `/login?returnUrl=${encodeURIComponent(path + search)}`;
  }

  // ── Modern sidebar interactions ──────────────────────────────────────
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleSubmenu(id: string): void {
    this.openSubmenu = this.openSubmenu === id ? null : id;
  }

  isSubmenuOpen(id: string): boolean {
    return this.openSubmenu === id;
  }

  /** Handle clicks on submenu items that map to component actions. */
  runNavAction(action: string | undefined): void {
    if (!action) return;
    if (action === 'addTeacher') this.addTeacherModal.open();
    this.closeSidebar();
  }

  getCurrentUserRole(): string {
    const user = this.authService.getCurrentUser();
    if (!user) return '';

    if (user.role) {
      return user.role.toUpperCase();
    }

    // Fallback to checking roles
    if (this.isSuperAdmin()) return 'SUPERADMIN';
    if (this.isTeacher()) return 'TEACHER';
    if (this.isParent()) return 'PARENT';
    return 'ADMIN';
  }

  /** Build the left sidebar menu based on the current user's role. */
  private buildNavMenu(): void {
    const items: NavItem[] = [];

    if (this.isStudent()) {
      // Students get a minimal student-focused nav; their own dashboard handles the rest.
      this.navItems = items;
      return;
    }

    items.push({ id: 'dashboard', label: 'Dashboard', icon: '🏠', route: '/dashboard' });

    if (this.isAdmin()) {
      items.push(
        {
          id: 'registration', label: 'Registration', icon: '📝',
          children: [
            { label: 'Teachers', icon: '👨‍🏫', route: '/teachers' },
            { label: 'Students', icon: '🎓', route: '/students' },
            { label: 'Parents', icon: '👪', route: '/parents' }
          ]
        },
        {
          id: 'enrolment', label: 'Enrolment', icon: '🎒',
          children: [
            { label: 'Classes', icon: '📕', route: '/classes' },
            { label: 'Terms', icon: '📆', route: '/terms' },
            { label: 'Enrol', icon: '✅', route: '/enrol' },
            { label: 'Class Lists', icon: '📋', route: '/class-lists' },
            { label: 'Promote Students', icon: '⬆️', route: '/migrate-class/promote' },
            { label: 'Migrate Class', icon: '↔️', route: '/migrate-class/enrolment' }
          ]
        },
        {
          id: 'attendance', label: 'Attendance', icon: '🗓️',
          children: [
            { label: 'Mark Register', icon: '✏️', route: '/mark-register' },
            { label: 'Attendance Reports', icon: '📈', route: '/attendance-reports' }
          ]
        },
        {
          id: 'marks', label: 'Marks', icon: '⭐',
          children: [
            { label: 'Subjects', icon: '📚', route: '/subjects' },
            { label: 'Marks Input', icon: '📝', route: '/marks-input' },
            { label: 'Marks Progress', icon: '📈', route: '/marks-progress' },
            { label: 'Marks Diagnostics', icon: '📊', route: '/mark-diagnostic' },
            { label: 'Continuous Assessment', icon: '📋', route: '/marks/continuous' }
          ]
        },
        {
          id: 'progress', label: 'Progress Reports', icon: '📑',
          children: [
            { label: 'Report Cards', icon: '🧾', route: '/reports' },
            { label: 'Rankings', icon: '🏆', route: '/ranking' }
          ]
        },
        {
          id: 'results', label: 'Results Analysis', icon: '📊',
          children: [
            { label: 'Mark Sheets', icon: '📄', route: '/mark-sheets' },
            { label: 'Termly Results', icon: '📊', route: '/termly-results' }
          ]
        },
        {
          id: 'finance', label: 'Finance', icon: '💰',
          children: [
            { label: 'Fees', icon: '🏷️', route: '/finance' },
            { label: 'Receipting', icon: '🧾', route: '/record-payment' },
            { label: 'Billing', icon: '💳', route: '/billing' },
            { label: 'Invoices', icon: '📋', route: '/invoices/statements' },
            { label: 'Exemptions', icon: '🪪', route: '/exemptions' },
            { label: 'Student Balances', icon: '💼', route: '/balance-enquiry' }
          ]
        },
        {
          id: 'financial-reports', label: 'Financial Reports', icon: '📊',
          children: [
            { label: 'Student Ledgers', icon: '📒', route: '/student-ledgers' },
            { label: 'Fees Collection', icon: '💵', route: '/fees-collection' },
            { label: 'Outstanding Fees', icon: '💲', route: '/outstanding-fees' },
            { label: 'Exemptions', icon: '🪪', route: '/exemptions-report' },
            { label: 'Aged Debtors', icon: '⏳', route: '/aged-debtors' },
            { label: 'Enrolment vs Billing', icon: '📈', route: '/enrolment-vs-billing' },
            { label: 'Revenue Recognition', icon: '💹', route: '/revenue-recognition' },
            { label: 'Student Reconciliation', icon: '⚖️', route: '/student-reconciliation' },
            { label: 'Analytics & Forecasts', icon: '🔮', route: '/analytics-forecasts' },
            { label: 'Class Reconciliation', icon: '🏫', route: '/class-reconciliation' }
          ]
        },
        {
          id: 'payroll', label: 'Payroll', icon: '🧮',
          children: [
            { label: 'Overview', icon: '🗂️', route: '/payroll/overview' },
            { label: 'Employees', icon: '👥', route: '/payroll/manage/employees' },
            { label: 'Structures', icon: '🏛️', route: '/payroll/manage/structures' },
            { label: 'Assignments', icon: '🔗', route: '/payroll/manage/assignments' },
            { label: 'Process', icon: '⚙️', route: '/payroll/manage/process' },
            { label: 'Leave', icon: '🌴', route: '/payroll/manage/leave' },
            { label: 'Payslips', icon: '🧾', route: '/payroll/manage/payslips' },
            { label: 'Reports', icon: '📊', route: '/payroll/manage/reports' }
          ]
        },
        {
          id: 'timetable', label: 'Timetable', icon: '📅',
          children: [
            { label: 'Configure', icon: '⚙️', route: '/timetable/config' },
            { label: 'Subject Periods', icon: '⏱️', route: '/subject-periods' },
            { label: 'Subjects per Class', icon: '📚', route: '/assign-subject' },
            { label: 'Teaching Load (by Teacher)', icon: '👨‍🏫', route: '/teacher_subject' },
            { label: 'Teaching Load (by Class)', icon: '🔗', route: '/assign-teachers' },
            { label: 'Class Teachers', icon: '📋', route: '/class-teachers' },
            { label: 'Generate Timetable', icon: '🗓️', route: '/view' },
            { label: 'View Timetable', icon: '👁️', route: '/view_timetable' },
            { label: 'Manual Adjustments', icon: '✏️', route: '/manual' }
          ]
        },
        {
          id: 'communication', label: 'Communication', icon: '💬',
          children: [
            { label: 'Send Message', icon: '📤', route: '/communication_manage/send' },
            { label: 'View Messages', icon: '📥', route: '/communication_manage/view' }
          ]
        },
        {
          id: 'reports', label: 'Misc Reports', icon: '📈',
          children: [
            { label: 'Transport Services', icon: '🚌', route: '/reports/manage/transport-services' },
            { label: 'Student ID Cards', icon: '🪪', route: '/reports/manage/student-id-cards' },
            { label: 'DH Services', icon: '🛏️', route: '/reports/dh-services' }
          ]
        },
      );

      if (this.isInventoryStaff()) {
        items.push({
          id: 'inventory', label: 'Inventory', icon: '📦',
          children: [
            { label: 'Stock', icon: '📚', route: '/inventory/manage', queryParams: { tab: 'stock' } },
            { label: 'Textbook Allocation', icon: '📘', route: '/inventory/manage', queryParams: { tab: 'custody' } },
            { label: 'Furniture Allocation', icon: '🪑', route: '/inventory/manage', queryParams: { tab: 'furnitureAllocation' } },
            { label: 'Report Furniture', icon: '🛋️', route: '/inventory/manage', queryParams: { tab: 'reportsFurniture' } },
            { label: 'Report Textbook', icon: '📕', route: '/inventory/manage', queryParams: { tab: 'reportsTextbooksHod' } },
            { label: 'Audit', icon: '📋', route: '/inventory/manage', queryParams: { tab: 'audit' } }
          ]
        });
      }

      items.push(
        {
          id: 'system-administration', label: 'System Administration', icon: '🛠️',
          children: [
            { label: 'User Management', icon: '👥', route: '/user-management' },
            { label: 'Role & Permissions', icon: '🔐', route: '/system/roles' },
            { label: 'Academic Settings', icon: '🎓', route: '/academic-settings' },
            { label: 'System Settings', icon: '⚙️', route: '/system-settings' },
            { label: 'Audit Logs', icon: '📜', route: '/audit-logs' },
            { label: 'Analytics & Reports', icon: '📊', route: '/analytics-reports' },
            { label: 'Integrations', icon: '🔗', route: '/system/integrations' }
          ]
        }
      );
    } else if (this.isAccountant()) {
      items.push(
        {
          id: 'registration', label: 'Students', icon: '👥',
          children: [
            { label: 'All Students', icon: '📋', route: '/students' }
          ]
        },
        {
          id: 'finance', label: 'Finance', icon: '💰',
          children: [
            { label: 'Fees', icon: '🏷️', route: '/finance' },
            { label: 'Receipting', icon: '🧾', route: '/record-payment' },
            { label: 'Billing', icon: '💳', route: '/billing' },
            { label: 'Invoices', icon: '📋', route: '/invoices/statements' },
            { label: 'Exemptions', icon: '🪪', route: '/exemptions' },
            { label: 'Student Balances', icon: '💼', route: '/balance-enquiry' }
          ]
        },
        {
          id: 'financial-reports', label: 'Financial Reports', icon: '📊',
          children: [
            { label: 'Student Ledgers', icon: '📒', route: '/student-ledgers' },
            { label: 'Fees Collection', icon: '💵', route: '/fees-collection' },
            { label: 'Outstanding Fees', icon: '💲', route: '/outstanding-fees' },
            { label: 'Exemptions', icon: '🪪', route: '/exemptions-report' },
            { label: 'Aged Debtors', icon: '⏳', route: '/aged-debtors' },
            { label: 'Enrolment vs Billing', icon: '📈', route: '/enrolment-vs-billing' },
            { label: 'Revenue Recognition', icon: '💹', route: '/revenue-recognition' },
            { label: 'Student Reconciliation', icon: '⚖️', route: '/student-reconciliation' },
            { label: 'Analytics & Forecasts', icon: '🔮', route: '/analytics-forecasts' },
            { label: 'Class Reconciliation', icon: '🏫', route: '/class-reconciliation' }
          ]
        },
        {
          id: 'payroll', label: 'Payroll', icon: '🧮',
          children: [
            { label: 'Overview', icon: '🗂️', route: '/payroll/overview' },
            { label: 'Payslips', icon: '🧾', route: '/payroll/manage/payslips' },
            { label: 'Reports', icon: '📊', route: '/payroll/manage/reports' }
          ]
        }
      );
    } else if (this.isTeacher()) {
      items.push(
        { id: 'teacher-dash', label: 'Teacher Dashboard', icon: '🏠', route: '/teacher/dashboard' },
        { id: 'classes', label: 'Classes', icon: '🏫', route: '/classes/manage' },
        { id: 'teacher-record', label: 'Record Book', icon: '📖', route: '/teacher/record-book' },
        { id: 'teacher-my-classes', label: 'My Classes', icon: '👥', route: '/teacher/my-classes' },
        { id: 'inventory', label: 'Inventory', icon: '📦', route: '/teacher/inventory_manage' }
      );
    } else if (this.isInventoryStaff()) {
      items.push({
        id: 'inventory', label: 'Inventory', icon: '📦',
        children: [
          { label: 'Stock', icon: '📚', route: '/inventory/manage', queryParams: { tab: 'stock' } },
          { label: 'Textbook Allocation', icon: '📘', route: '/inventory/manage', queryParams: { tab: 'custody' } },
          { label: 'Furniture Allocation', icon: '🪑', route: '/inventory/manage', queryParams: { tab: 'furnitureAllocation' } },
          { label: 'Report Furniture', icon: '🛋️', route: '/inventory/manage', queryParams: { tab: 'reportsFurniture' } },
          { label: 'Report Textbook', icon: '📕', route: '/inventory/manage', queryParams: { tab: 'reportsTextbooksHod' } },
          { label: 'Audit', icon: '📋', route: '/inventory/manage', queryParams: { tab: 'audit' } }
        ]
      });
    }

    this.navItems = items;
  }
}
