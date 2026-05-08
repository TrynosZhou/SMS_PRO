import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { StudentListComponent } from './components/students/student-list/student-list.component';
import { StudentFormComponent } from './components/students/student-form/student-form.component';
import { StudentsManageComponent } from './components/students/students-manage/students-manage.component';
import { PromoteStudentsComponent } from './components/students/promote-students/promote-students.component';
import { StudentManageAddNewRedirectComponent } from './components/students/student-manage-add-new-redirect/student-manage-add-new-redirect.component';
import { TeacherListComponent } from './components/teachers/teacher-list/teacher-list.component';
import { TeacherFormComponent } from './components/teachers/teacher-form/teacher-form.component';
import { TeachersManageComponent } from './components/teachers/teachers-manage/teachers-manage.component';
import { AssignClassesComponent } from './components/teachers/assign-classes/assign-classes.component';
import { AllocateClassComponent } from './components/teachers/allocate-class/allocate-class.component';
import { TeacherSubjectAssignmentComponent } from './components/teachers/teacher-subject-assignment/teacher-subject-assignment.component';
import { TeacherSubjectContactComponent } from './components/teachers/teacher-subject-contact/teacher-subject-contact.component';
import { ExamListComponent } from './components/exams/exam-list/exam-list.component';
import { ExamFormComponent } from './components/exams/exam-form/exam-form.component';
import { MarksEntryComponent } from './components/exams/marks-entry/marks-entry.component';
import { ReportCardComponent } from './components/exams/report-card/report-card.component';
import { RankingsComponent } from './components/exams/rankings/rankings.component';
import { MarkSheetComponent } from './components/exams/mark-sheet/mark-sheet.component';
import { MarkInputProgressComponent } from './components/exams/mark-input-progress/mark-input-progress.component';
import { PublishResultsComponent } from './components/exams/publish-results/publish-results.component';
import { ExamsManageComponent } from './components/exams/exams-manage/exams-manage.component';
import { ResultsAnalysisComponent } from './components/exams/results-analysis/results-analysis.component';
import { InvoiceListComponent } from './components/finance/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/finance/invoice-form/invoice-form.component';
import { InvoiceStatementsComponent } from './components/finance/invoice-statements/invoice-statements.component';
import { FinanceManageComponent } from './components/finance/finance-manage/finance-manage.component';
import { FeesComponent } from './components/finance/fees/fees.component';
import { ExemptionManagementComponent } from './components/finance/exemption-management/exemption-management.component';
import { CreditNoteComponent } from './components/finance/credit-note/credit-note.component';
import { DebitNoteComponent } from './components/finance/debit-note/debit-note.component';
import { PrepaidAdjustComponent } from './components/finance/prepaid-adjust/prepaid-adjust.component';
import { UniformListComponent } from './components/finance/uniform-list/uniform-list.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { TransactionAuditComponent } from './components/finance/transaction-audit/transaction-audit.component';
import { FinancialReportsShellComponent } from './components/finance/financial-reports/financial-reports-shell.component';
import { FinancialReportsSectionComponent } from './components/finance/financial-reports/financial-reports-section.component';
import { FinancialReportsResolver } from './resolvers/financial-reports.resolver';
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { ClassTeachersComponent } from './components/classes/class-teachers/class-teachers.component';
import { ClassAssignComponent } from './components/classes/class-assign/class-assign.component';
import { ClassSubjectsComponent } from './components/classes/class-subjects/class-subjects.component';
import { ClassesManageComponent } from './components/classes/classes-manage/classes-manage.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { SubjectsManageComponent } from './components/subjects/subjects-manage/subjects-manage.component';
import { AssignSubjectComponent } from './components/subjects/assign-subject/assign-subject.component';
import { SubjectPeriodsComponent } from './components/subjects/subject-periods/subject-periods.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { ParentElearningManageComponent } from './components/parent/parent-elearning-manage/parent-elearning-manage.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { ElearningComponent } from './components/elearning/elearning.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { EtaskComponent } from './components/teacher/etask/etask.component';
import { EtaskSubmissionsComponent } from './components/teacher/etask-submissions/etask-submissions.component';
import { TeacherElearningManageComponent } from './components/teacher/teacher-elearning-manage/teacher-elearning-manage.component';
import { TeacherElearningLegacyRedirectComponent } from './components/teacher/teacher-elearning-manage/teacher-elearning-legacy-redirect.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { StudentElearningShellComponent } from './components/student/student-elearning-shell/student-elearning-shell.component';
import { StudentElearnHubComponent } from './components/student/student-elearn/student-elearn-hub/student-elearn-hub.component';
import { StudentElearnViewTasksComponent } from './components/student/student-elearn/student-elearn-view-tasks/student-elearn-view-tasks.component';
import { StudentElearnSubmitTaskComponent } from './components/student/student-elearn/student-elearn-submit-task/student-elearn-submit-task.component';
import { TransferFormComponent } from './components/transfers/transfer-form/transfer-form.component';
import { TransferHistoryComponent } from './components/transfers/transfer-history/transfer-history.component';
import { EnrollStudentComponent } from './components/enrollments/enroll-student/enroll-student.component';
import { UnenrolledStudentsComponent } from './components/enrollments/unenrolled-students/unenrolled-students.component';
import { DHServicesReportComponent } from './components/reports/dh-services-report/dh-services-report.component';
import { TransportServicesReportComponent } from './components/reports/transport-services-report/transport-services-report.component';
import { StudentIdCardsComponent } from './components/reports/student-id-cards/student-id-cards.component';
import { ReportManageComponent } from './components/reports/report-manage/report-manage.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { ModuleAccessGuard } from './guards/module-access.guard';
import { SplashComponent } from './components/splash/splash.component';
import { TimetableConfigComponent } from './components/timetable/timetable-config/timetable-config.component';
import { TimetableViewComponent } from './components/timetable/timetable-view/timetable-view.component';
import { TimetableManageComponent } from './components/timetable/timetable-manage/timetable-manage.component';
import { TimetableManualAdjustmentsComponent } from './components/timetable/timetable-manual-adjustments/timetable-manual-adjustments.component';
import { TimetableViewTimetableComponent } from './components/timetable/timetable-view-timetable/timetable-view-timetable.component';
import { StudentDashboardComponent } from './components/student/student-dashboard/student-dashboard.component';
import { StudentReportCardComponent } from './components/student/student-report-card/student-report-card.component';
import { StudentInvoiceStatementComponent } from './components/student/student-invoice-statement/student-invoice-statement.component';
import { UserLogComponent } from './components/settings/user-log/user-log.component';
import { GeneralManageComponent } from './components/settings/general-manage/general-manage.component';
import { DepartmentsComponent } from './components/settings/departments/departments.component';
import { PayrollManagementComponent } from './components/payroll/payroll-management/payroll-management.component';
import { SalaryAssignmentsComponent } from './components/payroll/salary-assignments/salary-assignments.component';
import { PayrollManageComponent } from './components/payroll/payroll-manage/payroll-manage.component';
import { CommunicationManageShellComponent } from './components/admin/communication-manage-shell/communication-manage-shell.component';
import { CommunicationSendComponent } from './components/admin/communication-send/communication-send.component';
import { CommunicationViewMessagesComponent } from './components/admin/communication-view-messages/communication-view-messages.component';
import { ParentCommunicationsShellComponent } from './components/parent/parent-communications-shell/parent-communications-shell.component';
import { InventoryManageComponent } from './components/inventory/inventory-manage/inventory-manage.component';
import { StudentInventoryComponent } from './components/student/student-inventory/student-inventory.component';
import { InventoryAccessGuard } from './guards/inventory-access.guard';
import { AcademicManageComponent } from './components/academic/academic-manage/academic-manage.component';
import { AcademicTermsComponent } from './components/academic/academic-terms/academic-terms.component';
import { AcademicClassesComponent } from './components/academic/academic-classes/academic-classes.component';
import { AcademicSubjectsComponent } from './components/academic/academic-subjects/academic-subjects.component';
import { AcademicReportReleasesComponent } from './components/academic/academic-report-releases/academic-report-releases.component';
import { AcademicGradingComponent } from './components/academic/academic-grading/academic-grading.component';
import { SystemSettingsComponent } from './components/settings/system-settings/system-settings.component';
import { RolesPermissionsComponent } from './components/settings/roles-permissions/roles-permissions.component';

const routes: Routes = [
  { path: '', component: SplashComponent },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/dashboard', component: ParentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/elearning-manage', redirectTo: '/parent/all_in_one', pathMatch: 'full' },
  { path: 'parent/all_in_one', component: ParentElearningManageComponent, canActivate: [AuthGuard] },
  { path: 'teacher/dashboard', component: TeacherDashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/inbox', component: ParentInboxComponent, canActivate: [AuthGuard] },
  {
    path: 'parent/communications',
    component: ParentCommunicationsShellComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'view' },
      {
        path: 'view',
        component: ParentInboxComponent,
        data: { parentCommHub: true, parentCommSegment: 'inbox' },
      },
      {
        path: 'send',
        component: ParentInboxComponent,
        data: { parentCommHub: true, parentCommSegment: 'compose' },
      },
      {
        path: 'sent',
        component: ParentInboxComponent,
        data: { parentCommHub: true, parentCommSegment: 'outbox' },
      },
    ],
  },
  { path: 'parent/link-students', component: LinkStudentsComponent, canActivate: [AuthGuard] },
  { path: 'parent/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'teacher/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  {
    path: 'teacher/elearning-manage',
    component: TeacherElearningManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tasks' },
      {
        path: 'tasks',
        component: EtaskComponent,
        canActivate: [AuthGuard, ModuleAccessGuard],
        data: { module: 'recordBook' },
      },
      {
        path: 'submissions',
        component: EtaskSubmissionsComponent,
        canActivate: [AuthGuard, ModuleAccessGuard],
        data: { module: 'recordBook' },
      },
      { path: 'record-book', component: RecordBookComponent, canActivate: [AuthGuard] },
      { path: 'my-classes', component: MyClassesComponent, canActivate: [AuthGuard] },
    ],
  },
  {
    path: 'teacher/record-book',
    component: TeacherElearningLegacyRedirectComponent,
    canActivate: [AuthGuard],
    data: { elearningSegment: 'record-book' },
  },
  {
    path: 'teacher/my-classes',
    component: TeacherElearningLegacyRedirectComponent,
    canActivate: [AuthGuard],
    data: { elearningSegment: 'my-classes' },
  },
  {
    path: 'etask/submissions',
    component: TeacherElearningLegacyRedirectComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { elearningSegment: 'submissions', module: 'recordBook' },
  },
  {
    path: 'etask',
    component: TeacherElearningLegacyRedirectComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { elearningSegment: 'tasks', module: 'recordBook' },
  },
  { path: 'admin/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-accounts', component: ManageAccountsComponent, canActivate: [AuthGuard] },
  { path: 'admin/class-promotion', component: ClassPromotionComponent, canActivate: [AuthGuard] },
  { path: 'elearning', component: ElearningComponent, canActivate: [AuthGuard] },
  { path: 'admin/parent-management', component: ParentManagementComponent, canActivate: [AuthGuard] },
  {
    path: 'communication_manage',
    component: CommunicationManageShellComponent,
    canActivate: [AuthGuard, AdminOnlyGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'send' },
      { path: 'send', component: CommunicationSendComponent },
      { path: 'view', component: CommunicationViewMessagesComponent },
    ],
  },
  { path: 'admin/teacher-record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
  {
    path: 'students/manage',
    component: StudentsManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'students' },
      {
        path: 'add-new',
        component: StudentManageAddNewRedirectComponent,
        canActivate: [AuthGuard],
      },
      { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
      { path: 'enroll', component: EnrollStudentComponent, canActivate: [AuthGuard] },
      { path: 'unenrolled', component: UnenrolledStudentsComponent, canActivate: [AuthGuard] },
      { path: 'transfer', component: TransferFormComponent, canActivate: [AuthGuard] },
      { path: 'promote', component: PromoteStudentsComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: StudentFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'students_manage', redirectTo: 'students/manage', pathMatch: 'full' },
  { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
  { path: 'students/new', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/:id/edit', component: StudentFormComponent, canActivate: [AuthGuard] },
  {
    path: 'teachers/manage',
    component: TeachersManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'teachers' },
      { path: 'add-new', component: TeacherFormComponent, canActivate: [AuthGuard] },
      { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
      { path: 'assign-classes', component: AssignClassesComponent, canActivate: [AuthGuard] },
      {
        path: 'teacher_subject/contact/:teacherId',
        component: TeacherSubjectContactComponent,
        canActivate: [AuthGuard],
      },
      { path: 'teacher_subject', component: TeacherSubjectAssignmentComponent, canActivate: [AuthGuard] },
      { path: 'allocate_class', component: AllocateClassComponent, canActivate: [AuthGuard] },
      { path: 'record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: TeacherFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'teacher_manage', redirectTo: 'teachers/manage', pathMatch: 'full' },
  { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
  { path: 'teachers/new', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/:id/edit', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/assign-classes', component: AssignClassesComponent, canActivate: [AuthGuard] },
  { path: 'teachers/allocate_class', component: AllocateClassComponent, canActivate: [AuthGuard] },
  {
    path: 'exams/manage',
    component: ExamsManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'marks-capturing' },
      { path: 'marks-capturing', component: ExamListComponent, canActivate: [AuthGuard] },
      { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard] },
      { path: 'mark-input-progress', component: MarkInputProgressComponent, canActivate: [AuthGuard] },
      { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard] },
      { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard] },
      { path: 'results-analysis', component: ResultsAnalysisComponent, canActivate: [AuthGuard] },
      { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard] },
      { path: 'new', component: ExamFormComponent, canActivate: [AuthGuard] },
      { path: ':id/marks', component: MarksEntryComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'exam_manage', redirectTo: 'exams/manage', pathMatch: 'full' },
  { path: 'exams', component: ExamListComponent, canActivate: [AuthGuard] },
  { path: 'exams/new', component: ExamFormComponent, canActivate: [AuthGuard] },
  { path: 'exams/mark-input-progress', component: MarkInputProgressComponent, canActivate: [AuthGuard] },
  { path: 'exams/:id/marks', component: MarksEntryComponent, canActivate: [AuthGuard] },
  { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard] },
  { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard] },
  { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard] },
  { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard] },
  {
    path: 'finance/manage',
    component: FinanceManageComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'finance' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'fees' },
      { path: 'fees', component: FeesComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'exemptions', component: ExemptionManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'billing', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'record-payment', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'balance-enquiry', component: BalanceEnquiryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'unpaid-invoices', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'system-audit', component: TransactionAuditComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      {
        path: 'reports',
        component: FinancialReportsShellComponent,
        resolve: { bundle: FinancialReportsResolver },
        runGuardsAndResolvers: 'paramsChange' as const,
        canActivate: [AuthGuard, ModuleAccessGuard],
        data: { module: 'finance' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'student-ledgers' },
          { path: 'student-ledgers', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'student-ledgers' } },
          { path: 'fees-collection', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'fees-collection' } },
          { path: 'outstanding-fees', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'outstanding-fees' } },
          { path: 'exemptions', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'exemptions' } },
          { path: 'aged-debtors', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'aged-debtors' } },
          { path: 'enrolment-vs-billing', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'enrolment-vs-billing' } },
          { path: 'revenue-recognition', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'revenue-recognition' } },
          { path: 'student-reconciliation', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'student-reconciliation' } },
          { path: 'analytics-forecasts', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'analytics-forecasts' } },
          { path: 'class-reconciliation', component: FinancialReportsSectionComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', report: 'class-reconciliation' } },
        ],
      },
    ],
  },
  { path: 'finance_manage', redirectTo: 'finance/manage', pathMatch: 'full' },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/new', component: InvoiceFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/statements', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/creditnote', component: CreditNoteComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/debitnote', component: DebitNoteComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/prepaid_adjust', component: PrepaidAdjustComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/uniform_list', component: UniformListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payments/record', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'outstanding-balance', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'balance_enquiry', component: BalanceEnquiryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'audit_log', component: TransactionAuditComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  {
    path: 'payroll/manage',
    component: PayrollManageComponent,
    canActivate: [AuthGuard, ModuleAccessGuard],
    data: { module: 'finance' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'overview' } },
      { path: 'employees', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'employees' } },
      { path: 'structures/new', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'new' } },
      { path: 'structures', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'list' } },
      { path: 'assignments', component: SalaryAssignmentsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
      { path: 'process', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'process' } },
      { path: 'leave', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'leave' } },
      { path: 'payslips', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'payslips' } },
      { path: 'reports', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'reports' } },
    ],
  },
  { path: 'payroll_manage', redirectTo: 'payroll/manage', pathMatch: 'full' },
  { path: 'payroll', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'overview' } },
  { path: 'payroll/employees', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'employees' } },
  { path: 'payroll/structures/new', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'new' } },
  { path: 'payroll/structures', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'list' } },
  { path: 'payroll/assignments', component: SalaryAssignmentsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payroll/process', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'process' } },
  { path: 'payroll/leave', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'leave' } },
  { path: 'payroll/payslips', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'payslips' } },
  { path: 'payroll/reports', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'reports' } },
  {
    path: 'classes/manage',
    component: ClassesManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'classes' },
      { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
      {
        path: 'class-teachers',
        component: ClassTeachersComponent,
        canActivate: [AuthGuard],
      },
      { path: 'lists', component: ClassListsComponent, canActivate: [AuthGuard] },
      { path: 'mark-register', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
      { path: 'assign-teachers', component: ClassAssignComponent, canActivate: [AuthGuard] },
      { path: 'assign-teachers/:classId/lessons', component: ClassSubjectsComponent, canActivate: [AuthGuard] },
      { path: 'add-new', component: ClassFormComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: ClassFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'class_manage', redirectTo: 'classes/manage', pathMatch: 'full' },
  { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
  { path: 'classes/new', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/:id/edit', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/lists', component: ClassListsComponent, canActivate: [AuthGuard] },
  {
    path: 'subjects/manage',
    component: SubjectsManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'manage-subject' },
      { path: 'manage-subject', component: SubjectListComponent, canActivate: [AuthGuard] },
      { path: 'assign-subject', component: AssignSubjectComponent, canActivate: [AuthGuard] },
      { path: 'subject-periods', component: SubjectPeriodsComponent, canActivate: [AuthGuard] },
      { path: 'add-new', component: SubjectFormComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: SubjectFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'subject_manage', redirectTo: 'subjects/manage', pathMatch: 'full' },
  { path: 'subjects', component: SubjectListComponent, canActivate: [AuthGuard] },
  { path: 'subjects/new', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/:id/edit', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'schools', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'attendance/mark', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
  { path: 'attendance/reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
  { path: 'transfers/new', component: TransferFormComponent, canActivate: [AuthGuard] },
  { path: 'transfers/history', component: TransferHistoryComponent, canActivate: [AuthGuard] },
  { path: 'transfers', redirectTo: '/transfers/history', pathMatch: 'full' },
  { path: 'student-management/transfer', component: TransferFormComponent, canActivate: [AuthGuard] },
  { path: 'enrollments/new', component: EnrollStudentComponent, canActivate: [AuthGuard] },
  { path: 'enrollments/unenrolled', component: UnenrolledStudentsComponent, canActivate: [AuthGuard] },
  { path: 'enrollments', redirectTo: '/enrollments/unenrolled', pathMatch: 'full' },
  { path: 'reports/dh-services', component: DHServicesReportComponent, canActivate: [AuthGuard] },
  {
    path: 'reports/manage',
    component: ReportManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'transport-services' },
      { path: 'transport-services', component: TransportServicesReportComponent, canActivate: [AuthGuard] },
      { path: 'student-id-cards', component: StudentIdCardsComponent, canActivate: [AuthGuard] },
      { path: 'attendance-reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'report_manage', redirectTo: 'reports/manage', pathMatch: 'full' },
  { path: 'reports/transport-services', component: TransportServicesReportComponent, canActivate: [AuthGuard] },
  { path: 'reports/student-id-cards', component: StudentIdCardsComponent, canActivate: [AuthGuard] },
  {
    path: 'timetable/manage',
    component: TimetableManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'view' },
      { path: 'config', component: TimetableConfigComponent, canActivate: [AuthGuard] },
      { path: 'manual', component: TimetableManualAdjustmentsComponent, canActivate: [AuthGuard] },
      { path: 'view_timetable', component: TimetableViewTimetableComponent, canActivate: [AuthGuard] },
      { path: 'view', component: TimetableViewComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'timetable_manage', redirectTo: 'timetable/manage', pathMatch: 'full' },
  { path: 'timetable/config', component: TimetableConfigComponent, canActivate: [AuthGuard] },
  { path: 'timetable', component: TimetableViewComponent, canActivate: [AuthGuard] },
    {
      path: 'general/manage',
      component: GeneralManageComponent,
      canActivate: [AuthGuard],
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'school-settings' },
        { path: 'school-settings', component: SettingsComponent, canActivate: [AuthGuard] },
        { path: 'departments', component: DepartmentsComponent, canActivate: [AuthGuard] },
        { path: 'user-management', component: ManageAccountsComponent, canActivate: [AuthGuard] },
        { path: 'parent-management', component: ParentManagementComponent, canActivate: [AuthGuard] },
        { path: 'activity-log', component: UserLogComponent, canActivate: [AuthGuard] },
        { path: 'system-settings', component: SystemSettingsComponent, canActivate: [AuthGuard] },
        { path: 'roles-permissions', component: RolesPermissionsComponent, canActivate: [AuthGuard] },
        {
          path: 'academic',
          component: AcademicManageComponent,
          canActivate: [AuthGuard],
          children: [
            { path: '', pathMatch: 'full', redirectTo: 'terms' },
            { path: 'terms', component: AcademicTermsComponent, canActivate: [AuthGuard] },
            { path: 'classes', component: AcademicClassesComponent, canActivate: [AuthGuard] },
            { path: 'subjects', component: AcademicSubjectsComponent, canActivate: [AuthGuard] },
            { path: 'report-releases', component: AcademicReportReleasesComponent, canActivate: [AuthGuard] },
            { path: 'grading', component: AcademicGradingComponent, canActivate: [AuthGuard] },
          ],
        },
      ],
    },
  { path: 'general_manage', redirectTo: 'general/manage', pathMatch: 'full' },
  { path: 'academic/manage', redirectTo: '/general/manage/academic', pathMatch: 'full' },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  { path: 'user_log', component: UserLogComponent, canActivate: [AuthGuard] },
  { path: 'student/dashboard', component: StudentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'student/report-card', component: StudentReportCardComponent, canActivate: [AuthGuard] },
  { path: 'student/invoice-statement', component: StudentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'student/inventory', component: StudentInventoryComponent, canActivate: [AuthGuard] },
  {
    path: 'inventory/manage',
    component: InventoryManageComponent,
    canActivate: [AuthGuard, InventoryAccessGuard],
  },
  {
    path: 'teacher/inventory_manage',
    component: InventoryManageComponent,
    canActivate: [AuthGuard, InventoryAccessGuard],
  },
  {
    path: 'student/elearning',
    component: StudentElearningShellComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'elearn' },
      {
        path: 'elearn',
        component: StudentElearnHubComponent,
        canActivate: [AuthGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'view-task' },
          { path: 'view-task', component: StudentElearnViewTasksComponent, canActivate: [AuthGuard] },
          { path: 'submit-task', component: StudentElearnSubmitTaskComponent, canActivate: [AuthGuard] },
        ],
      },
    ],
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule { }

