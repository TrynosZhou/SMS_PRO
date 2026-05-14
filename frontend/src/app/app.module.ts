import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { StudentListComponent } from './components/students/student-list/student-list.component';
import { StudentFormComponent } from './components/students/student-form/student-form.component';
import { StudentsManageComponent } from './components/students/students-manage/students-manage.component';
import { StudentManageAddNewRedirectComponent } from './components/students/student-manage-add-new-redirect/student-manage-add-new-redirect.component';
import { AddTeacherModalComponent } from './components/teachers/add-teacher-modal/add-teacher-modal.component';
import { TeacherFormComponent } from './components/teachers/teacher-form/teacher-form.component';
import { AssignClassesComponent } from './components/teachers/assign-classes/assign-classes.component';
import { AllocateClassComponent } from './components/teachers/allocate-class/allocate-class.component';
import { TeacherSubjectAssignmentComponent } from './components/teachers/teacher-subject-assignment/teacher-subject-assignment.component';
import { TeacherSubjectContactComponent } from './components/teachers/teacher-subject-contact/teacher-subject-contact.component';
import { TeachersManageComponent } from './components/teachers/teachers-manage/teachers-manage.component';
import { ExamListComponent } from './components/exams/exam-list/exam-list.component';
import { ExamsManageComponent } from './components/exams/exams-manage/exams-manage.component';
import { ExamFormComponent } from './components/exams/exam-form/exam-form.component';
import { MarksEntryComponent } from './components/exams/marks-entry/marks-entry.component';
import { ReportCardComponent } from './components/exams/report-card/report-card.component';
import { RankingsComponent } from './components/exams/rankings/rankings.component';
import { MarkSheetComponent } from './components/exams/mark-sheet/mark-sheet.component';
import { MarkDiagnosticComponent } from './components/exams/mark-diagnostic/mark-diagnostic.component';
import { MarkInputProgressComponent } from './components/exams/mark-input-progress/mark-input-progress.component';
import { PublishResultsComponent } from './components/exams/publish-results/publish-results.component';
import { ResultsAnalysisComponent } from './components/exams/results-analysis/results-analysis.component';
import { InvoiceListComponent } from './components/finance/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/finance/invoice-form/invoice-form.component';
import { InvoiceStatementsComponent } from './components/finance/invoice-statements/invoice-statements.component';
import { FinanceManageComponent } from './components/finance/finance-manage/finance-manage.component';
import { FeesComponent } from './components/finance/fees/fees.component';
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { ClassesManageComponent } from './components/classes/classes-manage/classes-manage.component';
import { ClassTeachersComponent } from './components/classes/class-teachers/class-teachers.component';
import { ClassAssignComponent } from './components/classes/class-assign/class-assign.component';
import { ClassSubjectsComponent } from './components/classes/class-subjects/class-subjects.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { SubjectsManageComponent } from './components/subjects/subjects-manage/subjects-manage.component';
import { AssignSubjectComponent } from './components/subjects/assign-subject/assign-subject.component';
import { SubjectPeriodsComponent } from './components/subjects/subject-periods/subject-periods.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { ParentElearningManageComponent } from './components/parent/parent-elearning-manage/parent-elearning-manage.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { CreditNoteComponent } from './components/finance/credit-note/credit-note.component';
import { DebitNoteComponent } from './components/finance/debit-note/debit-note.component';
import { PrepaidAdjustComponent } from './components/finance/prepaid-adjust/prepaid-adjust.component';
import { UniformListComponent } from './components/finance/uniform-list/uniform-list.component';
import { TransferFormComponent } from './components/transfers/transfer-form/transfer-form.component';
import { PromoteStudentsComponent } from './components/students/promote-students/promote-students.component';
import { TransferHistoryComponent } from './components/transfers/transfer-history/transfer-history.component';
import { EnrollStudentComponent } from './components/enrollments/enroll-student/enroll-student.component';
import { UnenrolledStudentsComponent } from './components/enrollments/unenrolled-students/unenrolled-students.component';
import { DHServicesReportComponent } from './components/reports/dh-services-report/dh-services-report.component';
import { TransportServicesReportComponent } from './components/reports/transport-services-report/transport-services-report.component';
import { StudentIdCardsComponent } from './components/reports/student-id-cards/student-id-cards.component';
import { ReportManageComponent } from './components/reports/report-manage/report-manage.component';
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
import { TransactionAuditComponent } from './components/finance/transaction-audit/transaction-audit.component';
import { ExemptionManagementComponent } from './components/finance/exemption-management/exemption-management.component';
import { PayrollManagementComponent } from './components/payroll/payroll-management/payroll-management.component';
import { SalaryAssignmentsComponent } from './components/payroll/salary-assignments/salary-assignments.component';
import { PayrollManageComponent } from './components/payroll/payroll-manage/payroll-manage.component';
import { CommunicationManageShellComponent } from './components/admin/communication-manage-shell/communication-manage-shell.component';
import { CommunicationSendComponent } from './components/admin/communication-send/communication-send.component';
import { CommunicationViewMessagesComponent } from './components/admin/communication-view-messages/communication-view-messages.component';
import { ParentCommunicationsShellComponent } from './components/parent/parent-communications-shell/parent-communications-shell.component';
import { InvoicePdfPreviewComponent } from './components/shared/invoice-pdf-preview/invoice-pdf-preview.component';
import { InventoryManageComponent } from './components/inventory/inventory-manage/inventory-manage.component';
import { StudentInventoryComponent } from './components/student/student-inventory/student-inventory.component';
import { AcademicManageComponent } from './components/academic/academic-manage/academic-manage.component';
import { AcademicTermsComponent } from './components/academic/academic-terms/academic-terms.component';
import { AcademicClassesComponent } from './components/academic/academic-classes/academic-classes.component';
import { AcademicSubjectsComponent } from './components/academic/academic-subjects/academic-subjects.component';
import { AcademicDepartmentsComponent } from './components/academic/academic-departments/academic-departments.component';
import { AcademicReportReleasesComponent } from './components/academic/academic-report-releases/academic-report-releases.component';
import { AcademicGradingComponent } from './components/academic/academic-grading/academic-grading.component';
import { SystemSettingsComponent } from './components/settings/system-settings/system-settings.component';
import { RolesPermissionsComponent } from './components/settings/roles-permissions/roles-permissions.component';
import { IntegrationsComponent } from './components/settings/integrations/integrations.component';
import { FinancialReportsShellComponent } from './components/finance/financial-reports/financial-reports-shell.component';
import { FinancialReportsSectionComponent } from './components/finance/financial-reports/financial-reports-section.component';
import { ManageStudentsComponent } from './components/registration/manage-students/manage-students.component';
import { ManageTeachersComponent } from './components/registration/manage-teachers/manage-teachers.component';
import { ManageClassesComponent } from './components/enrolment/manage-classes/manage-classes.component';
import { ManageTermsComponent } from './components/enrolment/manage-terms/manage-terms.component';
import { EnrolStudentsComponent } from './components/enrolment/enrol-students/enrol-students.component';
import { MigrateClassShellComponent } from './components/enrolment/migrate-class-shell/migrate-class-shell.component';
import { MigrateClassEnrolmentComponent } from './components/enrolment/migrate-class-enrolment/migrate-class-enrolment.component';
import { ClassListsViewComponent } from './components/enrolment/class-lists-view/class-lists-view.component';
import { MarkRegisterComponent } from './components/attendance/mark-register/mark-register.component';
import { AttendanceReportsViewComponent } from './components/attendance/attendance-reports-view/attendance-reports-view.component';
import { MarksInputComponent } from './components/exams/marks-input/marks-input.component';
import { MarksOutletComponent } from './components/exams/marks-outlet/marks-outlet.component';
import { ContinuousAssessmentComponent } from './components/exams/continuous-assessment/continuous-assessment.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    DashboardComponent,
    StudentListComponent,
    StudentFormComponent,
    StudentsManageComponent,
    StudentManageAddNewRedirectComponent,
    AddTeacherModalComponent,
    TeacherFormComponent,
    AssignClassesComponent,
    AllocateClassComponent,
    TeacherSubjectAssignmentComponent,
    TeacherSubjectContactComponent,
    TeachersManageComponent,
    ExamListComponent,
    ExamsManageComponent,
    ExamFormComponent,
    MarksEntryComponent,
    ReportCardComponent,
    MarkSheetComponent,
    MarkDiagnosticComponent,
    MarkInputProgressComponent,
    PublishResultsComponent,
    ResultsAnalysisComponent,
    RankingsComponent,
    InvoiceListComponent,
    InvoiceFormComponent,
    InvoiceStatementsComponent,
    FinanceManageComponent,
    FeesComponent,
    ExemptionManagementComponent,
    ClassListComponent,
    ClassFormComponent,
    ClassListsComponent,
    ClassesManageComponent,
    ClassTeachersComponent,
    ClassAssignComponent,
    ClassSubjectsComponent,
    SubjectListComponent,
    SubjectFormComponent,
    SubjectsManageComponent,
    AssignSubjectComponent,
    SubjectPeriodsComponent,
    SettingsComponent,
    ParentDashboardComponent,
    ParentElearningManageComponent,
    LinkStudentsComponent,
    ManageAccountComponent,
    ManageAccountsComponent,
    ClassPromotionComponent,
    ParentManagementComponent,
    ParentInboxComponent,
    MarkAttendanceComponent,
    AttendanceReportsComponent,
    RecordBookComponent,
    MyClassesComponent,
    TeacherRecordBookComponent,
    TeacherDashboardComponent,
    RecordPaymentComponent,
    OutstandingBalanceComponent,
    BalanceEnquiryComponent,
    CreditNoteComponent,
    DebitNoteComponent,
    PrepaidAdjustComponent,
    UniformListComponent,
    TransferFormComponent,
    TransferHistoryComponent,
    PromoteStudentsComponent,
    EnrollStudentComponent,
    UnenrolledStudentsComponent,
    DHServicesReportComponent,
    TransportServicesReportComponent,
    StudentIdCardsComponent,
    ReportManageComponent,
    SplashComponent,
    TimetableManageComponent,
    TimetableManualAdjustmentsComponent,
    TimetableConfigComponent,
    TimetableViewTimetableComponent,
    TimetableViewComponent,
    StudentDashboardComponent,
    StudentReportCardComponent,
    StudentInvoiceStatementComponent,
    GeneralManageComponent,
    UserLogComponent,
    DepartmentsComponent,
    TransactionAuditComponent,
    PayrollManagementComponent,
    SalaryAssignmentsComponent,
    PayrollManageComponent,
    CommunicationManageShellComponent,
    CommunicationSendComponent,
    CommunicationViewMessagesComponent,
    ParentCommunicationsShellComponent,
    InvoicePdfPreviewComponent,
    InventoryManageComponent,
    StudentInventoryComponent,
    AcademicManageComponent,
    AcademicTermsComponent,
    AcademicClassesComponent,
    AcademicSubjectsComponent,
    AcademicDepartmentsComponent,
    AcademicReportReleasesComponent,
    AcademicGradingComponent,
    SystemSettingsComponent,
    RolesPermissionsComponent,
    IntegrationsComponent,
    FinancialReportsShellComponent,
    FinancialReportsSectionComponent,
    ManageStudentsComponent,
    ManageTeachersComponent,
    ManageClassesComponent,
    ManageTermsComponent,
    EnrolStudentsComponent,
    MigrateClassShellComponent,
    MigrateClassEnrolmentComponent,
    ClassListsViewComponent,
    MarkRegisterComponent,
    AttendanceReportsViewComponent,
    MarksInputComponent,
    MarksOutletComponent,
    ContinuousAssessmentComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

