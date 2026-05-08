import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { PayrollService } from '../../../services/payroll.service';
import { AuthService } from '../../../services/auth.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError, filter } from 'rxjs/operators';

type PayrollTab = 'overview' | 'employees' | 'structures' | 'process' | 'leave' | 'payslips' | 'reports';

@Component({
  selector: 'app-payroll-management',
  templateUrl: './payroll-management.component.html',
  styleUrls: ['./payroll-management.component.css']
})
export class PayrollManagementComponent implements OnInit, OnDestroy {
  tab: PayrollTab = 'employees';

  // Overview
  overviewMonth = new Date().getMonth() + 1;
  overviewYear = new Date().getFullYear();
  overviewLoading = false;
  overviewError = '';
  overviewSummary: any = null;
  overviewRecentRuns: any[] = [];
  overviewTotalRuns = 0;
  overviewStructuresCount = 0;
  private routeEventsSub?: Subscription;

  // Employees
  employees: any[] = [];
  editingEmployeeId: string | null = null;
  generatedEmployeeId = '';

  employeeForm = {
    employeeNumber: '',
    fullName: '',
    designation: '',
    department: '',
    salaryType: '',
    bankName: '',
    bankAccountNumber: '',
    employmentStatus: 'active'
  };
  employeeLoading = false;
  employeeError = '';

  employeeSearch = '';
  /** Legacy filters (kept for CSV/export compatibility; not shown on redesigned UI) */
  employeeDepartmentFilter = 'all';
  employeeStatusFilter: 'all' | 'active' | 'inactive' | 'terminated' = 'all';
  employeeActiveOnly = false;

  /** Payroll employees = ancillary / support staff only (teachers excluded). */
  employeeSalaryFilter: 'all' | 'assigned' | 'not_assigned' = 'all';
  showEmployeeRegisterPanel = false;

  employeeDepartments: string[] = [];
  employeeTotal = 0;
  employeeRows: any[] = [];
  employeeSortBy: 'employeeNumber' | 'fullName' | 'department' | 'employmentStatus' = 'employeeNumber';
  employeeSortDir: 'asc' | 'desc' = 'asc';

  // Structures
  salaryStructures: any[] = [];
  structureForm = {
    id: '',
    name: '',
    salaryType: '',
    basicSalary: 0,
    isActive: true,
    effectiveFrom: '',
    description: '',
    components: {
      allowances: [] as Array<{ name: string; amount: number }>,
      deductions: [] as Array<{ name: string; amount: number }>
    }
  };
  structureLoading = false;
  structureError = '';
  showStructureFormPanel = false;
  /** `list` = structures index; `new` = full-page add form (`/payroll/structures/new`). */
  structurePage: 'list' | 'new' = 'list';

  /** UI for Salary Type dropdown (maps to `structureForm.salaryType` on save). */
  structureSalaryTypeCategory: 'fixed_monthly' | 'ancillary' | 'teacher' | 'other' = 'fixed_monthly';
  structureSalaryTypeOther = '';

  readonly salaryTypeOptions: Array<{
    value: 'fixed_monthly' | 'ancillary' | 'teacher' | 'other';
    label: string;
  }> = [
    { value: 'fixed_monthly', label: 'Fixed Monthly Salary' },
    { value: 'ancillary', label: 'Ancillary' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'other', label: 'Others' }
  ];

  // Process payroll
  process = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    notes: ''
  };
  /** All runs for Process Payroll KPI cards (unfiltered) */
  processRunStats: any[] = [];
  selectedRun: any = null;
  /** Run id for payslips tab dropdown (synced when a run is loaded) */
  payslipRunSelectId: string | null = null;
  /** All runs for payslip run picker */
  payslipRuns: any[] = [];

  readonly monthOptions = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];
  runLoading = false;
  runError = '';
  /** Shown after a successful Generate Payroll API call */
  runSuccess = '';
  /** Optional backend hint (e.g. zero lines created) */
  runWarning = '';
  adjusting = false;

  // Lines editing
  runLines: any[] = [];
  lastPayslipDownloadName = '';

  // Reports
  reportLoading = false;
  reportError = '';
  monthlySummary: any = null;
  departmentRows: any[] = [];
  reportFilters = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    department: ''
  };
  /** First visit to Reports tab: auto-sync period and load (session). */
  private reportsTabBootstrapped = false;
  /** When navigating from Payslips → Reports with a chosen period, skip default “current month” bootstrap. */
  private reportsBootstrapSkipOnce = false;
  readonly reportSkeletonSlots = [1, 2, 3, 4];

  // Leave management
  leaveLoading = false;
  leaveError = '';
  leaveSuccess = '';
  leaveRows: any[] = [];
  leaveHistoryRows: any[] = [];
  leaveDeptRows: any[] = [];
  leaveLiabilityRows: any[] = [];
  leaveLiabilityTotals: any = null;
  leaveLiabilityAuditRows: any[] = [];
  leavePolicy = {
    annualLeaveDaysPerYear: 30,
    excessAccruedThresholdDays: 45,
    maxAccrualDays: null as number | null,
    carryForwardCapDays: null as number | null,
    teachingTermMonthsText: '1,2,3,4,5,6,7,8,9,10,11',
    notes: '',
  };
  canEditLeaveCompliance = false;
  leaveFilters = {
    asOfDate: new Date().toISOString().slice(0, 10),
    from: '',
    to: '',
    category: 'all' as 'all' | 'teaching' | 'ancillary',
    employeeId: '',
  };
  leaveForm = {
    staffType: 'ancillary' as 'teaching' | 'ancillary',
    staffId: '',
    leaveDate: new Date().toISOString().slice(0, 10),
    days: 1,
    reason: '',
  };

  constructor(
    private payrollService: PayrollService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  /** True when rendered inside `/payroll/manage/...` (parent shell owns the main nav). */
  inPayrollManageShell(): boolean {
    return this.router.url.split('?')[0].includes('/payroll/manage');
  }

  /**
   * Link segments for payroll routes — stays under `/payroll/manage/...` when already in the hub.
   */
  payrollSegments(
    page:
      | 'overview'
      | 'employees'
      | 'structures'
      | 'structuresNew'
      | 'process'
      | 'leave'
      | 'payslips'
      | 'reports'
      | 'assignments'
  ): string[] {
    if (page === 'assignments') {
      return this.inPayrollManageShell() ? ['/payroll', 'manage', 'assignments'] : ['/payroll', 'assignments'];
    }
    const m = this.inPayrollManageShell();
    switch (page) {
      case 'overview':
        return m ? ['/payroll', 'manage', 'overview'] : ['/payroll'];
      case 'employees':
        return m ? ['/payroll', 'manage', 'employees'] : ['/payroll', 'employees'];
      case 'structures':
        return m ? ['/payroll', 'manage', 'structures'] : ['/payroll', 'structures'];
      case 'structuresNew':
        return m ? ['/payroll', 'manage', 'structures', 'new'] : ['/payroll', 'structures', 'new'];
      case 'process':
        return m ? ['/payroll', 'manage', 'process'] : ['/payroll', 'process'];
      case 'leave':
        return m ? ['/payroll', 'manage', 'leave'] : ['/payroll', 'leave'];
      case 'payslips':
        return m ? ['/payroll', 'manage', 'payslips'] : ['/payroll', 'payslips'];
      case 'reports':
        return m ? ['/payroll', 'manage', 'reports'] : ['/payroll', 'reports'];
      default:
        return ['/payroll'];
    }
  }

  ngOnInit(): void {
    const role = this.authService.getCurrentUser()?.role || '';
    this.canEditLeaveCompliance = role === 'admin' || role === 'superadmin';
    this.applyRouteTab();
    this.routeEventsSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.applyRouteTab());

    if (this.tab !== 'overview') {
      this.refreshEmployees();
    }
    this.refreshProcessKpis();
    this.refreshSalaryStructures();
  }

  ngOnDestroy(): void {
    this.routeEventsSub?.unsubscribe();
    document.body.style.overflow = '';
  }

  private applyRouteTab(): void {
    const tab = (this.route.snapshot.data?.['tab'] || 'employees') as PayrollTab;
    const prevStructurePage = this.structurePage;
    const structurePageRaw = this.route.snapshot.data?.['structurePage'] as 'list' | 'new' | undefined;
    const structurePage: 'list' | 'new' =
      tab === 'structures' && structurePageRaw === 'new' ? 'new' : tab === 'structures' ? 'list' : 'list';

    if (tab !== 'employees' && this.showEmployeeRegisterPanel) {
      this.closeEmployeeModal();
    }
    if (tab !== 'structures' && this.showStructureFormPanel) {
      this.cancelStructureForm();
    }
    this.tab = tab;
    this.structurePage = structurePage;

    if (tab !== 'process') {
      this.runSuccess = '';
      this.runWarning = '';
    }

    if (tab === 'structures' && structurePage === 'new' && prevStructurePage !== 'new') {
      this.structureError = '';
      this.resetStructureForm();
      this.showStructureFormPanel = false;
      document.body.style.overflow = '';
    }

    if (tab === 'overview') {
      this.refreshOverview();
    }
    if (tab === 'process') {
      this.refreshProcessKpis();
      this.refreshPayslipRunsList();
      const runIdProcess = this.route.snapshot.queryParamMap.get('runId');
      if (runIdProcess) {
        this.loadRun(runIdProcess);
      }
    }
    if (tab === 'leave') {
      this.loadLeaveModuleData();
    }
    if (tab === 'payslips') {
      this.refreshPayslipRunsList();
      const runIdPayslip = this.route.snapshot.queryParamMap.get('runId');
      if (runIdPayslip) {
        this.loadRun(runIdPayslip);
      } else if (this.selectedRun?.id) {
        this.refreshPayslips();
      }
    }
    if (tab === 'reports') {
      if (!this.reportsTabBootstrapped) {
        this.reportsTabBootstrapped = true;
        if (!this.reportsBootstrapSkipOnce) {
          this.syncReportFiltersToCurrent();
          this.loadAllReports();
        }
      }
    }
  }

  navigateToAssignments(): void {
    this.router.navigate(this.payrollSegments('assignments'));
  }

  @HostListener('document:keydown.escape')
  onPayrollModalEscape(): void {
    if (this.tab === 'employees' && this.showEmployeeRegisterPanel) {
      this.closeEmployeeModal();
    } else if (this.tab === 'structures' && this.structurePage === 'new') {
      this.navigateToStructuresList();
    } else if (this.tab === 'structures' && this.showStructureFormPanel) {
      this.cancelStructureForm();
    }
  }

  navigateToTab(nextTab: PayrollTab): void {
    let path: string[];
    switch (nextTab) {
      case 'overview':
        path = this.payrollSegments('overview');
        break;
      case 'employees':
        path = this.payrollSegments('employees');
        break;
      case 'structures':
        path = this.payrollSegments('structures');
        break;
      case 'process':
        path = this.payrollSegments('process');
        break;
      case 'leave':
        path = this.payrollSegments('leave');
        break;
      case 'payslips':
        path = this.payrollSegments('payslips');
        break;
      case 'reports':
        path = this.payrollSegments('reports');
        break;
      default:
        path = this.payrollSegments('overview');
    }
    const qp =
      (nextTab === 'process' || nextTab === 'payslips') && this.selectedRun?.id
        ? { queryParams: { runId: this.selectedRun.id } }
        : undefined;
    this.router.navigate(path, qp);
  }

  refreshOverview(): void {
    this.overviewLoading = true;
    this.overviewError = '';
    forkJoin({
      employees: this.payrollService.getEmployees(),
      structures: this.payrollService.getSalaryStructures(),
      runs: this.payrollService.getRuns({}),
      summary: this.payrollService.getMonthlySummary({ month: this.overviewMonth, year: this.overviewYear }).pipe(
        catchError(() => of({ summary: null }))
      )
    }).subscribe({
      next: (res) => {
        this.employees = res.employees?.employees || [];
        this.applyEmployeeViewModel();

        const structs = res.structures?.structures || res.structures?.salaryStructures || [];
        this.overviewStructuresCount = (structs || []).length;

        const allRuns = res.runs?.runs || [];
        this.overviewTotalRuns = allRuns.length;
        this.overviewRecentRuns = allRuns.slice(0, 8);

        this.overviewSummary = res.summary?.summary ?? null;
        this.overviewLoading = false;
      },
      error: (err: any) => {
        this.overviewError = err?.error?.message || err?.message || 'Failed to load payroll overview';
        this.overviewLoading = false;
      }
    });
  }

  onOverviewPeriodChange(): void {
    this.refreshOverview();
  }

  openRunInProcess(runId: string): void {
    this.router.navigate(this.payrollSegments('process'), { queryParams: { runId } });
  }

  openProcessFirstRun(): void {
    this.navigateToTab('process');
  }

  navigateToPayslipsWithRun(runId: string): void {
    this.router.navigate(this.payrollSegments('payslips'), { queryParams: { runId } });
  }

  onPayslipRunChange(runId: string | null | undefined): void {
    if (runId == null || runId === '') {
      this.selectedRun = null;
      this.runLines = [];
      this.payslips = [];
      this.payslipRunSelectId = null;
      this.router.navigate(this.payrollSegments('payslips'));
      return;
    }
    this.router.navigate(this.payrollSegments('payslips'), { queryParams: { runId } });
  }

  refreshPayslipRunsList(): void {
    this.payslipRunsListLoading = true;
    this.payrollService.getRuns({}).subscribe({
      next: (data: any) => {
        this.payslipRuns = (data?.runs || []).slice().sort((a: any, b: any) => {
          const ya = Number(a?.runYear) || 0;
          const yb = Number(b?.runYear) || 0;
          if (ya !== yb) return yb - ya;
          return (Number(b?.runMonth) || 0) - (Number(a?.runMonth) || 0);
        });
        this.payslipRunsListLoading = false;
      },
      error: () => {
        this.payslipRuns = [];
        this.payslipRunsListLoading = false;
      }
    });
  }

  isRunDraft(run: any): boolean {
    return String(run?.status || '').toLowerCase() === 'draft';
  }

  /** Staff managed in Payroll (ancillary / support only; teachers excluded). */
  get overviewPayrollStaffCount(): number {
    return this.payrollEmployees.length;
  }

  get overviewRunsThisMonth(): number {
    return this.overviewRecentRuns.filter((r: any) =>
      Number(r?.runMonth) === this.overviewMonth && Number(r?.runYear) === this.overviewYear
    ).length;
  }

  formatMoney(n: number | undefined | null): string {
    const v = Number(n ?? 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  runStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'draft') return 'run-pill run-pill-draft';
    if (s === 'pending_approval') return 'run-pill run-pill-warn';
    if (s === 'approved' || s === 'paid') return 'run-pill run-pill-ok';
    if (s === 'cancelled') return 'run-pill run-pill-bad';
    return 'run-pill';
  }

  // ---------------- Employees ----------------
  refreshEmployees(): void {
    this.employeeLoading = true;
    this.employeeError = '';
    this.payrollService.getEmployees().subscribe({
      next: (data: any) => {
        this.employees = data?.employees || [];
        this.employeeLoading = false;
        const payrollOnly = this.payrollEmployees;
        this.employeeDepartments = Array.from(
          new Set(payrollOnly.map((e: any) => String(e?.department || '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        this.applyEmployeeViewModel();
      },
      error: (err: any) => {
        this.employeeError = err?.error?.message || err?.message || 'Failed to load employees';
        this.employeeLoading = false;
      }
    });
  }

  private applyEmployeeViewModel(): void {
    let rows = [...this.payrollEmployees];

    const q = this.employeeSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((e: any) => {
        const hay = [e?.employeeNumber, e?.fullName, e?.department, e?.designation, e?.salaryType]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (this.employeeSalaryFilter === 'assigned') {
      rows = rows.filter((e: any) => this.hasSalaryAssigned(e));
    } else if (this.employeeSalaryFilter === 'not_assigned') {
      rows = rows.filter((e: any) => !this.hasSalaryAssigned(e));
    }

    rows.sort((a: any, b: any) => {
      const av = String(a?.[this.employeeSortBy] || '').toLowerCase();
      const bv = String(b?.[this.employeeSortBy] || '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return this.employeeSortDir === 'asc' ? cmp : -cmp;
    });

    this.employeeTotal = rows.length;
    this.employeeRows = rows;
  }

  onEmployeeFilterChange(): void {
    this.applyEmployeeViewModel();
  }

  clearEmployeeFilters(): void {
    this.employeeSearch = '';
    this.employeeDepartmentFilter = 'all';
    this.employeeStatusFilter = 'all';
    this.employeeActiveOnly = false;
    this.employeeSalaryFilter = 'all';
    this.employeeSortBy = 'employeeNumber';
    this.employeeSortDir = 'asc';
    this.applyEmployeeViewModel();
  }

  /** Teachers are not managed in Payroll; excluded by designation. */
  isTeacherEmployee(e: any): boolean {
    const d = String(e?.designation || '').toLowerCase();
    return d.includes('teacher');
  }

  /** Employees shown in Payroll (ancillary / support staff only). */
  get payrollEmployees(): any[] {
    return (this.employees || []).filter((e: any) => !this.isTeacherEmployee(e));
  }

  hasSalaryAssigned(e: any): boolean {
    return String(e?.salaryType || '').trim().length > 0;
  }

  get employeesWithSalaryCount(): number {
    return this.payrollEmployees.filter((e: any) => this.hasSalaryAssigned(e)).length;
  }

  assignSalaryNavigate(): void {
    this.navigateToAssignments();
  }

  backToPayrollHome(): void {
    this.navigateToTab('overview');
  }

  setEmployeeSalaryFilter(f: 'all' | 'assigned' | 'not_assigned'): void {
    this.employeeSalaryFilter = f;
    this.onEmployeeFilterChange();
  }

  formatJoinDate(e: any): string {
    if (!e?.createdAt) return '—';
    try {
      return new Date(e.createdAt).toLocaleDateString('en-GB');
    } catch {
      return '—';
    }
  }

  salaryBadgeClass(e: any): string {
    return this.hasSalaryAssigned(e) ? 'salary-badge salary-badge-assigned' : 'salary-badge salary-badge-unassigned';
  }

  salaryBadgeText(e: any): string {
    return this.hasSalaryAssigned(e) ? 'Assigned' : 'Not assigned';
  }

  toggleEmployeeSort(column: 'employeeNumber' | 'fullName' | 'department' | 'employmentStatus'): void {
    if (this.employeeSortBy === column) {
      this.employeeSortDir = this.employeeSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.employeeSortBy = column;
      this.employeeSortDir = 'asc';
    }
    this.applyEmployeeViewModel();
  }

  getEmployeeSortIcon(column: 'employeeNumber' | 'fullName' | 'department' | 'employmentStatus'): string {
    if (this.employeeSortBy !== column) return '↕';
    return this.employeeSortDir === 'asc' ? '▲' : '▼';
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'status-pill status-pill-active';
    if (s === 'inactive') return 'status-pill status-pill-inactive';
    if (s === 'terminated') return 'status-pill status-pill-terminated';
    return 'status-pill';
  }

  get employeeStats(): { total: number; active: number; inactive: number; terminated: number; departments: number } {
    const list = this.payrollEmployees;
    const total = list.length;
    const active = list.filter((e: any) => String(e?.employmentStatus || '') === 'active').length;
    const inactive = list.filter((e: any) => String(e?.employmentStatus || '') === 'inactive').length;
    const terminated = list.filter((e: any) => String(e?.employmentStatus || '') === 'terminated').length;
    const departments = new Set(list.map((e: any) => String(e?.department || '').trim()).filter(Boolean)).size;
    return { total, active, inactive, terminated, departments };
  }

  quickFilterStatus(status: 'all' | 'active' | 'inactive' | 'terminated'): void {
    this.employeeStatusFilter = status;
    this.onEmployeeFilterChange();
  }

  exportEmployeesCsv(): void {
    const rows = this.employeeRows || [];
    if (!rows.length) return;

    const headers = ['Employee ID', 'Name', 'Designation', 'Department', 'Salary Type', 'Bank Name', 'Bank Account Number', 'Employment Status'];
    const csvRows = [
      headers.join(','),
      ...rows.map((e: any) =>
        [
          e.employeeNumber,
          e.fullName,
          e.designation || '',
          e.department || '',
          e.salaryType || '',
          e.bankName || '',
          e.bankAccountNumber || '',
          e.employmentStatus || ''
        ]
          .map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-employees-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  saveEmployee(): void {
    this.employeeError = '';
    if (!this.employeeForm.fullName) {
      this.employeeError = 'Name is required';
      return;
    }

    const payload: any = {
      ...this.employeeForm,
      designation: this.employeeForm.designation || null,
      department: this.employeeForm.department || null,
      salaryType: this.employeeForm.salaryType ? String(this.employeeForm.salaryType).trim() : null,
      bankName: this.employeeForm.bankName || null,
      bankAccountNumber: this.employeeForm.bankAccountNumber || null,
      employmentStatus: this.employeeForm.employmentStatus
    };

    const req = this.editingEmployeeId
      ? this.payrollService.updateEmployee(this.editingEmployeeId, payload)
      : this.payrollService.createEmployee(payload);

    req.subscribe({
      next: () => {
        this.refreshEmployees();
        this.closeEmployeeModal();
      },
      error: (err: any) => {
        this.employeeError = err?.error?.message || err?.message || (this.editingEmployeeId ? 'Failed to update employee' : 'Failed to create employee');
      }
    });
  }

  openEmployeeModal(): void {
    this.employeeError = '';
    this.resetEmployeeForm();
    this.showEmployeeRegisterPanel = true;
    document.body.style.overflow = 'hidden';
  }

  closeEmployeeModal(): void {
    this.showEmployeeRegisterPanel = false;
    this.employeeError = '';
    this.resetEmployeeForm();
    document.body.style.overflow = '';
  }

  onEmployeeModalBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('employee-modal-backdrop')) {
      this.closeEmployeeModal();
    }
  }

  editEmployee(emp: any): void {
    this.employeeError = '';
    this.showEmployeeRegisterPanel = true;
    document.body.style.overflow = 'hidden';
    this.editingEmployeeId = emp?.id || null;
    this.employeeForm = {
      employeeNumber: emp.employeeNumber || '',
      fullName: emp.fullName || '',
      designation: emp.designation || '',
      department: emp.department || '',
      salaryType: emp.salaryType || '',
      bankName: emp.bankName || '',
      bankAccountNumber: emp.bankAccountNumber || '',
      employmentStatus: emp.employmentStatus || 'active'
    };
  }

  resetEmployeeForm(): void {
    this.editingEmployeeId = null;
    this.generatedEmployeeId = '';
    this.employeeForm = {
      employeeNumber: '',
      fullName: '',
      designation: '',
      department: '',
      salaryType: '',
      bankName: '',
      bankAccountNumber: '',
      employmentStatus: 'active'
    };
  }

  deleteEmployee(id: string): void {
    if (!confirm('Delete this employee?')) return;
    this.payrollService.deleteEmployee(id).subscribe({
      next: () => this.refreshEmployees(),
      error: (err: any) => {
        this.employeeError = err?.error?.message || err?.message || 'Failed to delete employee';
      }
    });
  }

  // ---------------- Salary Structures ----------------
  refreshSalaryStructures(): void {
    this.payrollService.getSalaryStructures().subscribe({
      next: (data: any) => {
        this.salaryStructures = data?.structures || data?.salaryStructures || [];
      }
    });
  }

  isTeacherStructure(s: any): boolean {
    return String(s?.salaryType || '').toLowerCase().includes('teacher');
  }

  isAncillaryStructure(s: any): boolean {
    return String(s?.salaryType || '').toLowerCase().includes('ancillary');
  }

  /** Structures available in Payroll (teacher salary types excluded). */
  get salaryStructuresForPayroll(): any[] {
    return (this.salaryStructures || []).filter((s: any) => !this.isTeacherStructure(s));
  }

  /** All structures (for dashboard cards on Structures page). */
  get structuresAllCount(): number {
    return (this.salaryStructures || []).length;
  }

  get structuresTeacherCount(): number {
    return (this.salaryStructures || []).filter((s: any) => this.isTeacherStructure(s)).length;
  }

  get structuresAncillaryCount(): number {
    return (this.salaryStructures || []).filter((s: any) => this.isAncillaryStructure(s)).length;
  }

  /** Structures list UI */
  structureListSearch = '';
  structureTypeFilter: 'all' | 'ancillary' | 'fixed_monthly' | 'other' = 'all';
  structureCopyLinkMessage = '';

  isFixedMonthlyStructure(s: any): boolean {
    const t = String(s?.salaryType || '').toLowerCase();
    return (t.includes('fixed') && t.includes('monthly')) || t === 'fixed_monthly';
  }

  /** Filtered list for Payroll structures tab (excludes teachers + search + type chips). */
  get payrollStructuresFiltered(): any[] {
    let list = [...this.salaryStructuresForPayroll];
    if (this.structureTypeFilter === 'ancillary') {
      list = list.filter((s) => this.isAncillaryStructure(s));
    } else if (this.structureTypeFilter === 'fixed_monthly') {
      list = list.filter((s) => this.isFixedMonthlyStructure(s));
    } else if (this.structureTypeFilter === 'other') {
      list = list.filter((s) => !this.isAncillaryStructure(s) && !this.isFixedMonthlyStructure(s));
    }
    const q = this.structureListSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s: any) => {
      const hay = [s?.name, s?.salaryType, s?.description, s?.basicSalary]
        .filter((x) => x !== undefined && x !== null)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  structureComponentTotals(s: any): { allowances: number; deductions: number; allowanceCount: number; deductionCount: number } {
    const list = Array.isArray(s?.components) ? s.components : [];
    let allowances = 0;
    let deductions = 0;
    let allowanceCount = 0;
    let deductionCount = 0;
    for (const c of list) {
      const t = String(c?.componentType || '').toLowerCase();
      const amt = Number(c?.amount || 0);
      if (t === 'deduction') {
        deductions += amt;
        deductionCount += 1;
      } else {
        allowances += amt;
        allowanceCount += 1;
      }
    }
    return { allowances, deductions, allowanceCount, deductionCount };
  }

  structureTypeBadgeClass(s: any): string {
    if (this.isAncillaryStructure(s)) return 'structure-type-pill structure-type-pill--ancillary';
    if (this.isFixedMonthlyStructure(s)) return 'structure-type-pill structure-type-pill--fixed';
    return 'structure-type-pill structure-type-pill--other';
  }

  structureTypeBadgeLabel(s: any): string {
    if (this.isAncillaryStructure(s)) return 'Ancillary';
    if (this.isFixedMonthlyStructure(s)) return 'Fixed monthly';
    return 'Other';
  }

  copyStructuresPageLink(): void {
    const url = window.location.href;
    const done = (msg: string) => {
      this.structureCopyLinkMessage = msg;
      setTimeout(() => (this.structureCopyLinkMessage = ''), 2800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => done('Link copied')).catch(() => done('Copy failed'));
    } else {
      done('Copy not supported');
    }
  }

  /** Navigate to full-page “add salary structure” (`/payroll/structures/new`). */
  openAddStructure(): void {
    this.router.navigate(this.payrollSegments('structuresNew'));
  }

  navigateToStructuresList(): void {
    this.structureError = '';
    this.router.navigate(this.payrollSegments('structures'));
  }

  backFromStructures(): void {
    if (this.showStructureFormPanel) {
      this.cancelStructureForm();
    }
    if (this.structurePage === 'new') {
      this.navigateToStructuresList();
      return;
    }
    this.navigateToTab('overview');
  }

  cancelStructureForm(): void {
    this.showStructureFormPanel = false;
    this.resetStructureForm();
    document.body.style.overflow = '';
  }

  onStructureModalBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelStructureForm();
    }
  }

  private mapComponentsFromStructure(s: any): {
    allowances: Array<{ name: string; amount: number }>;
    deductions: Array<{ name: string; amount: number }>;
  } {
    const list = Array.isArray(s?.components) ? s.components : [];
    const allowances: Array<{ name: string; amount: number }> = [];
    const deductions: Array<{ name: string; amount: number }> = [];
    for (const c of list) {
      const t = String(c?.componentType || '').toLowerCase();
      const row = { name: String(c?.name || '').trim(), amount: Number(c?.amount ?? 0) };
      if (!row.name) continue;
      if (t === 'deduction') {
        deductions.push(row);
      } else {
        allowances.push(row);
      }
    }
    return { allowances, deductions };
  }

  editStructure(s: any): void {
    if (!s?.id) return;
    this.structureError = '';
    const eff = s.effectiveFrom ? String(s.effectiveFrom).slice(0, 10) : '';
    const { allowances, deductions } = this.mapComponentsFromStructure(s);
    this.structureForm = {
      id: s.id,
      name: s.name || '',
      salaryType: s.salaryType || '',
      basicSalary: Number(s.basicSalary ?? 0),
      isActive: s.isActive !== false,
      effectiveFrom: eff,
      description: s.description || '',
      components: { allowances, deductions }
    };
    this.syncStructureSalaryTypeFromStored();
    this.showStructureFormPanel = true;
    document.body.style.overflow = 'hidden';
  }

  /** Align dropdown + "Others" field with `structureForm.salaryType` when editing. */
  private syncStructureSalaryTypeFromStored(): void {
    const st = String(this.structureForm.salaryType || '').trim();
    if (!st) {
      this.structureSalaryTypeCategory = 'fixed_monthly';
      this.structureSalaryTypeOther = '';
      return;
    }
    const lower = st.toLowerCase();
    if (lower === 'fixed monthly salary' || lower === 'fixed_monthly') {
      this.structureSalaryTypeCategory = 'fixed_monthly';
      this.structureSalaryTypeOther = '';
      return;
    }
    if (lower === 'ancillary' || lower.includes('ancillary')) {
      this.structureSalaryTypeCategory = 'ancillary';
      this.structureSalaryTypeOther = '';
      return;
    }
    if (lower === 'teacher' || lower.includes('teacher')) {
      this.structureSalaryTypeCategory = 'teacher';
      this.structureSalaryTypeOther = '';
      return;
    }
    this.structureSalaryTypeCategory = 'other';
    this.structureSalaryTypeOther = st;
  }

  private resolveStructureSalaryType(): string {
    switch (this.structureSalaryTypeCategory) {
      case 'fixed_monthly':
        return 'Fixed Monthly Salary';
      case 'ancillary':
        return 'ancillary';
      case 'teacher':
        return 'teacher';
      case 'other':
        return String(this.structureSalaryTypeOther || '').trim();
      default:
        return '';
    }
  }

  private componentsToPayload(): any[] {
    const allowances = (this.structureForm.components.allowances || []).filter(x => x?.name && x?.amount >= 0);
    const deductions = (this.structureForm.components.deductions || []).filter(x => x?.name && x?.amount >= 0);
    return [
      ...allowances.map(a => ({ name: a.name, amount: Number(a.amount || 0), componentType: 'allowance' })),
      ...deductions.map(d => ({ name: d.name, amount: Number(d.amount || 0), componentType: 'deduction' })),
    ];
  }

  saveStructure(): void {
    this.structureError = '';
    const resolvedType = this.resolveStructureSalaryType();
    if (this.structureSalaryTypeCategory === 'other' && !resolvedType) {
      this.structureError = 'Please specify the salary type for "Others".';
      return;
    }
    if (!this.structureForm.name || !resolvedType) {
      this.structureError = 'Structure name and Salary Type are required';
      return;
    }

    this.structureForm.salaryType = resolvedType;

    const payload: any = {
      name: this.structureForm.name,
      salaryType: resolvedType,
      basicSalary: Number(this.structureForm.basicSalary || 0),
      isActive: Boolean(this.structureForm.isActive),
      effectiveFrom: this.structureForm.effectiveFrom || null,
      description: this.structureForm.description || null,
      components: this.componentsToPayload()
    };

    this.structureLoading = true;
    this.payrollService.createOrUpdateSalaryStructure(payload, this.structureForm.id || undefined).subscribe({
      next: () => {
        this.structureLoading = false;
        this.resetStructureForm();
        this.showStructureFormPanel = false;
        document.body.style.overflow = '';
        this.refreshSalaryStructures();
        if (this.structurePage === 'new') {
          this.router.navigate(this.payrollSegments('structures'));
        }
      },
      error: (err: any) => {
        this.structureLoading = false;
        this.structureError = err?.error?.message || err?.message || 'Failed to save structure';
      }
    });
  }

  resetStructureForm(): void {
    this.structureForm = {
      id: '',
      name: '',
      salaryType: '',
      basicSalary: 0,
      isActive: true,
      effectiveFrom: '',
      description: '',
      components: { allowances: [], deductions: [] }
    };
    this.structureSalaryTypeCategory = 'fixed_monthly';
    this.structureSalaryTypeOther = '';
  }

  /** Reset fields when creating a new structure (modal). */
  resetNewStructureFields(): void {
    this.structureError = '';
    this.resetStructureForm();
  }

  // ---------------- Payroll Runs ----------------
  refreshProcessKpis(): void {
    this.payrollService.getRuns({}).subscribe({
      next: (data: any) => {
        this.processRunStats = data?.runs || [];
      }
    });
  }

  get processKpiTotal(): number {
    return this.processRunStats.length;
  }

  get processKpiDraft(): number {
    return this.processRunStats.filter((r: any) => String(r?.status || '').toLowerCase() === 'draft').length;
  }

  get processKpiApproved(): number {
    return this.processRunStats.filter((r: any) => {
      const s = String(r?.status || '').toLowerCase();
      return s === 'approved' || s === 'paid';
    }).length;
  }

  /** Label for current process month (synced when opening Process Payroll). */
  get processMonthLabel(): string {
    const m = this.monthOptions.find((x) => x.value === this.process.month);
    return m?.label ?? `Month ${this.process.month}`;
  }

  /** True when selected payroll month is after the current calendar month (blocked on server). */
  get processPeriodIsFuture(): boolean {
    const m = Number(this.process.month);
    const y = Number(this.process.year);
    if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      return false;
    }
    const now = new Date();
    const maxKey = now.getFullYear() * 12 + (now.getMonth() + 1);
    return y * 12 + m > maxKey;
  }

  /** Payroll generation always uses server “today”; keep UI aligned when visiting this tab. */
  private syncProcessMonthYearToCurrent(): void {
    const now = new Date();
    this.process.month = now.getMonth() + 1;
    this.process.year = now.getFullYear();
  }

  /** Search filter for run picker on Process tab */
  processRunSearch = '';
  /** Filter payroll lines by employee name / number */
  processEmployeeSearch = '';
  processCopyLinkMessage = '';
  /** Collapsible “how generation works” on Process tab */
  processRulesOpen = false;

  get processRunsFiltered(): any[] {
    const q = this.processRunSearch.trim().toLowerCase();
    const list = this.payslipRuns || [];
    if (!q) return list;
    return list.filter((r: any) => {
      const hay = [r?.periodLabel, r?.status, r?.runMonth, r?.runYear, r?.id]
        .filter((x) => x !== undefined && x !== null)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  get processRunYearGroups(): { year: number; runs: any[] }[] {
    const runs = this.processRunsFiltered;
    const map = new Map<number, any[]>();
    for (const r of runs) {
      const y = Number(r?.runYear) || 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (Number(b?.runMonth) || 0) - (Number(a?.runMonth) || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, r]) => ({ year, runs: r }));
  }

  private matchesProcessLineSearch(line: any): boolean {
    const q = this.processEmployeeSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = [line?.employeeName, line?.employeeNumber, line?.department]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  get processRunLinesDisplay(): any[] {
    return (this.runLines || []).filter((line: any) => this.matchesProcessLineSearch(line));
  }

  get processSelectedTotalNet(): number {
    return (this.runLines || []).reduce((s: number, l: any) => s + Number(l?.netSalary ?? 0), 0);
  }

  onProcessTabRunChange(runId: string | null | undefined): void {
    if (runId == null || runId === '') {
      this.selectedRun = null;
      this.runLines = [];
      this.payslipRunSelectId = null;
      this.router.navigate(this.payrollSegments('process'));
      return;
    }
    this.router.navigate(this.payrollSegments('process'), { queryParams: { runId } });
  }

  copyProcessPageLink(): void {
    const url = window.location.href;
    const done = (msg: string) => {
      this.processCopyLinkMessage = msg;
      setTimeout(() => (this.processCopyLinkMessage = ''), 2800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => done('Link copied')).catch(() => done('Copy failed'));
    } else {
      done('Copy not supported');
    }
  }

  generateRun(): void {
    this.runError = '';
    this.runSuccess = '';
    this.runWarning = '';

    this.runLoading = true;
    this.selectedRun = null;
    this.runLines = [];

    this.payrollService
      .generateRun({
        notes: this.process.notes?.trim() ? String(this.process.notes).trim() : undefined,
        month: this.process.month,
        year: this.process.year,
      })
      .subscribe({
        next: (res: any) => {
          this.runLoading = false;
          this.runError = '';
          const base = res?.message || 'Payroll run created.';
          const lc = res?.lineCount;
          const periodSuffix =
            res?.appliedPeriod?.periodLabel != null ? ` Period: ${res.appliedPeriod.periodLabel}.` : '';
          this.runSuccess =
            typeof lc === 'number'
              ? `${base} ${lc} employee line${lc === 1 ? '' : 's'}.${periodSuffix}`
              : `${base}${periodSuffix}`;
          this.runWarning = typeof res?.warning === 'string' ? res.warning : '';
          this.refreshProcessKpis();
          this.refreshPayslipRunsList();
          if (res?.run?.id) {
            this.router.navigate(this.payrollSegments('process'), { queryParams: { runId: res.run.id }, replaceUrl: true });
          }
        },
        error: (err: any) => {
          this.runLoading = false;
          this.runSuccess = '';
          this.runWarning = '';
          const body = err?.error;
          const msg =
            (body && typeof body === 'object' && body.message) ||
            (typeof body === 'string' ? body : null) ||
            err?.message ||
            'Failed to generate payroll run';
          this.runError = typeof msg === 'string' ? msg : 'Failed to generate payroll run';
        }
      });
  }

  loadRun(runId: string): void {
    this.payslipRunDetailLoading = true;
    this.payrollService.getRunDetails(runId).subscribe({
      next: (data: any) => {
        this.selectedRun = data?.run || null;
        this.runLines = data?.lines || [];
        this.payslipRunSelectId = this.selectedRun?.id || null;
        this.runError = '';
        this.payslipRunDetailLoading = false;
        this.refreshPayslips();
      },
      error: (err: any) => {
        this.payslipRunDetailLoading = false;
        this.runError = err?.error?.message || err?.message || 'Failed to load run details';
      }
    });
  }

  adjustLine(line: any): void {
    if (!this.selectedRun?.id) return;
    this.adjusting = true;
    const payload = {
      employeeId: line.employeeId,
      extraAllowances: Number(line.extraAllowances || 0),
      extraDeductions: Number(line.extraDeductions || 0),
      adjustmentNotes: line.adjustmentNotes || null
    };
    this.payrollService.adjustLine(this.selectedRun.id, payload).subscribe({
      next: (data: any) => {
        this.adjusting = false;
        // Update local line
        const idx = this.runLines.findIndex(x => x.id === data?.line?.id);
        if (idx >= 0) this.runLines[idx] = data.line;
      },
      error: (err: any) => {
        this.adjusting = false;
        this.runError = err?.error?.message || err?.message || 'Failed to adjust line';
      }
    });
  }

  approveSelectedRun(): void {
    if (!this.selectedRun?.id) return;
    if (!confirm('Approve this payroll run and generate payslips?')) return;
    this.runLoading = true;
    this.runError = '';
    this.payrollService.approveRun(this.selectedRun.id).subscribe({
      next: (data: any) => {
        this.runLoading = false;
        this.refreshProcessKpis();
        const rid = data?.runId || this.selectedRun?.id;
        if (rid) {
          this.router.navigate(this.payrollSegments('payslips'), { queryParams: { runId: rid } });
        }
      },
      error: (err: any) => {
        this.runLoading = false;
        this.runError = err?.error?.message || err?.message || 'Failed to approve run';
      }
    });
  }

  // ---------------- Payslips ----------------
  payslips: any[] = [];
  /** Line id while a preview PDF request is in flight */
  previewingLineId: string | null = null;
  /** Loading run details (lines) when switching runs */
  payslipRunDetailLoading = false;
  /** Loading payslip list from API */
  payslipsListLoading = false;
  /** Filter payroll run dropdown */
  payslipRunSearch = '';
  /** Filter employee rows in tables/cards */
  payslipEmployeeSearch = '';
  payslipRunsListLoading = false;
  payslipCopyLinkMessage = '';

  /** Runs matching search, same sort as master list (newest first). */
  get payslipRunsFiltered(): any[] {
    const q = this.payslipRunSearch.trim().toLowerCase();
    const list = this.payslipRuns || [];
    if (!q) return list;
    return list.filter((r: any) => {
      const hay = [r?.periodLabel, r?.status, r?.runMonth, r?.runYear, r?.id]
        .filter((x) => x !== undefined && x !== null)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  /** Group runs by year for &lt;optgroup&gt; (years desc, months desc within year). */
  get payslipRunYearGroups(): { year: number; runs: any[] }[] {
    const runs = this.payslipRunsFiltered;
    const map = new Map<number, any[]>();
    for (const r of runs) {
      const y = Number(r?.runYear) || 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (Number(b?.runMonth) || 0) - (Number(a?.runMonth) || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, r]) => ({ year, runs: r }));
  }

  private matchesPayslipEmployeeSearch(name: string | undefined, num: string | undefined): boolean {
    const q = this.payslipEmployeeSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = [name, num].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  /** Draft lines filtered by employee search. */
  get payslipDraftLinesDisplay(): any[] {
    return (this.runLines || []).filter((line: any) =>
      this.matchesPayslipEmployeeSearch(line?.employeeName, line?.employeeNumber)
    );
  }

  /** Generated payslips filtered by employee search. */
  get payslipsDisplay(): any[] {
    return (this.payslips || []).filter((p: any) =>
      this.matchesPayslipEmployeeSearch(p?.employeeName, p?.employeeNumber)
    );
  }

  get payslipTotalNetForRun(): number {
    return (this.runLines || []).reduce((s: number, l: any) => s + Number(l?.netSalary ?? 0), 0);
  }

  openReportsForSelectedRun(): void {
    if (!this.selectedRun) return;
    this.reportFilters.month = Number(this.selectedRun.runMonth);
    this.reportFilters.year = Number(this.selectedRun.runYear);
    this.reportFilters.department = '';
    this.reportsBootstrapSkipOnce = true;
    this.navigateToTab('reports');
    setTimeout(() => {
      this.loadAllReports();
      this.reportsBootstrapSkipOnce = false;
    }, 0);
  }

  copyPayslipPageLink(): void {
    const url = window.location.href;
    const done = (msg: string) => {
      this.payslipCopyLinkMessage = msg;
      setTimeout(() => (this.payslipCopyLinkMessage = ''), 2800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => done('Link copied')).catch(() => done('Copy failed'));
    } else {
      done('Copy not supported');
    }
  }

  downloadAllPayslipsForRun(): void {
    const list = [...this.payslipsDisplay];
    if (!list.length) return;
    if (
      !confirm(
        `Download ${list.length} PDF file(s)? Your browser may ask to allow multiple downloads.`
      )
    ) {
      return;
    }
    let idx = 0;
    const runNext = () => {
      if (idx >= list.length) return;
      const p = list[idx++];
      this.payrollService.downloadPayslip(p.id).subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const rawName = String(p?.employeeName || 'Payslip').trim();
          const safeName =
            rawName
              .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 150) || 'Payslip';
          a.download = `${safeName}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          setTimeout(runNext, 500);
        },
        error: () => setTimeout(runNext, 500)
      });
    };
    runNext();
  }

  refreshPayslips(): void {
    if (!this.selectedRun?.id) return;
    this.payslipsListLoading = true;
    this.payrollService.getPayslips({ runId: this.selectedRun.id }).subscribe({
      next: (data: any) => {
        this.payslips = data?.payslips || [];
        this.payslipsListLoading = false;
      },
      error: () => {
        this.payslipsListLoading = false;
      }
    });
  }

  previewPayslipLine(lineId: string): void {
    if (!this.selectedRun?.id || !lineId) return;
    this.runError = '';
    this.previewingLineId = lineId;
    this.payrollService.previewPayslipLine(this.selectedRun.id, lineId).subscribe({
      next: (blob: Blob) => {
        this.previewingLineId = null;
        if (blob.type && blob.type.indexOf('application/json') >= 0) {
          blob.text().then((t) => {
            try {
              const j = JSON.parse(t);
              this.runError = j?.message || 'Preview failed';
            } catch {
              this.runError = 'Preview failed';
            }
          });
          return;
        }
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(url), 120000);
      },
      error: (err: any) => {
        this.previewingLineId = null;
        const blob = err?.error;
        if (blob instanceof Blob) {
          blob.text().then((t: string) => {
            try {
              const j = JSON.parse(t);
              this.runError = j?.message || 'Failed to preview payslip';
            } catch {
              this.runError = 'Failed to preview payslip';
            }
          });
        } else {
          this.runError = err?.error?.message || err?.message || 'Failed to preview payslip';
        }
      }
    });
  }

  downloadPayslip(payslip: any): void {
    if (!payslip?.id) return;
    this.payrollService.downloadPayslip(payslip.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const rawName = String(payslip?.employeeName || 'Payslip').trim();
        const safeName =
          rawName
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 150) || 'Payslip';
        const fileName = `${safeName}.pdf`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.runError = err?.error?.message || err?.message || 'Failed to download payslip';
      }
    });
  }

  // ---------------- Leave ----------------
  get leaveStaffOptions(): any[] {
    return this.leaveRows || [];
  }

  get leaveSelectedStaff(): any | null {
    if (!this.leaveForm.staffId) return null;
    return this.leaveRows.find((r: any) => r.staffId === this.leaveForm.staffId && r.staffType === this.leaveForm.staffType) || null;
  }

  private loadLeaveModuleData(): void {
    this.leaveError = '';
    this.leaveSuccess = '';
    this.leaveLoading = true;
    this.payrollService
      .getLeavePolicy()
      .subscribe({
        next: (data: any) => {
          const p = data?.policy || {};
          this.leavePolicy.annualLeaveDaysPerYear = Number(p.annualLeaveDaysPerYear || 30);
          this.leavePolicy.excessAccruedThresholdDays = Number(p.excessAccruedThresholdDays || 45);
          this.leavePolicy.maxAccrualDays = p.maxAccrualDays != null ? Number(p.maxAccrualDays) : null;
          this.leavePolicy.carryForwardCapDays = p.carryForwardCapDays != null ? Number(p.carryForwardCapDays) : null;
          const months = Array.isArray(p.teachingTermMonths) ? p.teachingTermMonths : [1,2,3,4,5,6,7,8,9,10,11];
          this.leavePolicy.teachingTermMonthsText = months.join(',');
          this.leavePolicy.notes = p.notes || '';
        },
      });

    this.payrollService
      .getLeaveDashboard({
        asOfDate: this.leaveFilters.asOfDate || undefined,
        from: this.leaveFilters.from || undefined,
        to: this.leaveFilters.to || undefined,
        category: this.leaveFilters.category,
        employeeId: this.leaveFilters.employeeId || undefined,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveRows = data?.rows || [];
          this.leaveLoading = false;
          this.loadLeaveReports();
          this.loadLeaveHistory();
        },
        error: (err: any) => {
          this.leaveLoading = false;
          this.leaveError = err?.error?.message || err?.message || 'Failed to load leave balances';
        },
      });
  }

  loadLeaveDashboard(): void {
    this.loadLeaveModuleData();
  }

  private loadLeaveHistory(): void {
    this.payrollService
      .getLeaveRecords({
        from: this.leaveFilters.from || undefined,
        to: this.leaveFilters.to || undefined,
        staffType: this.leaveFilters.category,
        staffId: this.leaveFilters.employeeId || undefined,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveHistoryRows = data?.records || [];
        },
        error: () => {
          this.leaveHistoryRows = [];
        },
      });
  }

  private loadLeaveReports(): void {
    this.payrollService
      .getLeaveDepartmentSummary({
        asOfDate: this.leaveFilters.asOfDate || undefined,
        from: this.leaveFilters.from || undefined,
        to: this.leaveFilters.to || undefined,
        category: this.leaveFilters.category,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveDeptRows = data?.rows || [];
        },
        error: () => {
          this.leaveDeptRows = [];
        },
      });

    this.payrollService
      .getLeaveLiabilityReport({
        asOfDate: this.leaveFilters.asOfDate || undefined,
        category: this.leaveFilters.category,
        employeeId: this.leaveFilters.employeeId || undefined,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveLiabilityRows = data?.rows || [];
          this.leaveLiabilityTotals = data?.totals || null;
        },
        error: () => {
          this.leaveLiabilityRows = [];
          this.leaveLiabilityTotals = null;
        },
      });

    this.payrollService
      .getLeaveLiabilityAudits({
        from: this.leaveFilters.from || undefined,
        to: this.leaveFilters.to || undefined,
        category: this.leaveFilters.category,
        employeeId: this.leaveFilters.employeeId || undefined,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveLiabilityAuditRows = data?.rows || [];
        },
        error: () => {
          this.leaveLiabilityAuditRows = [];
        },
      });
  }

  onLeaveStaffTypeChange(): void {
    this.leaveForm.staffId = '';
  }

  recordLeave(): void {
    this.leaveError = '';
    this.leaveSuccess = '';
    if (!this.leaveForm.staffId || !this.leaveForm.leaveDate || !this.leaveForm.days) {
      this.leaveError = 'Select employee, date, and days before recording leave.';
      return;
    }
    this.leaveLoading = true;
    this.payrollService
      .createLeaveRecord({
        staffType: this.leaveForm.staffType,
        staffId: this.leaveForm.staffId,
        leaveDate: this.leaveForm.leaveDate,
        days: Number(this.leaveForm.days),
        reason: this.leaveForm.reason || undefined,
      })
      .subscribe({
        next: () => {
          this.leaveSuccess = 'Leave recorded and balances updated.';
          this.leaveForm.reason = '';
          this.leaveForm.days = 1;
          this.loadLeaveModuleData();
          this.leaveLoading = false;
        },
        error: (err: any) => {
          this.leaveLoading = false;
          this.leaveError = err?.error?.message || err?.message || 'Failed to record leave';
        },
      });
  }

  exportLeaveCsv(which: 'balances' | 'history' | 'department' | 'liability'): void {
    let rows: any[] = [];
    let headers: string[] = [];
    if (which === 'balances') {
      headers = ['Category', 'Employee Number', 'Name', 'Department', 'Accrued Days', 'Taken Days', 'Remaining Days', 'Excess Accrued', 'Estimated Payout'];
      rows = this.leaveRows.map((r: any) => [
        r.staffType,
        r.employeeNumber,
        r.fullName,
        r.department || '',
        r.accruedDays,
        r.takenDays,
        r.remainingDays,
        r.excessAccrued ? 'Yes' : 'No',
        r.leaveLiabilityPayout ?? 0,
      ]);
    } else if (which === 'history') {
      headers = ['Date', 'Category', 'Name', 'Department', 'Days', 'Reason'];
      rows = this.leaveHistoryRows.map((r: any) => [String(r.leaveDate || '').slice(0, 10), r.staffType, r.staffName, r.department || '', r.days, r.reason || '']);
    } else if (which === 'department') {
      headers = ['Category', 'Department', 'Employees', 'Leave Used', 'Outstanding Days'];
      rows = this.leaveDeptRows.map((r: any) => [r.category, r.department, r.employees, r.usedDays, r.outstandingDays]);
    } else {
      headers = ['Category', 'Employee Number', 'Name', 'Department', 'Remaining Days', 'Daily Rate', 'Payout Amount'];
      rows = this.leaveLiabilityRows.map((r: any) => [r.staffType, r.employeeNumber, r.fullName, r.department || '', r.remainingDays, r.dailyRate, r.payoutAmount]);
    }
    if (!rows.length) return;
    const csv = [headers, ...rows]
      .map((line: any[]) => line.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-${which}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  exportLeavePdf(which: 'balances' | 'liability'): void {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    const title = which === 'balances' ? 'Leave Balances Statement' : 'Leave Liability Report';
    const rows = which === 'balances' ? this.leaveRows : this.leaveLiabilityRows;
    const bodyRows = rows
      .map((r: any) => {
        if (which === 'balances') {
          return `<tr><td>${r.fullName}</td><td>${r.staffType}</td><td>${r.accruedDays}</td><td>${r.takenDays}</td><td>${r.remainingDays}</td><td>${r.leaveLiabilityPayout ?? 0}</td></tr>`;
        }
        return `<tr><td>${r.fullName}</td><td>${r.staffType}</td><td>${r.remainingDays}</td><td>${r.dailyRate}</td><td>${r.payoutAmount}</td></tr>`;
      })
      .join('');
    win.document.write(`
      <html><head><title>${title}</title></head>
      <body>
        <h2>${title}</h2>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table border="1" cellspacing="0" cellpadding="6">
          <thead>${which === 'balances'
            ? '<tr><th>Name</th><th>Category</th><th>Accrued</th><th>Taken</th><th>Remaining</th><th>Payout</th></tr>'
            : '<tr><th>Name</th><th>Category</th><th>Remaining Days</th><th>Daily Rate</th><th>Payout</th></tr>'}
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  saveLeavePolicy(): void {
    this.leaveError = '';
    this.leaveSuccess = '';
    if (!this.canEditLeaveCompliance) {
      this.leaveError = 'Only admin or superadmin can update compliance policy.';
      return;
    }
    const months = this.leavePolicy.teachingTermMonthsText
      .split(',')
      .map((x) => Number(String(x).trim()))
      .filter((x) => Number.isFinite(x) && x >= 1 && x <= 12);
    if (this.leavePolicy.annualLeaveDaysPerYear < 30) {
      this.leaveError = 'Annual leave days must be at least 30.';
      return;
    }
    this.payrollService
      .updateLeavePolicy({
        annualLeaveDaysPerYear: Number(this.leavePolicy.annualLeaveDaysPerYear),
        excessAccruedThresholdDays: Number(this.leavePolicy.excessAccruedThresholdDays),
        maxAccrualDays: this.leavePolicy.maxAccrualDays != null ? Number(this.leavePolicy.maxAccrualDays) : null,
        carryForwardCapDays: this.leavePolicy.carryForwardCapDays != null ? Number(this.leavePolicy.carryForwardCapDays) : null,
        teachingTermMonths: months,
        notes: this.leavePolicy.notes || '',
      })
      .subscribe({
        next: () => {
          this.leaveSuccess = 'Leave compliance policy saved.';
          this.loadLeaveModuleData();
        },
        error: (err: any) => {
          this.leaveError = err?.error?.message || err?.message || 'Failed to save leave policy';
        },
      });
  }

  createLiabilityAuditSnapshot(): void {
    this.leaveError = '';
    this.leaveSuccess = '';
    if (!this.canEditLeaveCompliance) {
      this.leaveError = 'Only admin or superadmin can create liability audit snapshots.';
      return;
    }
    this.payrollService
      .createLeaveLiabilityAudit({
        asOfDate: this.leaveFilters.asOfDate,
        category: this.leaveFilters.category,
        employeeId: this.leaveFilters.employeeId || undefined,
      })
      .subscribe({
        next: (data: any) => {
          this.leaveSuccess = data?.message || 'Liability audit snapshot saved.';
          this.loadLeaveReports();
        },
        error: (err: any) => {
          this.leaveError = err?.error?.message || err?.message || 'Failed to save liability audit snapshot';
        },
      });
  }

  // ---------------- Reports ----------------
  get reportPeriodLabel(): string {
    const m = this.monthOptions.find((x) => x.value === this.reportFilters.month);
    return `${m?.label ?? 'Month'} ${this.reportFilters.year}`;
  }

  /** Departments found in the last department report (for filter dropdown). */
  get reportDepartmentOptions(): string[] {
    const raw = this.departmentRows || [];
    const set = new Set<string>();
    for (const r of raw) {
      const d = String(r?.department || '').trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /** Sorted by net descending for table + chart. */
  get departmentRowsSorted(): any[] {
    return [...(this.departmentRows || [])].sort(
      (a, b) => Number(b?.netSalaryTotal || 0) - Number(a?.netSalaryTotal || 0)
    );
  }

  get departmentBarMax(): number {
    const rows = this.departmentRowsSorted;
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => Number(r?.netSalaryTotal || 0)), 1);
  }

  departmentBarPercent(net: number | undefined): number {
    const max = this.departmentBarMax;
    if (max <= 0) return 0;
    return Math.min(100, (Number(net || 0) / max) * 100);
  }

  get departmentReportTotals(): { headcount: number; net: number } {
    const rows = this.departmentRows || [];
    let headcount = 0;
    let net = 0;
    for (const r of rows) {
      headcount += Number(r?.employeeCount || 0);
      net += Number(r?.netSalaryTotal || 0);
    }
    return { headcount, net };
  }

  /** Share of net payroll by department (for legend / insight). */
  departmentSharePercent(net: number | undefined): number {
    const t = this.departmentReportTotals.net;
    if (t <= 0) return 0;
    return Math.round((Number(net || 0) / t) * 1000) / 10;
  }

  /** Compare gross-ish components for a simple mix bar (allowances vs deductions vs net). */
  get summaryMixParts(): { net: number; allowances: number; deductions: number; total: number } {
    const s = this.monthlySummary;
    if (!s) return { net: 0, allowances: 0, deductions: 0, total: 0 };
    const net = Number(s.totalNetSalary || 0);
    const allowances = Number(s.totalAllowances || 0);
    const deductions = Number(s.totalDeductions || 0);
    const total = Math.max(net + allowances + deductions, 1);
    return { net, allowances, deductions, total };
  }

  private syncReportFiltersToCurrent(): void {
    const now = new Date();
    this.reportFilters.month = now.getMonth() + 1;
    this.reportFilters.year = now.getFullYear();
  }

  setReportPreset(preset: 'this_month' | 'last_month'): void {
    const now = new Date();
    if (preset === 'this_month') {
      this.reportFilters.month = now.getMonth() + 1;
      this.reportFilters.year = now.getFullYear();
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      this.reportFilters.month = d.getMonth() + 1;
      this.reportFilters.year = d.getFullYear();
    }
    this.reportError = '';
  }

  /** Loads monthly summary + department breakdown for the selected period. */
  loadAllReports(): void {
    this.reportLoading = true;
    this.reportError = '';
    forkJoin({
      summary: this.payrollService.getMonthlySummary({
        month: this.reportFilters.month,
        year: this.reportFilters.year
      }),
      dept: this.payrollService.getDepartmentReport({
        month: this.reportFilters.month,
        year: this.reportFilters.year,
        department: this.reportFilters.department?.trim() || undefined
      })
    }).subscribe({
      next: (res: any) => {
        this.monthlySummary = res.summary?.summary ?? null;
        this.departmentRows = res.dept?.rows ?? [];
        this.reportLoading = false;
      },
      error: (err: any) => {
        this.reportLoading = false;
        this.reportError = err?.error?.message || err?.message || 'Failed to load reports';
      }
    });
  }

  loadMonthlySummary(): void {
    this.reportLoading = true;
    this.reportError = '';
    this.payrollService.getMonthlySummary({ month: this.reportFilters.month, year: this.reportFilters.year }).subscribe({
      next: (data: any) => {
        this.monthlySummary = data?.summary || null;
        this.reportLoading = false;
      },
      error: (err: any) => {
        this.reportLoading = false;
        this.reportError = err?.error?.message || err?.message || 'Failed to load monthly summary';
      }
    });
  }

  loadDepartmentReport(): void {
    this.reportLoading = true;
    this.reportError = '';
    this.payrollService
      .getDepartmentReport({
        month: this.reportFilters.month,
        year: this.reportFilters.year,
        department: this.reportFilters.department || undefined
      })
      .subscribe({
        next: (data: any) => {
          this.departmentRows = data?.rows || [];
          this.reportLoading = false;
        },
        error: (err: any) => {
          this.reportLoading = false;
          this.reportError = err?.error?.message || err?.message || 'Failed to load department report';
        }
      });
  }

  exportReportsCsv(): void {
    const period = `${this.reportFilters.year}-${String(this.reportFilters.month).padStart(2, '0')}`;
    const lines: string[][] = [
      ['Payroll reports export', period],
      [],
      ['Monthly summary'],
      ['Period', 'Status', 'Employees', 'Total net', 'Total allowances', 'Total deductions']
    ];
    const s = this.monthlySummary;
    if (s) {
      lines.push([
        String(s.periodLabel || period),
        String(s.status || ''),
        String(s.employeeCount ?? ''),
        String(s.totalNetSalary ?? ''),
        String(s.totalAllowances ?? ''),
        String(s.totalDeductions ?? '')
      ]);
    } else {
      lines.push(['(no payroll run for this period)', '', '', '', '', '']);
    }
    lines.push([], ['Department breakdown']);
    lines.push(['Department', 'Employees', 'Net total', 'Share %']);
    for (const r of this.departmentRowsSorted) {
      lines.push([
        String(r.department || ''),
        String(r.employeeCount ?? ''),
        String(r.netSalaryTotal ?? ''),
        String(this.departmentSharePercent(r.netSalaryTotal))
      ]);
    }
    const totals = this.departmentReportTotals;
    lines.push(['TOTAL', String(totals.headcount), String(totals.net), '100']);

    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-report-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}

