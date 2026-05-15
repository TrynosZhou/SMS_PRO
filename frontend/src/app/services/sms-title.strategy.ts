import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DefaultTitleStrategy, RouterStateSnapshot } from '@angular/router';

/** Shown when no friendlier title can be derived (splash, unknown). */
const DEFAULT_BRAND = 'School Management System';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Full path (no leading slash, no query) → tab title. UUID segments are collapsed to `:id` before lookup.
 */
const PATH_TITLES: Record<string, string> = {
  '': 'Welcome',
  login: 'Login',
  dashboard: 'Dashboard',
  'migrate-class': 'Class moves & promotion',
  'migrate-class/promote': 'Promote Students',
  'migrate-class/enrolment': 'Migrate Class Enrolment',
  'parent/dashboard': 'Parent dashboard',
  'parent/all_in_one': 'Parent e-learning',
  'parent/inbox': 'Parent inbox',
  'parent/link-students': 'Link students',
  'parent/manage-account': 'Manage account',
  'parent/communications/view': 'Messages — inbox',
  'parent/communications/send': 'Messages — compose',
  'parent/communications/sent': 'Messages — sent',
  'teacher/dashboard': 'Teacher dashboard',
  'teacher/manage-account': 'Manage account',
  'teacher/record-book': 'Record book',
  'teacher/my-classes': 'My classes',
  'student/dashboard': 'Student dashboard',
  'student/report-card': 'Report card',
  'student/invoice-statement': 'Invoice statement',
  'student/inventory': 'Inventory',
  'admin/manage-account': 'Manage account',
  'admin/manage-accounts': 'Manage accounts',
  'admin/class-promotion': 'Class promotion',
  'admin/parent-management': 'Parent management',
  'admin/teacher-record-book': 'Teacher record book',
  'communication_manage/send': 'Send communication',
  'communication_manage/view': 'View messages',
  students: 'Students',
  'students/new': 'Add student',
  'students/:id/edit': 'Edit student',
  teachers: 'Teachers',
  'teachers/:id/edit': 'Edit teacher',
  parents: 'Parents',
  departments: 'Departments',
  classes: 'Classes',
  'classes/new': 'Add class',
  'classes/:id/edit': 'Edit class',
  'classes/lists': 'Class lists',
  terms: 'Terms',
  enrol: 'Enrol students',
  'class-lists': 'Class lists',
  'assign-classes': 'Assign classes',
  teacher_subject: 'Teacher subject assignment',
  allocate_class: 'Allocate class',
  exams: 'Exams',
  'exams/new': 'Add exam',
  'exams/:id/marks': 'Marks entry',
  'marks-progress': 'Marks progress',
  reports: 'Report cards',
  'mark-sheets': 'Mark sheets',
  'mark-diagnostic': 'Marks diagnostics',
  'marks/continuous': 'Continuous assessment',
  'termly-results': 'Termly results',
  ranking: 'Rankings',
  'publish-results': 'Publish results',
  finance: 'Fees',
  exemptions: 'Exemptions',
  billing: 'Billing',
  'balance-enquiry': 'Balance enquiry',
  'unpaid-invoices': 'Unpaid invoices',
  'record-payment': 'Record payment',
  'student-ledgers': 'Student ledgers',
  'fees-collection': 'Fees collection',
  'outstanding-fees': 'Outstanding fees',
  'exemptions-report': 'Exemptions report',
  'aged-debtors': 'Aged debtors',
  'enrolment-vs-billing': 'Enrolment vs billing',
  'revenue-recognition': 'Revenue recognition',
  'student-reconciliation': 'Student reconciliation',
  'analytics-forecasts': 'Analytics & forecasts',
  'class-reconciliation': 'Class reconciliation',
  invoices: 'Invoices',
  'invoices/new': 'New invoice',
  'invoices/statements': 'Invoice statements',
  'invoices/creditnote': 'Credit note',
  'invoices/debitnote': 'Debit note',
  'invoices/prepaid_adjust': 'Prepaid adjust',
  'invoices/uniform_list': 'Uniform list',
  'payments/record': 'Record payment',
  'outstanding-balance': 'Outstanding balance',
  balance_enquiry: 'Balance enquiry',
  audit_log: 'Transaction audit',
  'payroll/overview': 'Payroll — overview',
  'payroll/manage/employees': 'Payroll — employees',
  'payroll/manage/structures/new': 'Payroll — new structure',
  'payroll/manage/structures': 'Payroll — structures',
  'payroll/manage/assignments': 'Salary assignments',
  'payroll/manage/process': 'Payroll — process',
  'payroll/manage/leave': 'Payroll — leave',
  'payroll/manage/payslips': 'Payroll — payslips',
  'payroll/manage/reports': 'Payroll — reports',
  payroll: 'Payroll',
  'payroll/employees': 'Payroll — employees',
  'payroll/structures/new': 'Payroll — new structure',
  'payroll/structures': 'Payroll — structures',
  'payroll/assignments': 'Salary assignments',
  'payroll/process': 'Payroll — process',
  'payroll/leave': 'Payroll — leave',
  'payroll/payslips': 'Payroll — payslips',
  'payroll/reports': 'Payroll — reports',
  'classes/manage/classes': 'Manage classes',
  'classes/manage/lists': 'Class lists',
  'classes/manage/mark-register': 'Mark register',
  'classes/manage/add-new': 'Add class',
  'classes/manage/edit/:id': 'Edit class',
  'classes/manage/assign-teachers/:classId/lessons': 'Class subjects',
  'class-teachers': 'Class teachers',
  'assign-teachers': 'Assign teachers',
  'assign-teachers/:classId/lessons': 'Class subjects',
  subjects: 'Subjects',
  'subjects/new': 'Add subject',
  'subjects/:id/edit': 'Edit subject',
  'subjects/manage/manage-subject': 'Manage subjects',
  'subjects/manage/add-new': 'Add subject',
  'subjects/manage/edit/:id': 'Edit subject',
  'assign-subject': 'Assign subject',
  'subject-periods': 'Subject periods',
  'mark-register': 'Mark register',
  'marks-input': 'Marks input',
  'attendance-reports': 'Attendance reports',
  'attendance/reports': 'Attendance reports',
  'attendance/mark': 'Mark attendance',
  'transfers/new': 'New transfer',
  'transfers/history': 'Transfer history',
  'student-management/transfer': 'Student transfer',
  'enrollments/new': 'Enrol student',
  'enrollments/unenrolled': 'Unenrolled students',
  'reports/dh-services': 'DH services report',
  'reports/manage/transport-services': 'Transport services report',
  'reports/manage/student-id-cards': 'Student ID cards',
  'reports/manage/attendance-reports': 'Attendance reports',
  'reports/transport-services': 'Transport services report',
  'reports/student-id-cards': 'Student ID cards',
  'timetable/config': 'Timetable config',
  timetable: 'Timetable',
  manual: 'Timetable manual adjustments',
  view_timetable: 'View timetable',
  view: 'Timetable view',
  'general/manage/school-settings': 'School settings',
  'general/manage/parent-management': 'Parent management',
  'user-management': 'User management',
  'system/roles': 'Roles & permissions',
  'system/integrations': 'Integrations',
  'system-settings': 'System settings',
  'audit-logs': 'Activity log',
  settings: 'Settings',
  user_log: 'User log',
  'academic-settings/terms': 'Academic terms',
  'academic-settings/classes': 'Academic classes',
  'academic-settings/subjects': 'Academic subjects',
  'academic-settings/departments': 'Academic departments',
  'academic-settings/report-releases': 'Report releases',
  'academic-settings/grading': 'Grading',
  'inventory/manage': 'Inventory',
  'teacher/inventory_manage': 'Inventory',
  'students/manage/enroll': 'Enrol student',
  'students/add-new': 'Add student',
  'students/manage/unenrolled': 'Unenrolled students',
  'students/manage/transfer': 'Transfer students',
  'students/manage/promote': 'Promote students',
  'students/manage/edit/:id': 'Edit student',
  'teachers/add-new': 'Add teacher',
  'teachers/manage/record-book': 'Teacher record book',
  'teachers/manage/edit/:id': 'Edit teacher',
  'teachers/manage/teacher_subject/contact/:id': 'Teacher contact',
  'classes/manage/assign-teachers/:id/lessons': 'Class subjects',
  'assign-teachers/:id/lessons': 'Class subjects',
  'exams/manage/publish-results': 'Publish results',
  'exams/manage/new': 'Add exam',
  'exams/manage/:id/marks': 'Marks entry',
  'finance/manage/system-audit': 'System audit',
};

const SKIP_SEGMENTS = new Set([':id', ':teacherId', ':classId', ':section']);

function collapseParams(path: string): string {
  return path.replace(UUID_RE, ':id');
}

function humanizePath(path: string): string {
  const parts = path.split('/').filter(Boolean).filter((p) => !SKIP_SEGMENTS.has(p));
  if (parts.length === 0) return '';
  return parts
    .map((seg) =>
      seg
        .split(/[-_]/g)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    )
    .join(' · ');
}

/**
 * Extends the default Angular title resolver and always sets a non-empty document title.
 */
@Injectable()
export class SmsTitleStrategy extends DefaultTitleStrategy {
  constructor(private readonly browserTitle: Title) {
    super(browserTitle);
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const fromRoutes = this.buildTitle(snapshot);
    const raw = (snapshot.url || '/').split('?')[0].split('#')[0];
    const path = raw.replace(/^\/+|\/+$/g, '');
    const collapsed = collapseParams(path);

    let page =
      (fromRoutes && String(fromRoutes).trim()) ||
      PATH_TITLES[collapsed] ||
      PATH_TITLES[path] ||
      '';

    if (!page) {
      page = humanizePath(collapsed);
    }

    const finalTitle = page.trim() || DEFAULT_BRAND;
    this.browserTitle.setTitle(finalTitle);
  }
}
