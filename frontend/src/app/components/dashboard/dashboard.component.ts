import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { CurrencyService } from '../../services/currency.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { ClassService } from '../../services/class.service';
import { FinanceService } from '../../services/finance.service';
import { SubjectService } from '../../services/subject.service';
import { ModuleAccessService } from '../../services/module-access.service';
import { AddTeacherModalService } from '../../services/add-teacher-modal.service';
import { resolveSchoolLogoSrc } from '../../utils/school-logo.util';

interface CommandItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
  group: string;
  keywords?: string;
}

interface Insight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  route?: string;
  cta?: string;
}

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

interface NavSection {
  id: string;
  title: string;        // e.g. "OVERVIEW", "ACADEMICS", "FINANCE"
  icon?: string;        // small icon shown next to section title
  items: NavItem[];
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: any;
  moduleAccess: any = null;
  schoolName: string = '';
  /** School logo URL or data URL from Settings (system-settings); shown in header/banner when set. */
  schoolLogo = '';
  /** Single banner line: alternates school name and each non-empty motto (never both at once). */
  displayedHeadline: string = '';
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
    staffChildren: 0,
    maleStudents: 0,
    femaleStudents: 0,
    maleTeachers: 0,
    femaleTeachers: 0
  };

  /** Animated display values that count up to the actual stat values. */
  displayStats: any = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSubjects: 0,
    totalInvoices: 0,
    totalBalance: 0,
    staffChildren: 0
  };
  private countUpHandles: any = {};

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
  /** Cached full invoice list for insights/analytics. */
  private allInvoices: any[] = [];
  /** Cached full student list for command palette search. */
  private allStudents: any[] = [];

  // ── Modern feature state ────────────────────────────────────────────
  /** Live clock (auto-refreshed every second). */
  currentTime: Date = new Date();
  private clockHandle: any;

  /** Pull-to-refresh / auto-refresh. */
  lastUpdated: Date | null = null;
  refreshing = false;
  autoRefresh = false;
  private autoRefreshHandle: any;
  /** Seconds remaining until next auto-refresh tick. */
  autoRefreshCountdown = 60;
  private autoRefreshTotalSec = 60;
  private countdownHandle: any;

  /** Dark mode (persisted to localStorage). */
  darkMode = false;

  /** Module favorites (persisted). Stores routerLink strings. */
  favoriteModules: Set<string> = new Set();

  /** Command palette (Ctrl+K / ⌘+K). */
  commandPaletteOpen = false;
  commandQuery = '';
  commandActiveIndex = 0;

  /** Smart insights computed from the loaded stats. */
  insights: Insight[] = [];

  // ── Sidebar / shell navigation ────────────────────────────────────────
  /** Mobile drawer open state (visible on small screens). */
  sidebarOpen = false;
  /** Set of submenu group IDs that are currently expanded. Multiple may be open at once. */
  openSubmenus: Set<string> = new Set();

  /** Top-level navigation items shown in the left sidebar (flat, kept for backwards compatibility). */
  navItems: NavItem[] = [];

  /** Sidebar navigation grouped into logical sections for the modern grouped UI. */
  navSections: NavSection[] = [];

  /** Live filter applied to the sidebar (case-insensitive, matches labels and child labels). */
  navFilter: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private currencyService: CurrencyService,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private financeService: FinanceService,
    private subjectService: SubjectService,
    private moduleAccessService: ModuleAccessService,
    private addTeacherModal: AddTeacherModalService
  ) { }

  ngOnInit() {
    this.user = this.authService.getCurrentUser();

    // Teachers use the dedicated Teacher Portal — keep admin/accountant dashboard separate
    if (this.authService.hasRole('teacher') || this.authService.hasRole('hod')) {
      this.router.navigate(['/teacher/dashboard'], { replaceUrl: true });
      return;
    }

    // Load preferences first (theme, favorites, auto-refresh)
    this.loadPreferences();

    // Live clock — updates every second
    this.clockHandle = setInterval(() => {
      this.currentTime = new Date();
    }, 1000);

    // Build sidebar nav based on role
    this.buildNavMenu();

    // Load module access from service
    this.moduleAccessService.loadModuleAccess();
    this.loadSettings();
    this.currencyService.symbol$.subscribe(s => (this.currencySymbol = s));
    if (this.isAdmin() || this.isAccountant()) {
      this.loadStatistics();
    }
  }

  /** Build the left sidebar menu based on the current user's role. */
  private buildNavMenu() {
    const items: NavItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: '🏠', route: '/dashboard' }
    ];

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
    } else if (this.isParent()) {
      items.push(
        { id: 'parent-dash', label: 'My Dashboard', icon: '🏠', route: '/parent/dashboard' },
        { id: 'parent-invoices', label: 'Invoices', icon: '💰', route: '/parent/invoices' },
        { id: 'parent-reports', label: 'Report Cards', icon: '📊', route: '/parent/reports' },
        { id: 'parent-inbox', label: 'Inbox', icon: '✉️', route: '/parent/inbox' },
        {
          id: 'parent-comm', label: 'Communications', icon: '💬',
          children: [
            { label: 'Inbox', icon: '📥', route: '/parent/communications/view' },
            { label: 'Compose', icon: '📤', route: '/parent/communications/send' },
            { label: 'Sent', icon: '📬', route: '/parent/communications/sent' }
          ]
        },
        { id: 'parent-link', label: 'Link Students', icon: '🔗', route: '/parent/link-students' }
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
    this.navSections = this.buildNavSections(items);
    this.autoExpandActiveGroup();
  }

  /**
   * Group the flat `navItems` list into logical sidebar sections so the menu is
   * easier to scan. Section assignment is driven by the item id — anything not
   * matched falls back to "More".
   */
  private buildNavSections(items: NavItem[]): NavSection[] {
    const byId = new Map<string, NavItem>(items.map(i => [i.id, i]));
    const used = new Set<string>();

    const take = (ids: string[]): NavItem[] => {
      const picked: NavItem[] = [];
      for (const id of ids) {
        const it = byId.get(id);
        if (it && !used.has(id)) {
          picked.push(it);
          used.add(id);
        }
      }
      return picked;
    };

    const sections: NavSection[] = [];

    // OVERVIEW — Dashboard / parent dashboard
    const overview = take(['dashboard', 'parent-dash']);
    if (overview.length) {
      sections.push({ id: 'sec-overview', title: 'Overview', icon: '🏠', items: overview });
    }

    // PEOPLE — Registration, parents/students directory
    const people = take(['registration']);
    if (people.length) {
      sections.push({ id: 'sec-people', title: 'People', icon: '👥', items: people });
    }

    // ACADEMICS — Enrolment, attendance, marks, reports, results
    const academics = take(['enrolment', 'attendance', 'marks', 'progress', 'results', 'parent-reports']);
    if (academics.length) {
      sections.push({ id: 'sec-academics', title: 'Academics', icon: '🎓', items: academics });
    }

    // FINANCE — Fees, financial reports, payroll, parent invoices
    const finance = take(['finance', 'financial-reports', 'payroll', 'parent-invoices']);
    if (finance.length) {
      sections.push({ id: 'sec-finance', title: 'Finance', icon: '💰', items: finance });
    }

    // OPERATIONS — Timetable, communication, misc reports, inventory
    const operations = take(['timetable', 'communication', 'reports', 'inventory', 'parent-comm', 'parent-inbox', 'parent-link']);
    if (operations.length) {
      sections.push({ id: 'sec-operations', title: 'Operations', icon: '🧰', items: operations });
    }

    // SYSTEM — admin only
    const system = take(['system-administration']);
    if (system.length) {
      sections.push({ id: 'sec-system', title: 'System', icon: '🛠️', items: system });
    }

    // Anything left over goes into "More" so nothing is hidden by accident
    const leftover = items.filter(i => !used.has(i.id));
    if (leftover.length) {
      sections.push({ id: 'sec-more', title: 'More', icon: '✨', items: leftover });
    }

    return sections;
  }

  /** After the menu is built, auto-expand the section containing the active route. */
  private autoExpandActiveGroup() {
    try {
      const url = (this.router.url || '').split('?')[0];
      if (!url) return;
      for (const item of this.navItems) {
        if (item.children && item.children.length) {
          const match = item.children.some(c => !!c.route && (url === c.route || url.startsWith(c.route + '/')));
          if (match) this.openSubmenus.add(item.id);
        }
      }
    } catch { /* ignore */ }
  }

  // ── Sidebar interactions ──────────────────────────────────────────────
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  toggleSubmenu(id: string) {
    if (this.openSubmenus.has(id)) {
      this.openSubmenus.delete(id);
    } else {
      this.openSubmenus.add(id);
    }
  }

  isSubmenuOpen(id: string): boolean {
    // While the user is searching the sidebar, auto-expand any group that has matches
    // so the filtered items become visible without an extra click.
    if (this.openSubmenus.has(id)) return true;
    const q = (this.navFilter || '').trim();
    if (!q) return false;
    const item = this.navItems.find(i => i.id === id);
    return !!item && this.matchesFilter(item);
  }

  /** True if any child label (or the group label itself) matches `navFilter`. */
  matchesFilter(item: NavItem): boolean {
    const q = (this.navFilter || '').trim().toLowerCase();
    if (!q) return true;
    if ((item.label || '').toLowerCase().includes(q)) return true;
    if (item.children && item.children.some(c => (c.label || '').toLowerCase().includes(q))) return true;
    return false;
  }

  /** Only show children that match the current `navFilter` (used when a query is active). */
  visibleChildren(item: NavItem): NavChild[] {
    const q = (this.navFilter || '').trim().toLowerCase();
    if (!q || !item.children) return item.children || [];
    return item.children.filter(c => (c.label || '').toLowerCase().includes(q));
  }

  /** True if the section has at least one visible item under the current filter. */
  sectionHasVisible(section: NavSection): boolean {
    return section.items.some(i => this.matchesFilter(i));
  }

  /** Reset the live filter (used by the small clear button). */
  clearNavFilter() {
    this.navFilter = '';
  }

  /** Handle clicks on submenu items that map to component actions (e.g. add teacher). */
  runNavAction(action: string | undefined) {
    if (!action) return;
    if (action === 'addTeacher') this.addTeacherModal.open();
    this.closeSidebar();
  }

  openAddTeacherModal(): void {
    this.addTeacherModal.open();
  }

  ngOnDestroy() {
    if (this.headlineRotateInterval) {
      clearInterval(this.headlineRotateInterval);
    }
    if (this.clockHandle) {
      clearInterval(this.clockHandle);
    }
    if (this.autoRefreshHandle) {
      clearInterval(this.autoRefreshHandle);
    }
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
    }
    Object.values(this.countUpHandles).forEach((h: any) => h && clearInterval(h));
    // Remove any global dark mode class so other components are unaffected on leave
    try { document.body.classList.remove('db-dark-body'); } catch { /* ignore */ }
  }

  // ── Global keyboard shortcuts ─────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  handleKeydown(ev: KeyboardEvent) {
    const isCmdK = (ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K');
    if (isCmdK) {
      ev.preventDefault();
      this.toggleCommandPalette();
      return;
    }
    if (this.commandPaletteOpen) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeCommandPalette();
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const list = this.filteredCommandItems();
        if (list.length) this.commandActiveIndex = (this.commandActiveIndex + 1) % list.length;
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        const list = this.filteredCommandItems();
        if (list.length) this.commandActiveIndex = (this.commandActiveIndex - 1 + list.length) % list.length;
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        const list = this.filteredCommandItems();
        const item = list[this.commandActiveIndex];
        if (item) this.runCommand(item);
      }
    }
  }
  
  loadStatistics() {
    this.loadingStats = true;
    this.refreshing = true;
    this.statsLoadRemaining = 5;
    const done = () => {
      this.statsLoadRemaining--;
      if (this.statsLoadRemaining <= 0) {
        this.loadingStats = false;
        this.refreshing = false;
        this.lastUpdated = new Date();
        this.animateStats();
        this.computeInsights();
      }
    };

    this.studentService.getStudents().subscribe({
      next: (students: any[]) => {
        this.allStudents = students || [];
        this.stats.totalStudents = students.length;
        this.stats.dayScholars = students.filter(s => s.studentType === 'Day Scholar').length;
        this.stats.boarders = students.filter(s => s.studentType === 'Boarder').length;
        this.stats.staffChildren = students.filter(s => s.isStaffChild).length;
        this.stats.maleStudents = students.filter(s => (s.gender || '').toLowerCase() === 'male').length;
        this.stats.femaleStudents = students.filter(s => (s.gender || '').toLowerCase() === 'female').length;
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
        this.stats.maleTeachers = teachers.filter((t: any) => (t.gender || '').toLowerCase() === 'male').length;
        this.stats.femaleTeachers = teachers.filter((t: any) => (t.gender || '').toLowerCase() === 'female').length;
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
          this.allInvoices = list;
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
    } else {
      // Skip the 5th loader when not admin/accountant
      done();
    }
  }

  /** Manual refresh button. */
  refreshNow() {
    if (this.refreshing) return;
    if (this.isAdmin() || this.isAccountant()) {
      this.loadStatistics();
    }
    this.resetAutoRefreshCountdown();
  }

  /** Animate displayed counters from current value to target over ~900ms. */
  private animateStats() {
    const targets: any = {
      totalStudents: this.stats.totalStudents,
      totalTeachers: this.stats.totalTeachers,
      totalClasses: this.stats.totalClasses,
      totalSubjects: this.stats.totalSubjects,
      totalInvoices: this.stats.totalInvoices,
      totalBalance: this.stats.totalBalance,
      staffChildren: this.stats.staffChildren
    };
    const durationMs = 900;
    const steps = 30;
    const interval = durationMs / steps;
    Object.keys(targets).forEach((key) => {
      const start = Number(this.displayStats[key]) || 0;
      const end = Number(targets[key]) || 0;
      if (this.countUpHandles[key]) clearInterval(this.countUpHandles[key]);
      let i = 0;
      this.countUpHandles[key] = setInterval(() => {
        i++;
        const t = i / steps;
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        this.displayStats[key] = start + (end - start) * eased;
        if (i >= steps) {
          this.displayStats[key] = end;
          clearInterval(this.countUpHandles[key]);
          this.countUpHandles[key] = null;
        }
      }, interval);
    });
  }

  /** Format a counter value for display (rounded for ints, fixed for currency). */
  fmtCount(key: string, currency = false): string {
    const v = Number(this.displayStats[key]) || 0;
    if (currency) {
      return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Math.round(v).toLocaleString();
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
        this.schoolLogo = String(row?.schoolLogo || '').trim();
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
        this.schoolLogo = '';
        this.academicYear = '';
        this.currentTerm = '';
        this.startHeadlineRotation({});
        // Use default module access from service
        this.moduleAccess = this.moduleAccessService.getModuleAccess();
      }
    });
  }

  /** If the logo URL fails to load, fall back to the default school icon until settings reload. */
  onDashboardLogoError(): void {
    this.schoolLogo = '';
  }

  /** Resolves relative `/uploads/...` and legacy Windows paths against the API origin. */
  getSchoolLogoSrc(): string {
    return resolveSchoolLogoSrc(this.schoolLogo);
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

  /** Build a display name from given / family name parts (no email). */
  private joinPersonName(
    first?: string | null,
    last?: string | null,
    order: 'firstLast' | 'lastFirst' = 'firstLast'
  ): string {
    const f = first != null && String(first).trim() ? String(first).trim() : '';
    const l = last != null && String(last).trim() ? String(last).trim() : '';
    if (order === 'lastFirst') {
      return [l, f].filter(Boolean).join(' ').trim();
    }
    return [f, l].filter(Boolean).join(' ').trim();
  }

  private looksLikeEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
  }

  /** When no person profile name exists, prefer a non-email username, then a role label — not email. */
  private staffDisplayFallback(user: any): string {
    const un = (user.username || '').trim();
    if (un && !this.looksLikeEmail(un)) {
      return un;
    }
    const role = String(user.role || '').toLowerCase();
    const labels: Record<string, string> = {
      superadmin: 'Super administrator',
      admin: 'Administrator',
      accountant: 'Accountant',
      librarian: 'Librarian',
      inventory_clerk: 'Inventory clerk',
      demo_user: 'Demo user',
      hod: 'Head of department',
    };
    return labels[role] || 'Staff';
  }

  getDisplayName(): string {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return 'User';
    }

    // Teachers / HOD — same profile shape as login / teacher portal
    if (user.role === 'teacher' || user.role === 'hod') {
      if (this.teacherName && this.teacherName !== 'Teacher' && this.teacherName.trim()) {
        return this.teacherName;
      }

      if (user.teacher) {
        if (
          user.teacher.fullName &&
          user.teacher.fullName.trim() &&
          user.teacher.fullName !== 'Teacher' &&
          user.teacher.fullName !== 'Account Teacher'
        ) {
          return user.teacher.fullName.trim();
        }

        const extractedName = this.extractTeacherName(user.teacher);
        if (extractedName && extractedName !== 'Teacher' && extractedName.trim()) {
          return extractedName;
        }
      }

      return 'Teacher';
    }

    if (user.role === 'student' && user.student) {
      const n = this.joinPersonName(user.student.firstName, user.student.lastName, 'firstLast');
      if (n) {
        return n;
      }
    }

    if (user.role === 'parent' && user.parent) {
      const n = this.joinPersonName(user.parent.firstName, user.parent.lastName, 'firstLast');
      if (n) {
        return n;
      }
    }

    const anyUser = user as any;
    const direct = this.joinPersonName(anyUser.firstName, anyUser.lastName, 'firstLast');
    if (direct) {
      return direct;
    }

    return this.staffDisplayFallback(user);
  }

  // ── Greeting & live clock helpers ─────────────────────────────────────
  /** Returns time-of-day-aware greeting: morning / afternoon / evening. */
  getGreeting(): string {
    const h = this.currentTime.getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  getGreetingIcon(): string {
    const h = this.currentTime.getHours();
    if (h >= 5 && h < 12) return '☀️';
    if (h >= 12 && h < 17) return '🌤️';
    if (h >= 17 && h < 21) return '🌇';
    return '🌙';
  }

  /** Pretty-formatted live time (HH:MM:SS). */
  getLiveTime(): string {
    return this.currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** Pretty-formatted live date (weekday, month day). */
  getLiveDate(): string {
    return this.currentTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /** Relative time string like "2 min ago". */
  getLastUpdatedLabel(): string {
    if (!this.lastUpdated) return 'never';
    const sec = Math.floor((Date.now() - this.lastUpdated.getTime()) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  // ── Auto-refresh ──────────────────────────────────────────────────────
  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    this.persistPreferences();
    if (this.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    this.resetAutoRefreshCountdown();
    this.autoRefreshHandle = setInterval(() => {
      if (this.isAdmin() || this.isAccountant()) {
        this.loadStatistics();
      }
      this.resetAutoRefreshCountdown();
    }, this.autoRefreshTotalSec * 1000);
    this.countdownHandle = setInterval(() => {
      if (this.autoRefreshCountdown > 0) this.autoRefreshCountdown--;
    }, 1000);
  }

  private stopAutoRefresh() {
    if (this.autoRefreshHandle) { clearInterval(this.autoRefreshHandle); this.autoRefreshHandle = null; }
    if (this.countdownHandle) { clearInterval(this.countdownHandle); this.countdownHandle = null; }
  }

  private resetAutoRefreshCountdown() {
    this.autoRefreshCountdown = this.autoRefreshTotalSec;
  }

  // ── Dark mode ─────────────────────────────────────────────────────────
  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    this.applyDarkMode();
    this.persistPreferences();
  }

  private applyDarkMode() {
    try {
      if (this.darkMode) {
        document.body.classList.add('db-dark-body');
      } else {
        document.body.classList.remove('db-dark-body');
      }
    } catch { /* ignore */ }
  }

  // ── Preferences (dark mode, favorites, auto-refresh) ─────────────────
  private loadPreferences() {
    try {
      const raw = localStorage.getItem('db_prefs_v1');
      if (raw) {
        const p = JSON.parse(raw);
        this.darkMode = !!p.darkMode;
        this.autoRefresh = !!p.autoRefresh;
        if (Array.isArray(p.favorites)) {
          this.favoriteModules = new Set(p.favorites);
        }
      }
      this.applyDarkMode();
      if (this.autoRefresh) this.startAutoRefresh();
    } catch { /* ignore */ }
  }

  private persistPreferences() {
    try {
      const p = {
        darkMode: this.darkMode,
        autoRefresh: this.autoRefresh,
        favorites: Array.from(this.favoriteModules)
      };
      localStorage.setItem('db_prefs_v1', JSON.stringify(p));
    } catch { /* ignore */ }
  }

  // ── Module favorites ──────────────────────────────────────────────────
  isFavorite(routerLink: string): boolean {
    return this.favoriteModules.has(routerLink);
  }

  toggleFavorite(routerLink: string, ev?: Event) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (this.favoriteModules.has(routerLink)) {
      this.favoriteModules.delete(routerLink);
    } else {
      this.favoriteModules.add(routerLink);
    }
    this.persistPreferences();
  }

  // ── Student distribution donut chart helpers ──────────────────────────
  /** SVG circumference for r=40 donut: 2 * PI * r ≈ 251.327. */
  readonly DONUT_C = 251.327;

  getDonutSegment(value: number): { dasharray: string; dashoffset: number; pct: number } {
    const total = this.stats.totalStudents || 0;
    const pct = total > 0 ? (value / total) : 0;
    const filled = this.DONUT_C * pct;
    const empty = this.DONUT_C - filled;
    return { dasharray: `${filled} ${empty}`, dashoffset: 0, pct: Math.round(pct * 100) };
  }

  /** Pre-computed offsets so donut segments don't overlap. */
  getDonutOffset(index: 0 | 1 | 2): number {
    const total = this.stats.totalStudents || 0;
    if (!total) return 0;
    if (index === 0) return 0;
    if (index === 1) return -(this.DONUT_C * (this.stats.dayScholars / total));
    return -(this.DONUT_C * ((this.stats.dayScholars + this.stats.boarders) / total));
  }

  // ── Smart insights ────────────────────────────────────────────────────
  private computeInsights() {
    const out: Insight[] = [];

    // Overdue invoices
    const today = new Date();
    const overdue = (this.allInvoices || []).filter((inv: any) => {
      const bal = parseFloat(String(inv.balance)) || 0;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      return bal > 0 && due && due < today;
    });
    if (overdue.length > 0) {
      out.push({
        id: 'overdue',
        icon: '⏰',
        title: `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}`,
        detail: `${this.currencySymbol} ${overdue.reduce((s: number, i: any) => s + (parseFloat(String(i.balance)) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding past due date.`,
        severity: 'danger',
        route: '/billing',
        cta: 'Open billing'
      });
    }

    // New enrolments this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newThisWeek = (this.allStudents || []).filter((s: any) => {
      const d = s.enrollmentDate || s.createdAt;
      return d && new Date(d) >= weekAgo;
    });
    if (newThisWeek.length > 0) {
      out.push({
        id: 'enrol',
        icon: '🎉',
        title: `${newThisWeek.length} new student${newThisWeek.length === 1 ? '' : 's'} this week`,
        detail: 'Enrolments recorded in the past 7 days.',
        severity: 'success',
        route: '/students',
        cta: 'View students'
      });
    }

    // Collection rate alert
    if (this.stats.totalInvoiced > 0) {
      const rate = this.collectionRatePercent;
      if (rate < 50) {
        out.push({
          id: 'rate-low',
          icon: '📉',
          title: `Collection rate is ${rate}%`,
          detail: 'Below the 50% healthy threshold — consider following up.',
          severity: 'warning',
          route: '/billing',
          cta: 'Review balances'
        });
      } else if (rate >= 90) {
        out.push({
          id: 'rate-high',
          icon: '🏆',
          title: `Collection rate is ${rate}%`,
          detail: 'Excellent! Most invoices have been paid.',
          severity: 'success'
        });
      }
    }

    // Class size pressure
    if (this.stats.totalClasses > 0 && this.stats.totalStudents > 0) {
      const avg = Math.round(this.stats.totalStudents / this.stats.totalClasses);
      if (avg >= 40) {
        out.push({
          id: 'class-size',
          icon: '🏫',
          title: `Avg ${avg} students / class`,
          detail: 'Class density is high — consider adding sections.',
          severity: 'warning',
          route: '/classes/manage',
          cta: 'Manage classes'
        });
      } else {
        out.push({
          id: 'class-size-ok',
          icon: '📈',
          title: `Avg ${avg} students / class`,
          detail: 'Healthy class size across the school.',
          severity: 'info'
        });
      }
    }

    // Staff coverage
    if (this.stats.totalTeachers > 0 && this.stats.totalStudents > 0) {
      const ratio = Math.round(this.stats.totalStudents / this.stats.totalTeachers);
      out.push({
        id: 'student-teacher',
        icon: '👨‍🏫',
        title: `1 teacher per ${ratio} students`,
        detail: ratio > 25 ? 'Ratio is on the high side — consider hiring.' : 'Solid student-teacher ratio.',
        severity: ratio > 25 ? 'warning' : 'info'
      });
    }

    this.insights = out;
  }

  // ── Command palette (Ctrl+K) ──────────────────────────────────────────
  toggleCommandPalette() {
    if (this.commandPaletteOpen) {
      this.closeCommandPalette();
    } else {
      this.openCommandPalette();
    }
  }

  openCommandPalette() {
    this.commandPaletteOpen = true;
    this.commandQuery = '';
    this.commandActiveIndex = 0;
    setTimeout(() => {
      const input = document.getElementById('db-cmd-input');
      if (input) (input as HTMLInputElement).focus();
    }, 50);
  }

  closeCommandPalette() {
    this.commandPaletteOpen = false;
    this.commandQuery = '';
    this.commandActiveIndex = 0;
  }

  onCommandQueryChange() {
    this.commandActiveIndex = 0;
  }

  /** Master list of commands. Filtered against the search query. */
  private getAllCommandItems(): CommandItem[] {
    const items: CommandItem[] = [];

    if (this.isAdmin()) {
      items.push(
        { label: 'Students', icon: '👥', route: '/students', group: 'Modules', keywords: 'pupil learner' },
        { label: 'Add Student', icon: '➕', route: '/students/add-new', group: 'Actions' },
        { label: 'Teachers', icon: '👨‍🏫', route: '/teachers/manage', group: 'Modules' },
        { label: 'Add Teacher', icon: '➕', action: () => this.addTeacherModal.open(), group: 'Actions' },
        { label: 'Classes', icon: '🏫', route: '/classes/manage', group: 'Modules' },
        { label: 'Add Class', icon: '➕', route: '/classes/manage/add-new', group: 'Actions' },
        { label: 'Subjects', icon: '📚', route: '/subjects/new', group: 'Actions' },
        { label: 'Mark Register', icon: '✅', route: '/mark-register', group: 'Actions', keywords: 'attendance' },
        { label: 'Attendance Reports', icon: '📋', route: '/attendance-reports', group: 'Reports' },
        { label: 'Reports Hub', icon: '📊', route: '/reports/manage', group: 'Reports' },
        { label: 'Timetable', icon: '📅', route: '/timetable/config', group: 'Modules' },
        { label: 'Messages', icon: '💬', route: '/communication_manage', group: 'Modules' },
        { label: 'Settings', icon: '⚙️', route: '/settings', group: 'Modules' },
        { label: 'Academic Settings', icon: '🎓', route: '/academic-settings', group: 'Modules' },
        { label: 'Manage Accounts', icon: '👤', route: '/admin/manage-accounts', group: 'Admin' },
        { label: 'Parent Management', icon: '👨‍👩‍👧', route: '/admin/parent-management', group: 'Admin' },
        { label: 'Class Promotion', icon: '⬆️', route: '/admin/class-promotion', group: 'Admin' }
      );
    }
    if (this.isAdmin() || this.isAccountant()) {
      items.push(
        { label: 'Billing', icon: '💳', route: '/billing', group: 'Finance' },
        { label: 'New Invoice', icon: '📝', route: '/invoices/new', group: 'Finance' },
        { label: 'Statements', icon: '📋', route: '/invoices/statements', group: 'Finance' }
      );
    }
    if (this.isInventoryStaff()) {
      items.push({ label: 'Inventory Manager', icon: '📦', route: '/inventory/manage', group: 'Modules' });
    }

    // Utility commands
    items.push(
      { label: this.darkMode ? 'Switch to light mode' : 'Switch to dark mode', icon: this.darkMode ? '☀️' : '🌙', action: () => this.toggleDarkMode(), group: 'Preferences' },
      { label: this.autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh', icon: '🔄', action: () => this.toggleAutoRefresh(), group: 'Preferences' },
      { label: 'Refresh data now', icon: '⟳', action: () => this.refreshNow(), group: 'Preferences' },
      { label: 'Sign out', icon: '🚪', action: () => this.logout(), group: 'Account' }
    );

    // Recent students as quick jump targets
    (this.recentStudents || []).slice(0, 5).forEach((s: any) => {
      items.push({
        label: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student',
        icon: '🧑‍🎓',
        route: `/students/manage/edit/${s.id}`,
        group: 'Students',
        keywords: `${s.studentNumber || ''} ${s.class?.name || ''}`
      });
    });

    return items;
  }

  filteredCommandItems(): CommandItem[] {
    const all = this.getAllCommandItems();
    const q = (this.commandQuery || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(it => {
      const hay = `${it.label} ${it.group} ${it.keywords || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  runCommand(item: CommandItem) {
    this.closeCommandPalette();
    if (item.route) {
      this.router.navigate([item.route]);
    } else if (item.action) {
      item.action();
    }
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

