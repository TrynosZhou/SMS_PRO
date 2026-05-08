import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

type BillingMode = 'invoice' | 'cash';

/** Line in shopping cart — unit prices come from Settings (uniform catalog API). */
export interface UniformCartLine {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

@Component({
  selector: 'app-uniform-list',
  templateUrl: './uniform-list.component.html',
  styleUrls: ['./uniform-list.component.css']
})
export class UniformListComponent implements OnInit {
  searchValue = '';
  studentData: any = null;
  loading = false;
  applying = false;
  error = '';
  success = '';
  currencySymbol = 'KES';

  /** Uniform catalog: names & unit prices from Settings → Uniform Items (API). */
  uniformCatalog: any[] = [];
  catalogLoading = false;
  catalogError = '';

  /** Shopping cart */
  cartLines: UniformCartLine[] = [];
  pickItemId = '';
  pickQuantity = 1;

  billingMode: BillingMode = 'invoice';

  nameSearchResults: any[] = [];
  showStudentPicker = false;
  nameSearchLoading = false;
  nameSearchSelectedStudentKey = '';

  /** Filter catalog table / quick-add list by name or description */
  catalogFilterText = '';

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || 'KES';
      },
      error: () => {
        this.currencySymbol = 'KES';
      }
    });
    this.loadUniformCatalog();
  }

  /** Fetches active uniform items and unit prices from Settings (backend). */
  loadUniformCatalog(): void {
    this.catalogLoading = true;
    this.catalogError = '';
    this.settingsService.getUniformItems().subscribe({
      next: (items: any[]) => {
        this.uniformCatalog = (items || []).filter((i) => i.isActive !== false);
        this.catalogLoading = false;
      },
      error: () => {
        this.uniformCatalog = [];
        this.catalogLoading = false;
        this.catalogError = 'Could not load uniform prices from Settings. Open Settings → Uniform Items.';
      }
    });
  }

  canSearchByName(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  canManageFinance(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  /** Visual workflow: 1 = find student, 2 = add items, 3 = review & apply */
  get workflowStep(): 1 | 2 | 3 {
    if (!this.studentData?.lastInvoiceId) {
      return 1;
    }
    if (this.cartLines.length === 0) {
      return 2;
    }
    return 3;
  }

  /** Catalog rows after client-side search */
  get filteredCatalog(): any[] {
    const q = (this.catalogFilterText || '').trim().toLowerCase();
    if (!q) {
      return this.uniformCatalog;
    }
    return this.uniformCatalog.filter(
      (u) =>
        String(u.name || '')
          .toLowerCase()
          .includes(q) ||
        String(u.description || '')
          .toLowerCase()
          .includes(q)
    );
  }

  trackByUniformId(_index: number, item: any): string {
    return item?.id ?? String(_index);
  }

  trackByCartLine(_index: number, line: UniformCartLine): string {
    return line.itemId;
  }

  clear(): void {
    this.searchValue = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.cartLines = [];
    this.pickItemId = '';
    this.pickQuantity = 1;
    this.billingMode = 'invoice';
    this.loading = false;
    this.applying = false;
    this.nameSearchResults = [];
    this.showStudentPicker = false;
    this.nameSearchSelectedStudentKey = '';
    this.catalogFilterText = '';
  }

  backToInvoices(): void {
    this.router.navigate(['/invoices']);
  }

  goToSettingsUniforms(): void {
    this.router.navigate(['/settings']);
  }

  searchStudent(): void {
    const query = (this.searchValue || '').trim();
    if (!query) {
      this.error = 'Please enter Student ID, First Name, or Last Name';
      return;
    }

    this.error = '';
    this.success = '';
    this.studentData = null;
    this.cartLines = [];
    this.pickItemId = '';
    this.pickQuantity = 1;
    this.showStudentPicker = false;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentKey = '';
    this.catalogFilterText = '';

    this.loading = true;
    this.financeService.getStudentBalance(query).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
        if (!data?.lastInvoiceId) {
          this.error = 'No invoice found for this student. Create an invoice first.';
        }
      },
      error: (err: any) => {
        const status = err?.status;
        if (status === 404 && this.canSearchByName()) {
          this.loading = false;
          this.resolveStudentByName(query);
          return;
        }
        this.error = err?.error?.message || err?.message || 'Failed to get student record';
        this.loading = false;
      }
    });
  }

  private resolveStudentByName(query: string): void {
    this.error = '';
    this.nameSearchLoading = true;
    this.nameSearchResults = [];
    this.showStudentPicker = false;

    this.studentService.getStudents({ page: 1, limit: 100, search: query }).subscribe({
      next: (data: any) => {
        const results = Array.isArray(data) ? data : data?.data || [];
        this.nameSearchResults = results || [];
        this.nameSearchLoading = false;

        if (!this.nameSearchResults.length) {
          this.error = 'No student found. Check Student ID, First Name, or Last Name.';
          return;
        }

        if (this.nameSearchResults.length === 1) {
          const match = this.nameSearchResults[0];
          const lookupId = match?.id || match?.studentNumber || query;
          this.loadBalanceForStudent(lookupId, match?.studentNumber || query);
          return;
        }

        this.showStudentPicker = true;
      },
      error: (err: any) => {
        this.nameSearchLoading = false;
        this.error = err?.error?.message || err?.message || 'Failed to search students';
      }
    });
  }

  private loadBalanceForStudent(lookupId: string, fallbackSearchValue: string): void {
    this.loading = true;
    this.studentData = null;
    this.cartLines = [];
    this.pickItemId = '';
    this.pickQuantity = 1;
    this.showStudentPicker = false;
    this.catalogFilterText = '';

    this.financeService.getStudentBalance(lookupId).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
        this.searchValue = fallbackSearchValue;
        if (!data?.lastInvoiceId) {
          this.error = 'No invoice found for this student. Create an invoice first.';
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || 'Failed to get student balance';
      }
    });
  }

  confirmSelectedStudent(): void {
    if (!this.nameSearchSelectedStudentKey) return;
    const key = this.nameSearchSelectedStudentKey;
    const match = this.nameSearchResults.find((s: any) => (s?.id || s?.studentNumber) === key);
    const lookupId = match?.id || match?.studentNumber || key;
    const fallbackValue = match?.studentNumber || this.searchValue;
    this.loadBalanceForStudent(lookupId, fallbackValue);
  }

  /**
   * When user selects an item in the dropdown, add it to the shopping cart at the chosen quantity.
   * Prices come from the catalog (Settings).
   */
  onUniformItemSelected(itemId: string): void {
    if (!itemId) return;
    const item = this.uniformCatalog.find((i) => String(i.id) === String(itemId));
    if (!item) return;
    const qty = Math.max(1, Math.floor(Number(this.pickQuantity) || 1));
    this.addItemToCart(item, qty);
    this.pickItemId = '';
  }

  /** Add or merge a catalog row into the cart. */
  addItemToCart(item: any, qty: number): void {
    const q = Math.max(1, Math.floor(qty || 1));
    const price = Number(item.unitPrice) || 0;
    this.error = '';
    const existing = this.cartLines.find((l) => String(l.itemId) === String(item.id));
    if (existing) {
      existing.quantity += q;
    } else {
      this.cartLines.push({
        itemId: String(item.id),
        name: item.name,
        unitPrice: price,
        quantity: q
      });
    }
    this.pickQuantity = 1;
  }

  /** Add from catalog table row (optional per-row qty). */
  addFromCatalogRow(item: any, rowQty: number): void {
    this.addItemToCart(item, rowQty);
  }

  /** Legacy: explicit Add button with current dropdown selection. */
  addLine(): void {
    if (!this.pickItemId) {
      this.error = 'Select a uniform item from the list.';
      return;
    }
    const item = this.uniformCatalog.find((i) => String(i.id) === String(this.pickItemId));
    if (!item) {
      this.error = 'Invalid uniform item.';
      return;
    }
    const qty = Math.max(1, Math.floor(Number(this.pickQuantity) || 1));
    this.addItemToCart(item, qty);
    this.pickItemId = '';
  }

  removeLine(itemId: string): void {
    this.cartLines = this.cartLines.filter((l) => l.itemId !== itemId);
  }

  setLineQuantity(line: UniformCartLine, raw: number): void {
    const q = Math.max(1, Math.floor(Number(raw) || 1));
    line.quantity = q;
  }

  bumpQuantity(line: UniformCartLine, delta: number): void {
    const next = line.quantity + delta;
    if (next < 1) {
      this.removeLine(line.itemId);
    } else {
      line.quantity = next;
    }
  }

  lineTotal(line: UniformCartLine): number {
    return this.round2((Number(line.unitPrice) || 0) * line.quantity);
  }

  /** Total cost of all uniform items in the shopping cart. */
  cartTotal(): number {
    return this.round2(this.cartLines.reduce((s, l) => s + this.lineTotal(l), 0));
  }

  cartItemCount(): number {
    return this.cartLines.reduce((s, l) => s + l.quantity, 0);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  applyUniform(): void {
    if (!this.studentData?.studentId || !this.studentData?.lastInvoiceId) {
      this.error = 'Please search and select a student with an invoice.';
      return;
    }
    if (this.cartLines.length === 0) {
      this.error = 'Add at least one uniform item to the shopping cart.';
      return;
    }
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to perform this action.';
      return;
    }

    this.error = '';
    this.success = '';
    this.applying = true;

    this.financeService
      .addUniformToInvoice({
        studentId: this.studentData.studentId,
        uniformItems: this.cartLines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        billingMode: this.billingMode
      })
      .subscribe({
        next: (res: any) => {
          this.applying = false;
          this.success = res.message || 'Uniform saved to invoice.';
          this.applyUniformResponseToStudent(res);
          this.cartLines = [];
          this.pickItemId = '';
          this.pickQuantity = 1;
          // Re-fetch from GET /balance after a tick so DB write is visible; merge so a stale 0 doesn't overwrite POST newBalance
          setTimeout(() => this.refreshStudentTotalsFromServer(), 0);
          setTimeout(() => (this.success = ''), 6000);
        },
        error: (err: any) => {
          this.applying = false;
          this.error = err?.error?.message || err?.message || 'Failed to add uniform';
        }
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /** Coerce API amounts (string decimal or number) to a finite number. */
  private toNum(v: any): number {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number.parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  /** Update displayed balance / uniform from POST response (numeric fields). */
  private applyUniformResponseToStudent(res: any): void {
    if (!this.studentData) return;
    const bal = this.toNum(res.newBalance ?? res.invoice?.balance);
    const uni = this.toNum(res.newUniformTotal ?? res.invoice?.uniformTotal);
    if (Number.isFinite(bal)) this.studentData.balance = bal;
    if (Number.isFinite(uni)) this.studentData.uniformTotal = uni;
  }

  /**
   * Re-fetch latest invoice totals from GET /finance/balance.
   * After applying uniform, the POST response already has correct newBalance; a GET that still returns 0
   * (timing/stale read) must not overwrite a positive balance from the POST.
   */
  private refreshStudentTotalsFromServer(): void {
    const sid = this.studentData?.studentId;
    if (!sid) return;
    const balanceBeforeGet = this.toNum(this.studentData.balance);
    this.financeService.getStudentBalance(String(sid)).subscribe({
      next: (data: any) => {
        if (!data || !this.studentData) return;
        const bal = this.toNum(data.balance);
        const uni = this.toNum(data.uniformTotal);
        if (Number.isFinite(uni)) this.studentData.uniformTotal = uni;
        if (Number.isFinite(bal)) {
          const getReturnedZero = bal <= 0.0001;
          const hadPositiveFromApply = Number.isFinite(balanceBeforeGet) && balanceBeforeGet > 0.0001;
          if (getReturnedZero && hadPositiveFromApply) {
            // Keep POST apply response balance; GET may be stale
            return;
          }
          this.studentData.balance = bal;
        }
        if (data.lastInvoiceNumber != null) this.studentData.lastInvoiceNumber = data.lastInvoiceNumber;
        if (data.lastInvoiceTerm != null) this.studentData.lastInvoiceTerm = data.lastInvoiceTerm;
      },
      error: () => {
        /* keep values from applyUniformResponseToStudent */
      }
    });
  }
}
