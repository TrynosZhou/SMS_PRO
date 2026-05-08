import { Component, OnInit } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { InventoryService } from '../../../services/inventory.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';

type InvTab =
  | 'stock'
  | 'custody'
  | 'furnitureAllocation'
  | 'tx'
  | 'reportsFurniture'
  | 'reportsTextbooksHod'
  | 'audit'
  | 'textbookReport'
  | 'furnitureReport';

@Component({
  selector: 'app-inventory-manage',
  templateUrl: './inventory-manage.component.html',
  styleUrls: ['./inventory-manage.component.css'],
})
export class InventoryManageComponent implements OnInit {
  activeTab: InvTab = 'stock';

  error = '';
  success = '';
  loading = false;
  private alertTimer: ReturnType<typeof setTimeout> | null = null;

  stockOverview: any = null;
  catalog: any[] = [];
  copies: any[] = [];
  furniture: any[] = [];

  catalogSearch = '';
  copySearch = '';
  copyFilterCatalog: string | '' = '';
  copyFilterStatus = '';
  furnSearch = '';

  addCopyCatalogId: string | '' = '';
  addCopyCount = 1;
  addCopyCondition = 'good';

  newCatalog: { title: string; isbn: string; subject: string; gradeLevel: string } = {
    title: '',
    isbn: '',
    subject: '',
    gradeLevel: '',
  };

  newFurn: { itemType: 'desk' | 'chair'; count: number; classroomLocation: string } = {
    itemType: 'desk',
    count: 1,
    classroomLocation: '',
  };

  selectedCopyIds = new Set<string>();

  hodUsers: any[] = [];
  departmentTeachers: any[] = [];
  custodyHodUserId: string | '' = '';
  custodyTeacherId: string | '' = '';
  custodyCopyIdsText = '';
  adminBulkCatalogId: string | '' = '';
  adminBulkCount = 1;

  teacherHeldCopies: any[] = [];
  hodAllocatedCopies: any[] = [];
  /** HOD: copies currently with teachers under this HOD (from API). */
  hodIssuedToTeachersCount = 0;
  private hodBookSelection = new Set<string>();

  quickIssueOpen = false;
  quickIssueBookNumber = '';
  /** Catalog for the copy being issued (one title per student). */
  quickIssueCatalogId = '';
  quickIssueCatalogTitle = '';
  quickIssueClassId: string | '' = '';
  quickIssueStudentId: string | '' = '';
  quickIssueClassStudents: any[] = [];
  /** Students in selected class who already hold this catalog title. */
  quickIssueBlockedStudentIds = new Set<string>();
  quickIssueLoading = false;
  recentQuickIssue: { bookNumber: string; studentLabel: string; issuedAt: Date } | null = null;

  students: any[] = [];
  studentPickQuery = '';
  txStudentId: string | '' = '';
  txCopyId = '';
  txCourseLabel = '';
  txIssueId = '';
  txLoanDays: number | null = null;
  txDueAt = '';
  txLoanId = '';
  txDeskId = '';
  txChairId = '';
  txAssignmentId = '';

  reportFrom = '';
  reportTo = '';
  reportStudentId = '';
  reportClassId = '';

  adminClassTeacherFurnitureLoading = false;
  adminClassTeacherFurnitureItems: any[] = [];
  adminHodTextbooksLoading = false;
  adminHodTextbookItems: any[] = [];
  adminClearInvalidHodLoading = false;

  auditRows: any[] = [];
  auditQuery = '';

  teacher: any = null;
  teachingClassIds: string[] = [];
  classTeacherClassIds: string[] = [];

  teacherTextbookReportLoading = false;
  teacherFurnitureReportLoading = false;
  teacherReportTextbooks: any[] = [];
  teacherReportFurniture: any[] = [];

  classTeachersForFurniture: any[] = [];
  furAdminTeacherId: string | '' = '';
  furAdminDeskCount: number | null = null;
  furAdminChairCount: number | null = null;
  furAdminTransferLoading = false;
  myFurniturePool: any[] = [];

  furnitureAssignOpen = false;
  /** When set, allocating matched desk + chair together (one or both IDs sent per student need). */
  furnitureAssignPair: { desk: any; chair: any } | null = null;
  furnitureAssignLoading = false;
  furnitureAssignQuery = '';
  furnitureCoverageByStudent: Record<string, { hasDesk: boolean; hasChair: boolean }> = {};

  termReturnStudentCode = '';
  termReturnLoading = false;
  termReturnRows: any[] = [];
  termReturnCondByBook: Record<string, 'good' | 'torn' | 'lost'> = {};
  termReturnFlagByBook: Record<string, 'pending' | 'cleared' | 'not_cleared'> = {};

  constructor(
    private inv: InventoryService,
    private studentsApi: StudentService,
    public auth: AuthService,
    private teacherService: TeacherService
  ) {}

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) return;

    this.pickInitialTab();

    if (this.isAdmin()) {
      this.inv.listClassTeachersForFurniture().subscribe({
        next: rows => (this.classTeachersForFurniture = rows || []),
        error: () => (this.classTeachersForFurniture = []),
      });
    }

    if (!this.isTeacher()) {
      this.loadStock();
      this.loadStudents();
      if (this.isAdmin()) {
        this.inv.listHods().subscribe({ next: h => (this.hodUsers = h || []), error: () => (this.hodUsers = []) });
      }
    } else {
      this.loadStudents();
      // Teachers do not have access to the global textbook copies listing endpoint.
      // They work from their held copies list (custody) + teacher reports.
      this.refreshCustody();
      this.loadTeacherProfile();
    }

    if (this.isHod()) {
      this.inv.listDepartmentTeachers().subscribe({
        next: t => (this.departmentTeachers = t || []),
        error: () => (this.departmentTeachers = []),
      });
    }

    if (this.activeTab === 'tx' && this.isTeacher()) {
      this.loadMyFurniturePool();
    }
  }

  private pickInitialTab(): void {
    if (this.isTeacherNavRestricted()) {
      this.activeTab = 'custody';
    } else {
      this.activeTab = 'stock';
    }
  }

  private userRoleLc(): string {
    return String(this.auth.getCurrentUser()?.role || '').toLowerCase();
  }

  isAdmin(): boolean {
    const r = this.userRoleLc();
    return r === 'admin' || r === 'superadmin';
  }

  isHod(): boolean {
    const u = this.auth.getCurrentUser();
    const r = String(u?.role || '').toLowerCase();
    const tr = String(u?.teacher?.role || '').toLowerCase();
    return r === 'hod' || tr === 'hod';
  }

  /** Teacher or HOD accounts — template “teacher-only” areas (reports, scope). */
  isTeacher(): boolean {
    const r = this.userRoleLc();
    return r === 'teacher' || r === 'hod';
  }

  /** True when navigation should be limited to custody / tx / teacher reports. */
  isTeacherNavRestricted(): boolean {
    return this.isTeacher() && !this.isAdmin();
  }

  isClassTeacher(): boolean {
    return this.classTeacherClassIds.length > 0;
  }

  private studentInClassTeacherScope(s: any): boolean {
    if (!this.classTeacherClassIds.length) return false;
    return this.studentClassIds(s).some(id => this.classTeacherClassIds.includes(id));
  }

  get classTeacherStudents(): any[] {
    if (!this.isTeacher() || !this.isClassTeacher()) return [];
    let list = (this.students || []).filter(s => s && s.isActive !== false && this.studentInClassTeacherScope(s));
    const q = (this.furnitureAssignQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(s => this.studentLabel(s).toLowerCase().includes(q));
  }

  private reloadTeacherFurnitureCoverage(): void {
    if (!this.isTeacher() || !this.isClassTeacher()) {
      this.furnitureCoverageByStudent = {};
      return;
    }
    this.inv.reportTeacherClassFurniture().subscribe({
      next: res => {
        const rows = res?.furniture || [];
        const map: Record<string, { hasDesk: boolean; hasChair: boolean }> = {};
        for (const r of rows) {
          const sid = String(r?.studentId || '').trim();
          if (!sid) continue;
          const deskCode = String(r?.deskCode || '').trim();
          const chairCode = String(r?.chairCode || '').trim();
          if (!map[sid]) map[sid] = { hasDesk: false, hasChair: false };
          if (deskCode && deskCode !== '—') map[sid].hasDesk = true;
          if (chairCode && chairCode !== '—') map[sid].hasChair = true;
        }
        this.furnitureCoverageByStudent = map;
      },
      error: () => {
        this.furnitureCoverageByStudent = {};
      },
    });
  }

  isTeacherHod(): boolean {
    return this.isTeacher() && this.isHod();
  }

  setTab(tab: InvTab | 'reports'): void {
    let t = tab as InvTab;
    const tabStr = String(tab);
    if (tabStr === 'issues' || tabStr === 'fines' || tabStr === 'settings') {
      t = 'stock';
    }
    if (tabStr === 'reports') {
      t = this.isTeacherNavRestricted() ? 'textbookReport' : 'reportsFurniture';
    }
    if (!this.isTeacher() && t === 'tx') {
      t = 'stock';
    }
    if (this.isTeacherNavRestricted()) {
      const ok = new Set<InvTab>(['custody', 'furnitureAllocation', 'tx', 'textbookReport', 'furnitureReport']);
      if (!ok.has(t)) {
        t = 'custody';
      }
    }
    this.activeTab = t;

    if (t === 'stock' && !this.isTeacher()) {
      this.loadStock();
    }
    if (t === 'custody') {
      this.refreshCustody();
    }
    if (t === 'furnitureAllocation') {
      this.loadMyFurniturePool();
      if (this.isTeacher()) this.reloadTeacherFurnitureCoverage();
      if (this.isAdmin()) this.loadFurniture();
    }
    if (t === 'tx' && this.isTeacher()) {
      this.loadMyFurniturePool();
    }
    if (t === 'textbookReport') {
      this.loadTeacherTextbookReport();
    }
    if (t === 'furnitureReport') {
      this.loadTeacherFurnitureReport();
    }
    if (t === 'reportsFurniture') {
      this.loadAdminClassTeacherFurnitureReport();
    }
    if (t === 'reportsTextbooksHod') {
      if (this.isAdmin()) {
        this.clearInvalidHodTextbookHoldings(true);
      } else {
        this.loadAdminHodTextbooksReport();
      }
    }
    if (t === 'audit') {
      this.loadAudit();
    }
  }

  loadAdminClassTeacherFurnitureReport(): void {
    if (this.isTeacher()) return;
    this.adminClassTeacherFurnitureLoading = true;
    this.inv.reportFurnitureWithClassTeachers().subscribe({
      next: res => {
        this.adminClassTeacherFurnitureItems = res?.items || [];
        this.adminClassTeacherFurnitureLoading = false;
      },
      error: () => {
        this.adminClassTeacherFurnitureItems = [];
        this.adminClassTeacherFurnitureLoading = false;
        this.flushMsg('err', 'Failed to load furniture report.');
      },
    });
  }

  loadAdminHodTextbooksReport(): void {
    if (this.isTeacher()) return;
    this.adminHodTextbooksLoading = true;
    this.inv.reportTextbooksAllocatedToHods().subscribe({
      next: res => {
        this.adminHodTextbookItems = res?.items || [];
        this.adminHodTextbooksLoading = false;
      },
      error: () => {
        this.adminHodTextbookItems = [];
        this.adminHodTextbooksLoading = false;
        this.flushMsg('err', 'Failed to load HOD textbook report.');
      },
    });
  }

  /**
   * @param silentWhenZero If true (e.g. auto-run on tab open), no toast when nothing to clear.
   */
  clearInvalidHodTextbookHoldings(silentWhenZero = false): void {
    if (!this.isAdmin()) return;
    this.adminClearInvalidHodLoading = true;
    this.inv.clearInvalidHodTextbookHoldings().subscribe({
      next: r => {
        this.adminClearInvalidHodLoading = false;
        const n = Number(r?.cleared ?? 0);
        if (n > 0) {
          this.flushMsg('ok', `Returned ${n} textbook copy/copies to central stock (missing HOD department or HOD name).`);
        } else if (!silentWhenZero) {
          this.flushMsg('ok', 'No invalid HOD holdings to clear.');
        }
        this.loadAdminHodTextbooksReport();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => {
        this.adminClearInvalidHodLoading = false;
        this.flushMsg('err', err.error?.message || 'Clear failed');
        this.loadAdminHodTextbooksReport();
      },
    });
  }

  flushMsg(kind: 'ok' | 'err', text: string, ms = 5000): void {
    if (this.alertTimer) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
    if (kind === 'ok') {
      this.success = text;
      this.error = '';
    } else {
      this.error = text;
      this.success = '';
    }
    this.alertTimer = setTimeout(() => this.dismissAlert(), ms);
  }

  dismissAlert(): void {
    this.error = '';
    this.success = '';
    if (this.alertTimer) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
  }

  trackById(_i: number, row: any): string {
    return row?.id ?? row?.copyId ?? String(_i);
  }

  trackByPairKey(_i: number, row: any): string {
    return String(row?.key || _i);
  }

  studentLabel(s: any): string {
    if (!s) return '—';
    const num = s.studentNumber || s.studentId || s.id || '';
    const name = [s.lastName, s.firstName].filter(Boolean).join(' ').trim() || s.fullName || '';
    const parts = [name, num ? `(${num})` : ''].filter(Boolean);
    return parts.join(' ').trim() || String(s.id || '—');
  }

  statusPillClass(status: string | undefined): string {
    const s = String(status || '').toLowerCase();
    const base = 'inv-pill';
    if (s === 'in_stock' || s === 'paid') return `${base} inv-pill--muted`;
    if (s === 'on_loan' || s === 'permanent_out' || s === 'assigned' || s === 'with_teacher' || s === 'with_hod')
      return `${base} inv-pill--warn`;
    if (s === 'lost') return `${base} inv-pill--danger`;
    return base;
  }

  statusLabel(status: string | undefined): string {
    const map: Record<string, string> = {
      in_stock: 'In stock',
      on_loan: 'On loan',
      permanent_out: 'Issued',
      with_teacher: 'With teacher',
      with_hod: 'With HOD',
      with_student: 'With student',
      lost: 'Lost',
      assigned: 'Assigned',
    };
    const s = String(status || '');
    return map[s] || s || '—';
  }

  copyJson(label: string, data: unknown): void {
    const text = JSON.stringify(data ?? [], null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.flushMsg('ok', `${label} copied to clipboard.`),
        () => this.flushMsg('err', 'Could not copy to clipboard.')
      );
    } else {
      this.flushMsg('err', 'Clipboard not available.');
    }
  }

  copyTextbookCopyId(tag: string): void {
    const t = String(tag || '').trim();
    if (!t) return;
    navigator.clipboard?.writeText(t).then(
      () => this.flushMsg('ok', 'Book number copied.'),
      () => this.flushMsg('err', 'Copy failed.')
    );
  }

  catalogAvailableCount(c: any): number {
    const n = c?.availableCopies;
    if (n == null || Number.isNaN(Number(n))) return 0;
    return Number(n);
  }

  catalogTotalCount(c: any): number {
    const n = c?.totalCopies ?? c?.copyCount;
    if (n == null || Number.isNaN(Number(n))) return 0;
    return Number(n);
  }

  get kpiBooksInStock(): number {
    const rows = this.stockOverview?.textbookCounts || [];
    return rows.filter((r: any) => r.status === 'in_stock').reduce((a: number, r: any) => a + (Number(r.count) || 0), 0);
  }

  get kpiBooksIssuedLoaned(): number {
    const rows = this.stockOverview?.textbookCounts || [];
    return rows
      .filter((r: any) => r.status === 'on_loan' || r.status === 'permanent_out' || r.status === 'with_student')
      .reduce((a: number, r: any) => a + (Number(r.count) || 0), 0);
  }

  get kpiBooksLost(): number {
    const rows = this.stockOverview?.textbookCounts || [];
    return rows.filter((r: any) => r.status === 'lost').reduce((a: number, r: any) => a + (Number(r.count) || 0), 0);
  }

  get kpiFurnitureUnits(): number {
    const rows = this.stockOverview?.furnitureCounts || [];
    return rows.reduce((a: number, r: any) => a + (Number(r.count) || 0), 0);
  }

  get filteredCatalog(): any[] {
    const q = (this.catalogSearch || '').trim().toLowerCase();
    if (!q) return this.catalog;
    return this.catalog.filter(
      c =>
        String(c.title || '')
          .toLowerCase()
          .includes(q) ||
        String(c.isbn || '')
          .toLowerCase()
          .includes(q) ||
        String(c.subject || '')
          .toLowerCase()
          .includes(q)
    );
  }

  get filteredCopies(): any[] {
    const q = (this.copySearch || '').trim().toLowerCase();
    let list = this.copies;
    if (q) {
      list = list.filter(
        c =>
          String(c.assetTag || '')
            .toLowerCase()
            .includes(q) ||
          String(c.id || '')
            .toLowerCase()
            .includes(q) ||
          String(c.catalog?.title || '')
            .toLowerCase()
            .includes(q)
      );
    }
    return list;
  }

  get filteredFurniture(): any[] {
    const q = (this.furnSearch || '').trim().toLowerCase();
    if (!q) return this.furniture;
    return this.furniture.filter(
      f =>
        String(f.itemCode || '')
          .toLowerCase()
          .includes(q) ||
        String(f.itemType || '')
          .toLowerCase()
          .includes(q) ||
        String(f.classroomLocation || '')
          .toLowerCase()
          .includes(q)
    );
  }

  get copyStatusCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.copies) {
      const st = String(c.status || '');
      out[st] = (out[st] || 0) + 1;
    }
    return out;
  }

  get selectedCopyCount(): number {
    return this.selectedCopyIds.size;
  }

  get allFilteredCopiesSelected(): boolean {
    const vis = this.filteredCopies;
    return vis.length > 0 && vis.every((c: any) => this.selectedCopyIds.has(c.id));
  }

  quickFilterCopies(status: string): void {
    this.copyFilterStatus = status;
    this.loadCopies();
  }

  toggleCopySelection(id: string, checked: boolean): void {
    if (checked) this.selectedCopyIds.add(id);
    else this.selectedCopyIds.delete(id);
  }

  isCopySelected(id: string): boolean {
    return this.selectedCopyIds.has(id);
  }

  toggleAllFilteredCopies(checked: boolean): void {
    if (checked) {
      for (const c of this.filteredCopies) {
        if (c?.id) this.selectedCopyIds.add(c.id);
      }
    } else {
      for (const c of this.filteredCopies) {
        if (c?.id) this.selectedCopyIds.delete(c.id);
      }
    }
  }

  loadStock(): void {
    this.loading = true;
    forkJoin({
      overview: this.inv.getStockOverview().pipe(catchError(() => of(null))),
      catalog: this.inv.listCatalog().pipe(catchError(() => of([]))),
      copies: this.inv
        .listCopies({
          catalogId: this.copyFilterCatalog || undefined,
          status: this.copyFilterStatus || undefined,
        })
        .pipe(catchError(() => of([]))),
      furniture: this.inv.listFurniture().pipe(catchError(() => of([]))),
    }).subscribe({
      next: res => {
        this.stockOverview = res.overview;
        this.catalog = res.catalog || [];
        this.copies = res.copies || [];
        this.furniture = res.furniture || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.flushMsg('err', 'Failed to load stock');
      },
    });
  }

  loadCopies(): void {
    this.inv
      .listCopies({
        catalogId: this.copyFilterCatalog || undefined,
        status: this.copyFilterStatus || undefined,
      })
      .subscribe({
        next: rows => (this.copies = rows || []),
        error: () => this.flushMsg('err', 'Failed to load copies'),
      });
  }

  loadFurniture(): void {
    this.inv.listFurniture().subscribe({
      next: rows => (this.furniture = rows || []),
      error: () => this.flushMsg('err', 'Failed to load furniture'),
    });
  }

  createCatalog(): void {
    const t = (this.newCatalog.title || '').trim();
    if (!t) {
      this.flushMsg('err', 'Title is required.');
      return;
    }
    this.inv
      .createCatalog({
        title: t,
        isbn: (this.newCatalog.isbn || '').trim() || undefined,
        subject: (this.newCatalog.subject || '').trim() || undefined,
        gradeLevel: (this.newCatalog.gradeLevel || '').trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.newCatalog = { title: '', isbn: '', subject: '', gradeLevel: '' };
          this.flushMsg('ok', 'Catalog title added.');
          this.loadStock();
        },
        error: err => this.flushMsg('err', err.error?.message || 'Create failed'),
      });
  }

  bulkCopies(): void {
    const cid = String(this.addCopyCatalogId || '').trim();
    const n = Math.min(500, Math.max(1, Number(this.addCopyCount) || 1));
    if (!cid) {
      this.flushMsg('err', 'Select a catalog title.');
      return;
    }
    this.inv.addCopies(cid, { count: n, condition: this.addCopyCondition }).subscribe({
      next: () => {
        this.flushMsg('ok', 'Copies added.');
        this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Add copies failed'),
    });
  }

  createFurn(): void {
    const n = Math.max(1, Number(this.newFurn.count) || 0);
    if (n < 1) return;
    this.inv
      .createFurniture({
        itemType: this.newFurn.itemType,
        count: n,
        classroomLocation: (this.newFurn.classroomLocation || '').trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.flushMsg('ok', 'Furniture registered.');
          this.newFurn = { itemType: 'desk', count: 1, classroomLocation: '' };
          this.loadFurniture();
          if (!this.isTeacher()) this.loadStock();
        },
        error: err => this.flushMsg('err', err.error?.message || 'Create furniture failed'),
      });
  }

  markCopyLost(id: string): void {
    this.inv.markTextbookLost(id, {}).subscribe({
      next: () => {
        this.flushMsg('ok', 'Copy marked lost.');
        this.loadCopies();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Failed'),
    });
  }

  markFurnLost(id: string): void {
    this.inv.markFurnitureLost(id, {}).subscribe({
      next: () => {
        this.flushMsg('ok', 'Furniture marked lost.');
        this.loadFurniture();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Failed'),
    });
  }

  deleteCopy(id: string): void {
    if (!this.isAdmin()) return;
    this.inv.deleteTextbookCopy(id).subscribe({
      next: () => {
        this.flushMsg('ok', 'Copy deleted.');
        this.selectedCopyIds.delete(id);
        this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Delete failed'),
    });
  }

  deleteSelectedCopies(): void {
    if (!this.isAdmin() || !this.selectedCopyIds.size) return;
    const ids = [...this.selectedCopyIds];
    let left = ids.length;
    let failed = false;
    for (const id of ids) {
      this.inv.deleteTextbookCopy(id).subscribe({
        next: () => {
          left--;
          if (left === 0) {
            this.selectedCopyIds.clear();
            if (!failed) this.flushMsg('ok', 'Selected copies deleted.');
            this.loadStock();
          }
        },
        error: () => {
          failed = true;
          left--;
          if (left === 0) {
            this.flushMsg('err', 'Some deletes failed.');
            this.loadStock();
          }
        },
      });
    }
  }

  parseBookNumberList(text: string): string[] {
    return String(text || '')
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  custodyBookNumbers(): string[] {
    return this.parseBookNumberList(this.custodyCopyIdsText);
  }

  /** HOD → teacher: table checkboxes plus optional pasted BookNumbers (deduped). */
  hodToTeacherBookNumbers(): string[] {
    const set = new Set<string>();
    for (const b of this.selectedHodBookNumberList) {
      const k = String(b || '').trim();
      if (k) set.add(k);
    }
    for (const b of this.custodyBookNumbers()) {
      const k = String(b || '').trim();
      if (k) set.add(k);
    }
    return [...set];
  }

  get selectedHodBookNumberList(): string[] {
    return [...this.hodBookSelection];
  }

  isHodBookSelected(tag: string): boolean {
    return this.hodBookSelection.has(String(tag || '').trim());
  }

  toggleHodBookSelection(tag: string, checked: boolean): void {
    const k = String(tag || '').trim();
    if (!k) return;
    if (checked) this.hodBookSelection.add(k);
    else this.hodBookSelection.delete(k);
  }

  get allHodBooksSelected(): boolean {
    const rows = this.hodAllocatedCopies.filter(c => (c.assetTag || '').trim());
    return rows.length > 0 && rows.every((c: any) => this.hodBookSelection.has(String(c.assetTag || '').trim()));
  }

  toggleAllHodBooks(checked: boolean): void {
    if (checked) {
      for (const c of this.hodAllocatedCopies) {
        const t = String(c.assetTag || '').trim();
        if (t) this.hodBookSelection.add(t);
      }
    } else {
      this.hodBookSelection.clear();
    }
  }

  doAdminToHod(): void {
    const hodUserId = String(this.custodyHodUserId || '').trim();
    if (!hodUserId) {
      this.flushMsg('err', 'Select a HOD.');
      return;
    }
    const count = Math.max(1, Number(this.adminBulkCount) || 1);
    const catalogId = String(this.adminBulkCatalogId || '').trim() || undefined;
    this.inv.transferAdminToHod({ hodUserId, catalogId, count }).subscribe({
      next: r => {
        this.flushMsg('ok', `Transferred ${r?.transferred ?? ''} copy(ies) to HOD.`);
        this.refreshCustody();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Transfer failed'),
    });
  }

  doHodToTeacher(): void {
    const teacherId = String(this.custodyTeacherId || '').trim();
    const bookNumbers = this.hodToTeacherBookNumbers();
    if (!teacherId || !bookNumbers.length) {
      const hint = this.isTeacherNavRestricted()
        ? 'Select a teacher in your department and tick at least one textbook in the table above.'
        : 'Select a teacher in your department and at least one textbook (use the checkboxes and/or the optional BookNumbers field).';
      this.flushMsg('err', hint);
      return;
    }
    this.inv.transferHodToTeacher({ teacherId, bookNumbers }).subscribe({
      next: r => {
        this.flushMsg('ok', `Transferred ${r?.transferred ?? ''} copy(ies) to teacher.`);
        this.custodyCopyIdsText = '';
        this.hodBookSelection.clear();
        this.refreshCustody();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Transfer failed'),
    });
  }

  refreshCustody(): void {
    const u = this.auth.getCurrentUser();
    if (this.isHod() && u?.id) {
      this.inv.listCopies({ status: 'with_hod' }).subscribe({
        next: rows => {
          this.hodAllocatedCopies = (rows || []).filter((c: any) => String(c.currentHodUserId) === String(u.id));
        },
        error: () => (this.hodAllocatedCopies = []),
      });
      this.inv.getHodIssuedToTeachersCount().subscribe({
        next: res => (this.hodIssuedToTeachersCount = Number(res?.issuedToTeachers ?? 0)),
        error: () => (this.hodIssuedToTeachersCount = 0),
      });
    } else {
      this.hodIssuedToTeachersCount = 0;
    }
    if (String(u?.role || '').toLowerCase() === 'teacher') {
      this.inv.listMyHeldTextbooks().subscribe({
        next: rows => (this.teacherHeldCopies = rows || []),
        error: () => (this.teacherHeldCopies = []),
      });
    } else {
      this.teacherHeldCopies = [];
    }
  }

  openQuickIssueModal(c: any): void {
    const tag = String(c?.assetTag || '').trim();
    if (!tag) return;
    this.quickIssueBookNumber = tag;
    this.quickIssueCatalogId = String(c?.catalogId || c?.catalog?.id || '').trim();
    this.quickIssueCatalogTitle = String(c?.catalog?.title || '').trim();
    this.quickIssueClassId = '';
    this.quickIssueStudentId = '';
    this.quickIssueClassStudents = [];
    this.quickIssueBlockedStudentIds = new Set();
    this.quickIssueOpen = true;
  }

  closeQuickIssueModal(): void {
    this.quickIssueOpen = false;
    this.quickIssueLoading = false;
    this.quickIssueBlockedStudentIds = new Set();
    this.quickIssueCatalogId = '';
    this.quickIssueCatalogTitle = '';
  }

  studentBlockedForQuickIssue(studentId: string): boolean {
    return this.quickIssueBlockedStudentIds.has(String(studentId || '').trim());
  }

  private refreshQuickIssueBlockedStudents(classId: string): void {
    const cat = String(this.quickIssueCatalogId || '').trim();
    if (!cat) {
      this.quickIssueBlockedStudentIds = new Set();
      return;
    }
    this.inv.getBlockedStudentsForTextbookIssue(classId, cat).subscribe({
      next: res => {
        this.quickIssueBlockedStudentIds = new Set(
          (res?.blockedStudentIds || []).map((x: string) => String(x))
        );
        if (this.quickIssueStudentId && this.studentBlockedForQuickIssue(this.quickIssueStudentId)) {
          this.quickIssueStudentId = '';
        }
      },
      error: () => (this.quickIssueBlockedStudentIds = new Set()),
    });
  }

  get teacherClassOptions(): any[] {
    const cls = this.teacher?.classes || [];
    return Array.isArray(cls) ? [...cls] : [];
  }

  onQuickIssueClassChange(): void {
    const cid = String(this.quickIssueClassId || '').trim();
    this.quickIssueStudentId = '';
    this.quickIssueClassStudents = [];
    this.quickIssueBlockedStudentIds = new Set();
    if (!cid) return;
    this.studentsApi.getStudents({ classId: cid, limit: 500 }).subscribe({
      next: (data: any) => {
        const raw = Array.isArray(data) ? data : data?.students || data?.data || [];
        this.quickIssueClassStudents = (raw || []).filter((s: any) => s.isActive !== false);
        this.refreshQuickIssueBlockedStudents(cid);
      },
      error: () => (this.quickIssueClassStudents = []),
    });
  }

  issueQuickToStudent(studentIdArg?: string): void {
    const studentId = String(studentIdArg || this.quickIssueStudentId || '').trim();
    const bn = String(this.quickIssueBookNumber || '').trim();
    if (!studentId || !bn) {
      this.flushMsg('err', 'Select a student.');
      return;
    }
    if (this.studentBlockedForQuickIssue(studentId)) {
      this.flushMsg('err', 'This student already has a textbook for this title. Only one copy per title is allowed.');
      return;
    }
    this.quickIssueLoading = true;
    this.inv.transferTeacherToStudent({ studentId, bookNumbers: [bn] }).subscribe({
      next: () => {
        const s = this.quickIssueClassStudents.find((x: any) => x.id === studentId) || this.students.find((x: any) => x.id === studentId);
        this.recentQuickIssue = { bookNumber: bn, studentLabel: this.studentLabel(s), issuedAt: new Date() };
        this.flushMsg('ok', 'Textbook issued to student.');
        this.quickIssueLoading = false;
        this.closeQuickIssueModal();
        this.refreshCustody();
        if (this.isTeacher()) this.loadTeacherTextbookReport();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => {
        this.quickIssueLoading = false;
        this.flushMsg('err', err.error?.message || 'Issue failed');
      },
    });
  }

  loadTeacherProfile(): void {
    if (!this.isTeacher()) return;
    this.teacherService.getCurrentTeacher().subscribe({
      next: (t: any) => {
        this.teacher = t;
        const cls = t?.classes || [];
        this.teachingClassIds = cls.map((c: any) => c?.id).filter(Boolean);
        this.classTeacherClassIds = cls
          .filter((c: any) => String(c?.classTeacherId || '') === String(t?.id))
          .map((c: any) => c.id)
          .filter(Boolean);
        if (this.isTeacher()) {
          this.loadMyFurniturePool();
        }
      },
      error: () => {
        this.teacher = null;
        this.teachingClassIds = [];
        this.classTeacherClassIds = [];
      },
    });
  }

  studentClassIds(s: any): string[] {
    const out = new Set<string>();
    if (s?.classId) out.add(String(s.classId));
    for (const e of s?.enrollments || []) {
      if (e?.isActive && e?.classId) out.add(String(e.classId));
    }
    return [...out];
  }

  studentInTeachingScope(s: any): boolean {
    if (!this.teachingClassIds.length) return false;
    return this.studentClassIds(s).some(id => this.teachingClassIds.includes(id));
  }

  filterStudentsForTeacherScope(list: any[]): any[] {
    if (!this.isTeacher() || this.isAdmin()) return list;
    return list.filter(s => this.studentInTeachingScope(s));
  }

  get filteredStudents(): any[] {
    let list = this.filterStudentsForTeacherScope(this.students);
    const q = (this.studentPickQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(s => {
      const blob = `${this.studentLabel(s)} ${s?.studentNumber || ''} ${s?.id || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }

  loadStudents(): void {
    this.studentsApi.getStudents({ limit: 2000 }).subscribe({
      next: (data: any) => {
        const raw = Array.isArray(data) ? data : data?.students || data?.data || [];
        this.students = (raw || []).filter((s: any) => s.isActive !== false);
      },
      error: () => (this.students = []),
    });
  }

  clearTransactionDrafts(): void {
    this.txStudentId = '';
    this.txCopyId = '';
    this.txCourseLabel = '';
    this.txIssueId = '';
    this.txLoanDays = null;
    this.txDueAt = '';
    this.txLoanId = '';
    this.txDeskId = '';
    this.txChairId = '';
    this.txAssignmentId = '';
    this.studentPickQuery = '';
  }

  applyLoanDaysPreset(n: number): void {
    this.txLoanDays = n;
  }

  private toDatetimeLocalValue(d: Date): string {
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  useLoanDueDate(days: number): void {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, Number(days) || 1));
    d.setHours(23, 59, 0, 0);
    this.txDueAt = this.toDatetimeLocalValue(d);
  }

  private resolveTextbookCopyId(ref: string): string | null {
    const r = String(ref || '').trim();
    if (!r) return null;
    const pool = this.isTeacher() && this.isTeacherNavRestricted() ? this.teacherHeldCopies : this.copies;
    const byTag = pool.find(c => String(c.assetTag || '').trim().toLowerCase() === r.toLowerCase());
    if (byTag?.id) return byTag.id;
    const byId = pool.find(c => String(c.id) === r);
    return byId?.id || null;
  }

  doPermanentIssue(): void {
    const studentId = String(this.txStudentId || '').trim();
    const copyId = this.resolveTextbookCopyId(this.txCopyId);
    if (!studentId || !copyId) {
      this.flushMsg('err', 'Select a student and a valid BookNumber.');
      return;
    }
    this.inv.permanentIssue({ studentId, copyId, courseLabel: (this.txCourseLabel || '').trim() || undefined }).subscribe({
      next: () => {
        this.flushMsg('ok', 'Permanent issue recorded.');
        this.loadCopies();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Issue failed'),
    });
  }

  doPermanentReturn(): void {
    const copyId = this.resolveTextbookCopyId(this.txCopyId);
    const issueId = String(this.txIssueId || '').trim() || undefined;
    if (!copyId && !issueId) {
      this.flushMsg('err', 'Enter BookNumber or issue ID.');
      return;
    }
    const body: any = {};
    if (issueId) body.issueId = issueId;
    else body.copyId = copyId;
    this.inv.permanentReturn(body).subscribe({
      next: () => {
        this.flushMsg('ok', 'Return recorded.');
        this.loadCopies();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Return failed'),
    });
  }

  doBorrow(): void {
    const studentId = String(this.txStudentId || '').trim();
    const copyId = this.resolveTextbookCopyId(this.txCopyId);
    if (!studentId || !copyId) {
      this.flushMsg('err', 'Select a student and a valid BookNumber.');
      return;
    }
    const body: any = { studentId, copyId };
    if (this.txDueAt) body.dueAt = this.txDueAt;
    else if (this.txLoanDays != null && this.txLoanDays > 0) body.loanDays = this.txLoanDays;
    this.inv.borrow(body).subscribe({
      next: () => {
        this.flushMsg('ok', 'Loan created.');
        this.loadCopies();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Borrow failed'),
    });
  }

  doReturnLoan(): void {
    const loanId = String(this.txLoanId || '').trim();
    if (!loanId) {
      this.flushMsg('err', 'Loan ID required.');
      return;
    }
    this.inv.returnLoan({ loanId }).subscribe({
      next: () => {
        this.flushMsg('ok', 'Loan checked in.');
        this.loadCopies();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Return failed'),
    });
  }

  doFurnitureIssue(): void {
    const studentId = String(this.txStudentId || '').trim();
    if (!studentId) {
      this.flushMsg('err', 'Select a student.');
      return;
    }
    const body: any = { studentId };
    const desk = String(this.txDeskId || '').trim();
    const chair = String(this.txChairId || '').trim();
    if (desk) body.deskId = desk;
    if (chair) body.chairId = chair;
    this.inv.issueFurniture(body).subscribe({
      next: () => {
        this.flushMsg('ok', 'Furniture assigned.');
        this.loadFurniture();
        this.loadMyFurniturePool();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Assign failed'),
    });
  }

  doFurnitureRevoke(): void {
    const assignmentId = String(this.txAssignmentId || '').trim();
    if (!assignmentId) {
      this.flushMsg('err', 'Assignment ID required.');
      return;
    }
    this.inv.revokeFurniture({ assignmentId }).subscribe({
      next: () => {
        this.flushMsg('ok', 'Assignment revoked.');
        this.loadFurniture();
        this.loadMyFurniturePool();
        if (!this.isTeacher()) this.loadStock();
      },
      error: err => this.flushMsg('err', err.error?.message || 'Revoke failed'),
    });
  }

  applyAutoLoss(): void {
    this.inv.applyAutoLoss().subscribe({
      next: (r: any) => this.flushMsg('ok', `Auto-loss processed (${r?.processed ?? 0} loan(s)).`),
      error: err => this.flushMsg('err', err.error?.message || 'Job failed'),
    });
  }

  reportParams(): HttpParams {
    let p = new HttpParams();
    if (this.reportFrom) p = p.set('from', this.reportFrom);
    if (this.reportTo) p = p.set('to', this.reportTo);
    if (this.reportStudentId.trim()) p = p.set('studentId', this.reportStudentId.trim());
    if (this.reportClassId.trim()) p = p.set('classId', this.reportClassId.trim());
    return p;
  }

  loadTeacherTextbookReport(): void {
    this.teacherTextbookReportLoading = true;
    this.inv.reportTeacherTextbooksIssued().subscribe({
      next: res => {
        this.teacherReportTextbooks = res?.textbooks || [];
        this.teacherTextbookReportLoading = false;
      },
      error: () => {
        this.teacherTextbookReportLoading = false;
        this.teacherReportTextbooks = [];
        this.flushMsg('err', 'Failed to load textbook report');
      },
    });
  }

  loadTeacherFurnitureReport(): void {
    this.teacherFurnitureReportLoading = true;
    this.inv.reportTeacherClassFurniture().subscribe({
      next: res => {
        this.teacherReportFurniture = res?.furniture || [];
        this.teacherFurnitureReportLoading = false;
      },
      error: () => {
        this.teacherFurnitureReportLoading = false;
        this.teacherReportFurniture = [];
        this.flushMsg('err', 'Failed to load furniture report');
      },
    });
  }

  loadAudit(): void {
    this.inv.auditLog(this.reportParams()).subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) this.auditRows = data;
        else if (Array.isArray(data?.data)) this.auditRows = data.data;
        else this.auditRows = [];
      },
      error: () => {
        this.auditRows = [];
        this.flushMsg('err', 'Audit load failed');
      },
    });
  }

  get filteredAuditRows(): any[] {
    const q = (this.auditQuery || '').trim().toLowerCase();
    if (!q) return this.auditRows;
    return this.auditRows.filter((a: any) => {
      const blob = `${a.action} ${a.entityType} ${a.entityId} ${a.performedBy?.username || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }

  loadMyFurniturePool(): void {
    if (!this.isTeacher()) return;
    this.inv.listMyFurniturePool().subscribe({
      next: rows => (this.myFurniturePool = rows || []),
      error: () => (this.myFurniturePool = []),
    });
  }

  openFurnitureAssignFromPool(pair: { desk: any; chair: any }): void {
    if (!this.isTeacher() || !this.isClassTeacher()) {
      this.flushMsg('err', 'You are not assigned as class teacher for any class.');
      return;
    }
    if (!pair?.desk || !pair?.chair) return;
    this.furnitureAssignPair = { desk: pair.desk, chair: pair.chair };
    this.furnitureAssignQuery = '';
    this.reloadTeacherFurnitureCoverage();
    this.furnitureAssignOpen = true;
  }

  closeFurnitureAssign(): void {
    if (this.furnitureAssignLoading) return;
    this.furnitureAssignOpen = false;
    this.furnitureAssignPair = null;
    this.furnitureAssignQuery = '';
  }

  assignPoolItemToStudent(studentId: string): void {
    const pair = this.furnitureAssignPair;
    if (!pair?.desk || !pair?.chair) {
      this.flushMsg('err', 'No desk/chair pair selected.');
      return;
    }
    const sid = String(studentId || '').trim();
    if (!sid) return;

    const s = this.classTeacherStudents.find((x: any) => String(x.id) === sid);
    const sn = String(s?.studentNumber || '').trim();
    const missing = this.furnitureMissingTextByStudentNumber(sn);
    const body: any = { studentId: sid };
    if (missing.includes('desk')) {
      body.deskId = String(pair.desk.itemCode || pair.desk.id || '').trim();
    }
    if (missing.includes('chair')) {
      body.chairId = String(pair.chair.itemCode || pair.chair.id || '').trim();
    }
    if (!body.deskId && !body.chairId) {
      this.flushMsg('err', 'This student already has both a desk and a chair assigned.');
      return;
    }
    if (!body.deskId && missing.includes('desk')) {
      this.flushMsg('err', 'Could not resolve desk code.');
      return;
    }
    if (!body.chairId && missing.includes('chair')) {
      this.flushMsg('err', 'Could not resolve chair code.');
      return;
    }

    this.furnitureAssignLoading = true;
    this.inv.issueFurniture(body).subscribe({
      next: () => {
        this.furnitureAssignLoading = false;
        const parts: string[] = [];
        if (body.deskId) parts.push('desk');
        if (body.chairId) parts.push('chair');
        this.flushMsg('ok', `${parts.join(' + ')} allocated to student.`);
        this.closeFurnitureAssign();
        this.loadMyFurniturePool();
        this.reloadTeacherFurnitureCoverage();
        this.loadTeacherFurnitureReport();
      },
      error: err => {
        this.furnitureAssignLoading = false;
        this.flushMsg('err', err.error?.message || 'Allocation failed');
      },
    });
  }

  get myFurniturePoolDesks(): any[] {
    return (this.myFurniturePool || []).filter((f: any) => String(f.itemType).toLowerCase() === 'desk');
  }

  get myFurniturePoolChairs(): any[] {
    return (this.myFurniturePool || []).filter((f: any) => String(f.itemType).toLowerCase() === 'chair');
  }

  private furnitureCodeSuffix(code: string): string {
    const s = String(code || '').trim().toUpperCase();
    const m = s.match(/(\d+)$/);
    return m ? m[1] : s;
  }

  get matchedFurniturePoolPairs(): Array<{ key: string; desk: any; chair: any }> {
    const desks = this.myFurniturePoolDesks || [];
    const chairs = this.myFurniturePoolChairs || [];
    const chairBySuffix = new Map<string, any>();
    for (const c of chairs) {
      chairBySuffix.set(this.furnitureCodeSuffix(c?.itemCode || ''), c);
    }
    const pairs: Array<{ key: string; desk: any; chair: any }> = [];
    for (const d of desks) {
      const key = this.furnitureCodeSuffix(d?.itemCode || '');
      const c = chairBySuffix.get(key);
      if (c) pairs.push({ key, desk: d, chair: c });
    }
    return pairs.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' }));
  }

  doAdminFurniturePoolTransfer(): void {
    const teacherId = String(this.furAdminTeacherId || '').trim();
    if (!teacherId) {
      this.flushMsg('err', 'Select a class teacher.');
      return;
    }
    const deskCount = this.furAdminDeskCount != null && this.furAdminDeskCount > 0 ? this.furAdminDeskCount : undefined;
    const chairCount = this.furAdminChairCount != null && this.furAdminChairCount > 0 ? this.furAdminChairCount : undefined;
    if (!deskCount && !chairCount) {
      this.flushMsg('err', 'Enter auto-pick desk and/or chair quantities.');
      return;
    }
    this.furAdminTransferLoading = true;
    this.inv
      .transferFurnitureAdminToClassTeacher({
        teacherId,
        deskCount,
        chairCount,
      })
      .subscribe({
        next: (r: any) => {
          this.furAdminTransferLoading = false;
          const n = r?.transferred ?? 0;
          this.flushMsg('ok', n ? `Transferred ${n} item(s) to class teacher pool.` : 'Transfer completed.');
          this.furAdminDeskCount = null;
          this.furAdminChairCount = null;
          this.loadFurniture();
          if (!this.isTeacher()) this.loadStock();
        },
        error: err => {
          this.furAdminTransferLoading = false;
          this.flushMsg('err', err.error?.message || 'Transfer failed');
        },
      });
  }

  searchTermEndStudentReturns(): void {
    const studentCode = String(this.termReturnStudentCode || '').trim().toLowerCase();
    if (!studentCode) {
      this.flushMsg('err', 'Enter student ID first.');
      return;
    }
    this.termReturnLoading = true;
    this.inv.reportTeacherTextbooksIssued().subscribe({
      next: res => {
        const rows = (res?.textbooks || []).filter(
          (r: any) => String(r?.studentId || '').trim().toLowerCase() === studentCode
        );
        this.termReturnRows = rows;
        for (const r of rows) {
          const bn = String(r?.bookNumber || '').trim();
          if (!bn) continue;
          if (!this.termReturnCondByBook[bn]) this.termReturnCondByBook[bn] = 'good';
          if (!this.termReturnFlagByBook[bn]) this.termReturnFlagByBook[bn] = 'pending';
        }
        this.termReturnLoading = false;
        if (!rows.length) this.flushMsg('err', 'No allocated textbook found for that student ID in your classes.');
      },
      error: err => {
        this.termReturnLoading = false;
        this.termReturnRows = [];
        this.flushMsg('err', err?.error?.message || 'Failed to fetch student textbook allocation.');
      },
    });
  }

  termReturnStudentFullName(row: any): string {
    return `${row?.lastName || ''} ${row?.firstName || ''}`.trim() || '—';
  }

  private furnitureMissingTextByStudentNumber(studentNumber: string): string {
    const key = String(studentNumber || '').trim();
    if (!key) return 'desk + chair';
    const st = this.furnitureCoverageByStudent[key] || { hasDesk: false, hasChair: false };
    if (!st.hasDesk && !st.hasChair) return 'desk + chair';
    if (!st.hasDesk) return 'desk';
    if (!st.hasChair) return 'chair';
    return 'none';
  }

  get furnitureEligibleStudents(): any[] {
    const base = this.classTeacherStudents;
    if (!this.furnitureAssignPair?.desk || !this.furnitureAssignPair?.chair) return [];
    return base.filter((s: any) => {
      const missing = this.furnitureMissingTextByStudentNumber(String(s?.studentNumber || '').trim());
      if (missing === 'none') return false;
      return missing.includes('desk') || missing.includes('chair');
    });
  }

  furnitureStudentPickLabel(s: any): string {
    const miss = this.furnitureMissingTextByStudentNumber(String(s?.studentNumber || '').trim());
    if (miss === 'none') return this.studentLabel(s);
    return `${this.studentLabel(s)} — missing ${miss}`;
  }

  clearTermEndBook(row: any): void {
    const bookNumber = String(row?.bookNumber || '').trim();
    if (!bookNumber || bookNumber === '—') {
      this.flushMsg('err', 'BookNumber missing for selected row.');
      return;
    }
    const condition = this.termReturnCondByBook[bookNumber] || 'good';
    this.inv.returnStudentToTeacher({ bookNumbers: [bookNumber], condition }).subscribe({
      next: () => {
        if (condition === 'lost') {
          this.termReturnFlagByBook[bookNumber] = 'not_cleared';
          this.flushMsg('err', `${bookNumber} flagged Not Cleared (lost) and fine recorded.`);
        } else {
          this.termReturnFlagByBook[bookNumber] = 'cleared';
          this.flushMsg('ok', `Cleared ${bookNumber} (${condition}).`);
        }
        this.refreshCustody();
        this.loadTeacherTextbookReport();
        this.termReturnRows = this.termReturnRows.filter(
          r => String(r?.bookNumber || '').trim() !== bookNumber
        );
      },
      error: err => this.flushMsg('err', err?.error?.message || 'Could not clear textbook return.'),
    });
  }

  termReturnFlagLabel(row: any): string {
    const bookNumber = String(row?.bookNumber || '').trim();
    const state = this.termReturnFlagByBook[bookNumber] || 'pending';
    if (state === 'cleared') return 'Cleared';
    if (state === 'not_cleared') return 'Not Cleared';
    return 'Pending';
  }

  termReturnFlagClass(row: any): string {
    const bookNumber = String(row?.bookNumber || '').trim();
    const state = this.termReturnFlagByBook[bookNumber] || 'pending';
    if (state === 'cleared') return 'inv-pill inv-pill--ok';
    if (state === 'not_cleared') return 'inv-pill inv-pill--danger';
    return 'inv-pill inv-pill--muted';
  }
}
