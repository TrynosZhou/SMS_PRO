import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';
import { CurrencyService } from '../../../services/currency.service';
import { resolveSchoolLogoSrc } from '../../../utils/school-logo.util';
import { SubjectUtilsService } from '../../../services/subject-utils.service';

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.css']
})
export class InvoiceListComponent implements OnInit {
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  students: any[] = [];
  selectedStudent = '';
  selectedStatus = '';
  invoiceSearchQuery = '';
  selectedStatusFilter = '';
  selectedTermFilter = '';
  viewMode: 'grid' | 'list' = 'grid';
  loading = false;
  creatingBulk = false;
  bulkProgress = 0;
  bulkProgressText = '';
  private bulkProgressTimer: any = null;
  success = '';
  error = '';
  showBulkInvoiceForm = false;
  bulkInvoiceForm: any = {
    currentTerm: '',
    dueDate: '',
    description: ''
  };
  showPaymentForm = false;
  selectedInvoice: any = null;
  paymentForm: any = {
    amount: 0,
    paymentDate: '',
    paymentMethod: 'Cash',
    notes: '',
    receiptNeeded: false
  };
  showInvoiceDetailsModal = false;
  selectedInvoiceDetails: any = null;
  studentIdLookup = '';
  studentBalanceInfo: any = null;
  loadingBalance = false;
  currencySymbol = CurrencyService.DEFAULT_SYMBOL;
  academicYear = ''; // Will be loaded from settings
  currentTermFromSettings = ''; // Current term from settings
  quickPaymentAmount = 0;
  quickPaymentTerm = '';
  quickPaymentReceiptNeeded = false;
  lastQuickPaymentInvoiceId: string | null = null;
  
  // PDF preview (hosted viewer)
  showInvoicePdfPreview = false;
  invoicePdfBlob: Blob | null = null;
  invoicePdfFilename = '';
  invoicePdfDocumentTitle = 'Invoice statement';
  loadingPdf = false;
  currentInvoiceNumber = '';
  
  // Receipt Viewer properties
  showReceiptViewer = false;
  receiptUrl: string | null = null;
  safeReceiptUrl: SafeResourceUrl | null = null;
  loadingReceiptPdf = false;
  currentReceiptFilename: string = '';
  currentReceiptNumber: string = '';
  lastPaidInvoiceId: string | null = null;
  recordingQuickPayment = false;
  updatedBalanceAfterPayment: number | null = null; // Track balance after payment
  loadingReceipt = false;
  Math = Math; // Expose Math to template for calculations
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50, 100];
  private searchDebounceTimer: any = null;

  // Invoice Management quick actions (matches the uploaded UI)
  showManagementModal = false;
  managementModalTitle = '';
  managementModalMessage = '';
  managementModalMode: 'message' = 'message';
  managementAutoFollowingTerm = 'Auto (following term)';
  managementFromDate = '';
  managementToDate = '';
  managementLoading = false;

  // ── NEW BILLING UI STATE ─────────────────────────────────────────
  terms: any[] = [];
  selectedBillingTerm = '';
  /** Current (active) term for whole-school bulk run — invoices are created for the term after this. */
  selectedBulkCurrentTerm = '';
  bulkDueDate = '';
  runningBulk = false;

  studentSearchQuery = '';
  fetchedStudents: any[] = [];
  fetchingStudents = false;
  fetchDone = false;
  selectedStudentForBilling: any = null;
  existingInvoiceForTerm: any = null;
  checkingExistingInvoice = false;

  invoiceForDisplay: any = null;
  loadingInvoiceDisplay = false;

  selectedLevel = 'O';
  enrollPrefs = {
    oLevelNewComer: false, aLevelNewComer: false,
    scienceLevy: false,
    oResidence: 'Day' as string, aResidence: 'Day' as string,
    groomingFee: false, brokenFurniture: false, lostBooks: false, otherCharges: false,
  };

  /** Class / form for invoice preview (API uses classEntity). */
  get billingClassLabel(): string {
    const stu = this.invoiceForDisplay?.student;
    const sel = this.selectedStudentForBilling;
    const c = stu?.classEntity || stu?.class || sel?.classEntity || sel?.class;
    if (!c) return 'N/A';
    const name = (c.name || '').trim();
    const form = (c.form || '').trim();
    if (name && form) return `${name} (${form})`;
    return name || form || 'N/A';
  }

  schoolName    = 'JUNIOR HIGH SCHOOL';
  schoolAddress = '30588 Lundi Drive, Rhodene, Masvingo';
  schoolPhone   = '+263 392 263 293 / +263 78 223 8026';
  schoolEmail   = 'info@juniorhighschool.ac.zw';
  schoolWebsite = 'www.juniorhighschool.ac.zw';
  schoolLogo = '';
  schoolLogoLoadFailed = false;
  bankName          = 'ZB BANK';
  bankBranch        = 'MASVINGO';
  bankAccountName   = 'JUNIOR HIGH SCHOOL';
  bankAccountNumber = '4564  00321642  405';

  get schoolLogoSrc(): string {
    const raw = String(this.schoolLogo || '').trim();
    if (!raw || this.schoolLogoLoadFailed) return '';
    if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
    if (raw.length > 100 && !raw.includes('/') && !raw.includes('\\')) {
      return `data:image/png;base64,${raw}`;
    }
    return resolveSchoolLogoSrc(raw);
  }

  onSchoolLogoError(): void {
    this.schoolLogoLoadFailed = true;
  }

  get generateInvoiceButtonLabel(): string {
    if (this.loadingInvoiceDisplay) return 'Loading…';
    if (this.existingInvoiceForTerm) return 'View Invoice';
    return 'Generate Invoice';
  }

  getFollowingTerm(currentTerm: string): string {
    if (!currentTerm) return '';
    
    // Extract term number and year if present
    const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
    if (!termMatch) {
      // If format is not recognized, try to increment
      if (currentTerm.includes('1')) return currentTerm.replace(/1/g, '2');
      if (currentTerm.includes('2')) return currentTerm.replace(/2/g, '3');
      if (currentTerm.includes('3')) {
        const yearMatch = currentTerm.match(/(\d{4})/);
        if (yearMatch) {
          const nextYear = parseInt(yearMatch[1]) + 1;
          return currentTerm.replace(/\d{4}/, nextYear.toString()).replace(/3/g, '1');
        }
        return currentTerm.replace(/3/g, '1');
      }
      return currentTerm;
    }

    const termNum = parseInt(termMatch[1]);
    const year = termMatch[2] ? parseInt(termMatch[2]) : new Date().getFullYear();

    if (termNum === 1) {
      return `Term 2 ${year}`;
    } else if (termNum === 2) {
      return `Term 3 ${year}`;
    } else if (termNum === 3) {
      return `Term 1 ${year + 1}`;
    }

    return currentTerm;
  }

  private openManagementModal(title: string, message: string): void {
    this.managementModalTitle = title;
    this.managementModalMessage = message;
    this.managementModalMode = 'message';
    this.showManagementModal = true;
  }

  closeManagementModal(): void {
    this.showManagementModal = false;
    this.managementModalTitle = '';
    this.managementModalMessage = '';
    this.managementModalMode = 'message';
    this.managementLoading = false;
  }

  private parseDateInput(dateValue: string): number | null {
    if (!dateValue) return null;
    const t = new Date(dateValue).getTime();
    return isNaN(t) ? null : t;
  }

  private pickInvoiceForRange(): any | null {
    const fromT = this.parseDateInput(this.managementFromDate);
    const toT = this.parseDateInput(this.managementToDate);

    const candidates = this.filteredInvoices
      .filter(inv => {
        const dueT = inv?.dueDate ? new Date(inv.dueDate).getTime() : NaN;
        if (!Number.isFinite(dueT)) return false;
        const inFrom = fromT === null ? true : dueT >= fromT;
        const inTo = toT === null ? true : dueT <= toT;
        return inFrom && inTo;
      })
      .filter(inv => parseFloat(String(inv?.balance || 0)) > 0);

    candidates.sort((a: any, b: any) => {
      const aT = new Date(a.dueDate).getTime();
      const bT = new Date(b.dueDate).getTime();
      return aT - bT;
    });

    return candidates[0] || null;
  }

  onCreditNote(): void {
    this.router.navigate(['/invoices/creditnote']);
  }

  onDebitNote(): void {
    this.router.navigate(['/invoices/debitnote']);
  }

  onUniformItems(): void {
    this.router.navigate(['/invoices/uniform_list']);
  }

  onBulkCreate(): void {
    this.openBulkInvoiceForm();
  }

  onReverseBulk(): void {
    this.openManagementModal(
      'Reverse Bulk',
      'Reverse Bulk is not available yet. (There is no backend endpoint to rollback bulk-created invoices.)'
    );
  }

  onTuitionExemption(): void {
    this.openManagementModal(
      'Tuition Exemption',
      'Tuition Exemption feature is not implemented yet. If you want, I can add the required backend endpoints and UI.'
    );
  }

  onCorrectPrepaid(): void {
    this.router.navigate(['/invoices/prepaid_adjust']);
  }

  onReconciliationAudit(): void {
    // Closest existing view: invoice statements.
    this.router.navigate(['/invoices/statements']);
  }

  constructor(
    public financeService: FinanceService,
    private studentService: StudentService,
    public authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private currencyService: CurrencyService,
    private sanitizer: DomSanitizer,
    private subjectUtils: SubjectUtilsService
  ) { }

  ngOnInit() {
    if (this.authService.hasRole('parent')) {
      const user = this.authService.getCurrentUser();
      if (user?.parent?.students) {
        this.students = user.parent.students;
        if (this.students.length === 1) {
          this.selectedStudent = this.students[0].id;
        }
      }
    } else {
      this.loadStudents();
    }
    this.loadInvoices();
    this.currencyService.symbol$.subscribe(s => (this.currencySymbol = s));
    this.loadSettings();
    this.loadTermsForBilling();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.academicYear = row?.academicYear || new Date().getFullYear().toString();
        this.currentTermFromSettings = row?.currentTerm || `Term 1 ${new Date().getFullYear()}`;
        
        // Always set quickPaymentTerm from currentTerm in settings to ensure it matches
        // This ensures the term field always reflects the current term from settings
        this.quickPaymentTerm = this.currentTermFromSettings;
        // School & banking info
        this.schoolName        = row?.schoolName        || row?.name        || this.schoolName;
        this.schoolAddress     = row?.schoolAddress     || row?.address     || this.schoolAddress;
        this.schoolPhone       = row?.phone             || row?.schoolPhone || this.schoolPhone;
        this.schoolEmail       = row?.email             || row?.schoolEmail || this.schoolEmail;
        this.schoolWebsite     = row?.website           || row?.schoolWebsite || this.schoolWebsite;
        this.schoolLogo        = String(row?.schoolLogo || row?.schoolLogo2 || '').trim();
        this.schoolLogoLoadFailed = false;
        const bd = row?.bankingDetails || {};
        this.bankName          = row?.bankName          || bd.bankName      || this.bankName;
        this.bankBranch        = row?.bankBranch        || bd.branch        || this.bankBranch;
        this.bankAccountName   = row?.bankAccountName   || bd.accountName   || this.bankAccountName;
        this.bankAccountNumber = row?.bankAccountNumber || bd.accountNumber || this.bankAccountNumber;
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        const currentYear = new Date().getFullYear();
        this.currentTermFromSettings = `Term 1 ${currentYear}`;
        this.quickPaymentTerm = this.currentTermFromSettings;
      }
    });
  }

  loadStudents() {
    this.studentService.getStudents({ limit: 500 }).subscribe({
      next: (data: any) => {
        this.students = this.parseStudentsResponse(data);
      },
      error: (err: any) => console.error(err)
    });
  }

  private parseStudentsResponse(data: any): any[] {
    if (Array.isArray(data)) return data;
    return data?.data || data?.students || [];
  }

  loadInvoices() {
    this.loading = true;
    const statusParam = this.selectedStatusFilter && this.selectedStatusFilter !== 'all'
      ? this.selectedStatusFilter
      : undefined;
    this.financeService.getInvoices(
      undefined,
      statusParam,
      this.pagination.page,
      this.pagination.limit,
      this.invoiceSearchQuery || undefined
    ).subscribe({
      next: (data: any) => {
        let invoicesResponse: any[] = [];
        if (Array.isArray(data)) {
          invoicesResponse = data;
          this.pagination.total = data.length;
          this.pagination.totalPages = 1;
        } else {
          invoicesResponse = data?.data || [];
          this.pagination.total = data?.total || invoicesResponse.length;
          this.pagination.totalPages = data?.totalPages || 1;
        }

        this.invoices = invoicesResponse.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        // Initialize filteredInvoices with all invoices if no filters are active
        if (!this.hasActiveInvoiceFilters()) {
          this.filteredInvoices = [...this.invoices];
        } else {
          this.filterInvoices();
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading invoices:', err);
        this.error = 'Failed to load invoices';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onFilterChange() {
    // Navigate to invoice statements with filters
    const queryParams: any = {};
    if (this.selectedStudent) {
      queryParams.studentId = this.selectedStudent;
    }
    if (this.selectedStatus) {
      queryParams.status = this.selectedStatus;
    }
    this.router.navigate(['/invoices/statements'], { queryParams });
  }

  filterInvoices() {
    let filtered = [...this.invoices];

    // Apply search query filter
    if (this.invoiceSearchQuery && this.invoiceSearchQuery.trim()) {
      const query = this.invoiceSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(invoice => {
        // Safely get student name
        let studentName = '';
        if (invoice.student) {
          const firstName = invoice.student.firstName || '';
          const lastName = invoice.student.lastName || '';
          studentName = `${firstName} ${lastName}`.trim().toLowerCase();
        }
        
        // Get invoice number
        const invoiceNumber = (invoice.invoiceNumber || '').toLowerCase();
        
        // Get term
        const term = (invoice.term || '').toLowerCase();
        
        // Get student number if available
        const studentNumber = invoice.student?.studentNumber ? invoice.student.studentNumber.toLowerCase() : '';
        
        // Check if query matches any of these fields
        return studentName.includes(query) || 
               invoiceNumber.includes(query) || 
               term.includes(query) ||
               studentNumber.includes(query);
      });
    }

    // Apply status filter
    if (this.selectedStatusFilter) {
      filtered = filtered.filter(invoice => {
        const invoiceStatus = (invoice.status || '').toLowerCase();
        return invoiceStatus === this.selectedStatusFilter.toLowerCase();
      });
    }

    // Apply term filter
    if (this.selectedTermFilter) {
      filtered = filtered.filter(invoice => {
        const invoiceTerm = (invoice.term || '').toLowerCase();
        return invoiceTerm === this.selectedTermFilter.toLowerCase();
      });
    }

    // Apply student filter
    if (this.selectedStudent) {
      filtered = filtered.filter(invoice => invoice.studentId === this.selectedStudent);
    }

    this.filteredInvoices = filtered;
  }

  clearInvoiceFilters() {
    this.invoiceSearchQuery = '';
    this.selectedStatusFilter = '';
    this.selectedTermFilter = '';
    this.selectedStudent = '';
    this.pagination.page = 1;
    this.loadInvoices();
  }

  setStatusFilter(status: string) {
    this.selectedStatusFilter = status || '';
    this.pagination.page = 1;
    this.loadInvoices();
  }

  clearSearchAndReload() {
    this.invoiceSearchQuery = '';
    this.pagination.page = 1;
    this.loadInvoices();
  }

  trackByInvoiceId(_index: number, invoice: any): string {
    return invoice?.id ?? _index;
  }

  getStatusPillClass(status: string | undefined): string {
    const s = (status || '').toLowerCase();
    const map: Record<string, string> = {
      paid: 'bl-pill bl-pill-success',
      pending: 'bl-pill bl-pill-warn',
      partial: 'bl-pill bl-pill-info',
      overdue: 'bl-pill bl-pill-danger',
    };
    return map[s] || 'bl-pill bl-pill-muted';
  }

  getPageRangeLabel(): string {
    const total = this.pagination.total;
    if (total <= 0) {
      return '0 invoices';
    }
    const start = (this.pagination.page - 1) * this.pagination.limit + 1;
    const end = Math.min(this.pagination.page * this.pagination.limit, total);
    return `Showing ${start}–${end} of ${total}`;
  }

  hasActiveInvoiceFilters(): boolean {
    return !!(this.invoiceSearchQuery || this.selectedStatusFilter || this.selectedTermFilter || this.selectedStudent);
  }

  getActiveFilterCount(): number {
    let count = 0;
    if (this.invoiceSearchQuery) count++;
    if (this.selectedStatusFilter) count++;
    if (this.selectedTermFilter) count++;
    if (this.selectedStudent) count++;
    return count;
  }

  getUniqueTerms(): string[] {
    const termSet = new Set<string>();
    this.invoices.forEach(inv => {
      if (inv.term) {
        termSet.add(inv.term);
      }
    });
    return Array.from(termSet);
  }

  getTotalAmount(): number {
    // Grand Total = Sum of all invoice amounts (current term fees only)
    return this.filteredInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.amount || 0)), 0);
  }

  getPaidAmount(): number {
    // Total Paid = Sum of all paid amounts
    return this.filteredInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.paidAmount || 0)), 0);
  }

  getOutstandingAmount(): number {
    // Outstanding Balance = Sum of all current balances
    // Note: balance includes previousBalance, so this represents total outstanding across all invoices
    return this.filteredInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.balance || 0)), 0);
  }

  getTotalInvoiceAmount(): number {
    // Total Invoice Amount = Total Paid + Outstanding Balance
    // This is the correct formula because:
    // - Outstanding Balance already includes previousBalance in its calculation
    // - Total Paid is what has been collected
    // - Together they represent the total amount that should have been collected
    const totalPaid = this.getPaidAmount();
    const outstanding = this.getOutstandingAmount();
    return totalPaid + outstanding;
  }

  getTotalInvoiceAmountAlternative(): number {
    // Alternative calculation: Sum of (amount + previousBalance) for all invoices
    // Note: This may double-count previousBalance if a student has multiple invoices
    // But it's useful for verification
    return this.filteredInvoices.reduce((sum, inv) => {
      const amount = parseFloat(String(inv.amount || 0));
      const previousBalance = parseFloat(String(inv.previousBalance || 0));
      return sum + amount + previousBalance;
    }, 0);
  }

  verifyCalculation(): boolean {
    // Verify: Total Paid + Outstanding Balance should equal the sum calculation
    const totalPaid = this.getPaidAmount();
    const outstanding = this.getOutstandingAmount();
    const calculatedTotal = totalPaid + outstanding;
    const alternativeTotal = this.getTotalInvoiceAmountAlternative();
    // Allow small rounding differences (0.01)
    // The calculated total (paid + outstanding) is the authoritative value
    return Math.abs(calculatedTotal - alternativeTotal) < 0.01;
  }

  getOverdueCount(): number {
    const today = new Date();
    return this.filteredInvoices.filter(inv => {
      const status = (inv.status || '').toLowerCase();
      if (status === 'paid') return false;
      if (!inv.dueDate) return false;
      const dueDate = new Date(inv.dueDate);
      return dueDate < today;
    }).length;
  }

  getUniformTotal(): number {
    return this.filteredInvoices.reduce((sum, inv) => {
      const uniformTotal = parseFloat(String(inv.uniformTotal || 0));
      return sum + uniformTotal;
    }, 0);
  }

  getTotalPrepaidCredit(): number {
    return this.filteredInvoices.reduce((sum, inv) => {
      const prepaidAmount = parseFloat(String(inv.prepaidAmount || 0));
      return sum + prepaidAmount;
    }, 0);
  }

  getPrepaidCreditCount(): number {
    return this.filteredInvoices.filter(inv => {
      const prepaidAmount = parseFloat(String(inv.prepaidAmount || 0));
      return prepaidAmount > 0;
    }).length;
  }

  openInvoiceDetails(invoice: any) {
    this.selectedInvoiceDetails = invoice;
    this.showInvoiceDetailsModal = true;
  }

  closeInvoiceDetails() {
    this.showInvoiceDetailsModal = false;
    this.selectedInvoiceDetails = null;
  }

  openPaymentForm(invoice: any) {
    if (!invoice) return;
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    const student = invoice.student || this.selectedStudentForBilling;
    const studentId =
      student?.studentNumber ||
      invoice.studentNumber ||
      student?.id ||
      '';
    if (!studentId) {
      this.error = 'Student number is missing for this invoice.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    const firstName = student?.firstName || '';
    const lastName = student?.lastName || '';
    const balance = parseFloat(String(invoice.balance ?? 0)) || 0;

    this.router.navigate(['/record-payment'], {
      queryParams: {
        studentId,
        firstName,
        lastName,
        balance: String(balance),
      },
    });
  }

  closePaymentForm() {
    this.showPaymentForm = false;
    this.selectedInvoice = null;
    this.paymentForm = {
      amount: 0,
      paymentDate: '',
      paymentMethod: 'Cash',
      notes: '',
      receiptNeeded: false
    };
  }

  updatePayment() {
    if (!this.selectedInvoice) return;

    if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
      this.error = 'Please enter a valid payment amount';
      return;
    }

    if (!this.paymentForm.paymentDate) {
      this.error = 'Please select a payment date';
      return;
    }

    // Validate that payment amount doesn't exceed balance
    if (this.paymentForm.amount > this.selectedInvoice.balance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${this.paymentForm.amount}) exceeds the balance (${this.currencySymbol} ${this.selectedInvoice.balance}). Continue anyway?`)) {
        return;
      }
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Prepare payment data
    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes
    };

    this.financeService.updatePayment(this.selectedInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        // Reload invoices to get updated balance
        this.loadInvoices();
        
        // Calculate and display updated balance
        const updatedBalance = response.invoice?.balance || 0;
        this.success = `Payment recorded successfully! Updated balance: ${this.currencySymbol} ${parseFloat(String(updatedBalance)).toFixed(2)}`;
        
        this.loading = false;
        this.lastPaidInvoiceId = this.selectedInvoice.id;
        
        // If receipt is needed, show receipt preview
        if (this.paymentForm.receiptNeeded && this.lastPaidInvoiceId) {
          this.closePaymentForm();
          setTimeout(() => {
            this.viewReceiptPDFPreview(this.lastPaidInvoiceId!);
          }, 500);
        } else {
          this.closePaymentForm();
        }
        
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onAmountChange() {
    // Real-time validation can be added here if needed
  }

  getNewBalance(): number {
    if (!this.selectedInvoice || !this.paymentForm.amount) {
      return this.selectedInvoice?.balance || 0;
    }
    return this.selectedInvoice.balance - this.paymentForm.amount;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  viewInvoicePDF(invoiceId: string, event?: Event) {
    // Prevent any default behavior that might trigger download
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentInvoiceNumber = invoice?.invoiceNumber || 'Invoice';
    
    this.loadingPdf = true;
    this.error = '';

    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        this.invoicePdfBlob = result.blob;
        this.invoicePdfFilename = result.filename || `Invoice-${this.currentInvoiceNumber}.pdf`;
        this.invoicePdfDocumentTitle = `Invoice #${this.currentInvoiceNumber}`;
        this.showInvoicePdfPreview = true;
        this.loadingPdf = false;
      },
      error: (err: any) => {
        this.loadingPdf = false;
        console.error('Error loading invoice PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load invoice PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  closeInvoicePdfPreview(): void {
    this.showInvoicePdfPreview = false;
    this.invoicePdfBlob = null;
    this.invoicePdfFilename = '';
    this.currentInvoiceNumber = '';
  }

  viewReceiptPDF(invoiceId: string) {
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Clean up the URL after a delay to free memory
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      },
      error: (err: any) => {
        console.error('Error loading receipt PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load receipt PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewReceiptPDFPreview(invoiceId: string) {
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentReceiptNumber = invoice?.invoiceNumber || 'Receipt';
    
    // Show the modal immediately
    this.showReceiptViewer = true;
    this.loadingReceiptPdf = true;
    this.error = '';
    
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        // Clean up previous URL if exists
        if (this.receiptUrl) {
          window.URL.revokeObjectURL(this.receiptUrl);
        }
        
        // Create blob URL for preview
        this.receiptUrl = window.URL.createObjectURL(blob);
        this.safeReceiptUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.receiptUrl);
        this.currentReceiptFilename = `Receipt-${this.currentReceiptNumber}.pdf`;
        this.loadingReceiptPdf = false;
      },
      error: (err: any) => {
        this.loadingReceiptPdf = false;
        this.showReceiptViewer = false;
        console.error('Error loading receipt PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load receipt PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadReceiptPDF() {
    if (!this.receiptUrl || !this.currentReceiptFilename) {
      this.error = 'Receipt not available for download';
      return;
    }

    const link = document.createElement('a');
    link.href = this.receiptUrl;
    link.download = this.currentReceiptFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  printReceipt() {
    if (!this.receiptUrl && this.lastPaidInvoiceId) {
      // If receipt URL is not available but we have an invoice ID, load the receipt first
      this.viewReceiptPDFPreview(this.lastPaidInvoiceId);
      // Wait a bit for the receipt to load, then print
      setTimeout(() => {
        if (this.receiptUrl) {
          const printWindow = window.open(this.receiptUrl, '_blank');
          if (printWindow) {
            printWindow.onload = () => {
              printWindow.print();
            };
          }
        }
      }, 1000);
      return;
    }
    
    if (!this.receiptUrl) {
      this.error = 'Receipt not available for printing';
      return;
    }

    const printWindow = window.open(this.receiptUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }

  openReceiptForPrint() {
    if (this.lastPaidInvoiceId) {
      this.viewReceiptPDFPreview(this.lastPaidInvoiceId);
    } else {
      this.error = 'No receipt available. Please record a payment first.';
      setTimeout(() => this.error = '', 5000);
    }
  }

  closeReceiptViewer() {
    this.showReceiptViewer = false;
    if (this.receiptUrl) {
      window.URL.revokeObjectURL(this.receiptUrl);
      this.receiptUrl = null;
    }
    this.safeReceiptUrl = null;
    this.currentReceiptFilename = '';
    this.currentReceiptNumber = '';
    // Don't clear lastPaidInvoiceId so the button remains enabled
  }

  onSearchInput() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.pagination.page = 1;
      this.loadInvoices();
    }, 400);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.loadInvoices();
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) {
      return;
    }
    this.pagination.limit = parsedLimit;
    this.pagination.page = 1;
    this.loadInvoices();
  }

  viewStudentReceipt() {
    // Determine student ID - use studentBalanceInfo if available
    if (!this.studentBalanceInfo || !this.studentBalanceInfo.studentId) {
      if (this.studentIdLookup && this.studentIdLookup.trim() !== '') {
        // If studentBalanceInfo is not set, we need to get it first
        this.error = 'Please get student balance first by clicking "Get Balance"';
      } else {
        this.error = 'Please enter a student ID and get balance first';
      }
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const studentId = this.studentBalanceInfo.studentId;
    this.loadingReceipt = true;
    this.error = '';

    // Fetch all invoices for the student
    this.financeService.getInvoices(studentId, undefined).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.loadingReceipt = false;
          this.error = 'No invoice found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Find invoice with payment - prioritize lastInvoiceId if available, otherwise find latest with payment
        let invoice: any = null;
        
        if (this.studentBalanceInfo && this.studentBalanceInfo.lastInvoiceId) {
          // First try to find by lastInvoiceId
          invoice = invoices.find((inv: any) => inv.id === this.studentBalanceInfo.lastInvoiceId);
        }
        
        // If not found or no lastInvoiceId, find the latest invoice with payment
        if (!invoice || parseFloat(String(invoice.paidAmount || 0)) <= 0) {
          // Filter invoices with payments and get the latest one
          const invoicesWithPayment = invoices.filter((inv: any) => {
            const paidAmount = parseFloat(String(inv.paidAmount || 0));
            return paidAmount > 0;
          });
          
          if (invoicesWithPayment.length > 0) {
            // Sort by creation date (latest first) and get the most recent one with payment
            invoice = invoicesWithPayment.sort((a: any, b: any) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateB - dateA;
            })[0];
          } else {
            // If no invoice with payment, get the latest invoice anyway
            invoice = invoices.sort((a: any, b: any) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateB - dateA;
            })[0];
          }
        }

        if (!invoice) {
          this.loadingReceipt = false;
          this.error = 'No invoice found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Check if payment has been made
        const paidAmount = parseFloat(String(invoice.paidAmount || 0));
        if (paidAmount <= 0) {
          this.loadingReceipt = false;
          this.error = 'No payment has been recorded for this invoice. Please record a payment first.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // View the receipt PDF
        this.viewReceiptPDF(invoice.id);
        this.loadingReceipt = false;
      },
      error: (err: any) => {
        this.loadingReceipt = false;
        this.error = 'Failed to fetch invoice. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  openBulkInvoiceForm() {
    // Set default due date to 30 days from now
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    this.bulkInvoiceForm.dueDate = defaultDueDate.toISOString().split('T')[0];
    this.bulkInvoiceForm.currentTerm = '';
    this.bulkInvoiceForm.description = '';
    this.showBulkInvoiceForm = true;
    this.error = '';
    this.success = '';
  }

  closeBulkInvoiceForm() {
    this.stopBulkProgress();
    this.showBulkInvoiceForm = false;
    this.creatingBulk = false;
    this.bulkProgress = 0;
    this.bulkProgressText = '';
    this.bulkInvoiceForm = {
      currentTerm: '',
      dueDate: '',
      description: ''
    };
  }

  private startBulkProgress(totalStudents: number): void {
    this.bulkProgress = 0;
    const label = totalStudents > 0 ? `Processing ${totalStudents} students` : 'Processing';
    this.bulkProgressText = `${label}…`;

    // Estimate ~80 ms per student, min 4 s, max 60 s
    const estimatedMs = Math.min(60_000, Math.max(4_000, totalStudents * 80));
    const tickMs = 300;
    const ticksToFill90 = estimatedMs / tickMs;
    const stepPer90 = 90 / ticksToFill90;

    this.bulkProgressTimer = setInterval(() => {
      if (this.bulkProgress < 90) {
        // Decelerate: linear until 60%, then slows to a crawl
        const remaining = 90 - this.bulkProgress;
        const increment = Math.max(0.1, stepPer90 * (remaining / 90));
        this.bulkProgress = Math.min(90, +(this.bulkProgress + increment).toFixed(1));
        const done = Math.round((this.bulkProgress / 90) * totalStudents);
        this.bulkProgressText = `${label} (${done} / ${totalStudents})…`;
      }
    }, tickMs);
  }

  private stopBulkProgress(): void {
    if (this.bulkProgressTimer) {
      clearInterval(this.bulkProgressTimer);
      this.bulkProgressTimer = null;
    }
  }

  createBulkInvoices() {
    if (!this.authService.isAuthenticated()) {
      this.error = 'You must be logged in to create invoices. Please log in and try again.';
      return;
    }

    if (!this.bulkInvoiceForm.currentTerm || !this.bulkInvoiceForm.dueDate) {
      this.error = 'Please fill in all required fields (Current Term and Due Date)';
      return;
    }

    const dueDate = new Date(this.bulkInvoiceForm.dueDate);
    if (isNaN(dueDate.getTime())) {
      this.error = 'Invalid date format. Please use YYYY-MM-DD format.';
      return;
    }

    this.creatingBulk = true;
    this.error = '';
    this.success = '';

    const totalStudents =
      this.students.filter((s: any) => s.isActive !== false).length || this.students.length;
    this.startBulkProgress(totalStudents);

    this.financeService.createBulkInvoices(
      this.bulkInvoiceForm.currentTerm,
      this.bulkInvoiceForm.dueDate,
      this.bulkInvoiceForm.description || undefined
    ).subscribe({
      next: (response: any) => {
        this.stopBulkProgress();
        this.bulkProgress = 100;
        const summary = response.summary;
        const skipped = summary.skipped ?? 0;
        this.bulkProgressText = `Done — ${summary.created} created, ${skipped} skipped, ${summary.failed} failed`;

        this.success = response.message || 'Bulk invoices created successfully';

        // Build summary for the in-modal result panel (no alert popup)
        let summaryLines = [
          `Created: ${summary.created} invoices`,
          `Skipped (already billed): ${skipped}`,
          `Failed: ${summary.failed}`
        ];
        if (summary.skipReasons && summary.skipReasons.length > 0) {
          summaryLines = summaryLines.concat(summary.skipReasons.slice(0, 10));
          if (summary.skipReasons.length > 10) {
            summaryLines.push(`…and ${summary.skipReasons.length - 10} more skipped`);
          }
        }
        if (summary.errors && summary.errors.length > 0) {
          summaryLines = summaryLines.concat(summary.errors.slice(0, 10));
          if (summary.errors.length > 10) {
            summaryLines.push(`…and ${summary.errors.length - 10} more errors`);
          }
        }
        this.bulkSummaryLines = summaryLines;
        this.bulkDone = true;

        this.loadInvoices();
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        this.stopBulkProgress();
        this.bulkProgress = 0;
        this.bulkProgressText = '';
        this.creatingBulk = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => this.authService.logout(), 2000);
        } else {
          this.error = err.error?.message || 'Failed to create bulk invoices';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  bulkDone = false;
  bulkSummaryLines: string[] = [];

  closeBulkResult(): void {
    this.bulkDone = false;
    this.bulkSummaryLines = [];
    this.closeBulkInvoiceForm();
  }

  getStudentBalance() {
    if (!this.studentIdLookup || this.studentIdLookup.trim() === '') {
      this.error = 'Please enter a student ID';
      return;
    }

    this.loadingBalance = true;
    this.error = '';
    this.studentBalanceInfo = null;

    this.financeService.getStudentBalance(this.studentIdLookup.trim()).subscribe({
      next: (data: any) => {
        this.loadingBalance = false;
        this.studentBalanceInfo = data;
        // Set default payment amount to the balance (ensure it's a number)
        this.quickPaymentAmount = parseFloat(String(data.balance || 0));
      },
      error: (err: any) => {
        this.loadingBalance = false;
        if (err.status === 404) {
          this.error = 'Student not found';
        } else if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to get student balance';
        }
        this.studentBalanceInfo = null;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  recordQuickPayment() {
    if (!this.studentBalanceInfo) {
      this.error = 'Please get student balance first';
      return;
    }

    // Ensure quickPaymentAmount is a number
    const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
    if (!paymentAmount || paymentAmount <= 0) {
      this.error = 'Please enter a valid payment amount';
      return;
    }

    if (!this.quickPaymentTerm || this.quickPaymentTerm.trim() === '') {
      this.error = 'Please enter a term';
      return;
    }

    // Check if we have lastInvoiceId from student balance info
    if (!this.studentBalanceInfo.lastInvoiceId) {
      this.error = 'No invoice found for this student. Please create an invoice first.';
      return;
    }

    this.recordingQuickPayment = true;
    this.error = '';

    // Fetch invoices for this student from the backend
    this.financeService.getInvoices(this.studentBalanceInfo.studentId, undefined).subscribe({
      next: (studentInvoices: any[]) => {
        if (studentInvoices.length === 0) {
          this.recordingQuickPayment = false;
          this.error = 'No invoice found for this student. Please create an invoice first.';
          setTimeout(() => this.error = '', 5000);
          return;
        }
        
        // Try to find the invoice by lastInvoiceId first
        let latestInvoice: any = studentInvoices.find((inv: any) => inv.id === this.studentBalanceInfo.lastInvoiceId);
        
        // If not found by ID, get the latest invoice for the student
        if (!latestInvoice) {
          latestInvoice = studentInvoices.sort((a: any, b: any) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          })[0];
        }
        
        this.processPayment(latestInvoice);
      },
      error: (err: any) => {
        this.recordingQuickPayment = false;
        this.error = 'Failed to fetch invoice. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  private processPayment(latestInvoice: any) {
    if (!latestInvoice) {
      this.recordingQuickPayment = false;
      this.error = 'No invoice found for this student. Please create an invoice first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Validate payment amount
    const invoiceBalance = parseFloat(String(latestInvoice.balance || 0));
    const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
    if (paymentAmount > invoiceBalance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${paymentAmount.toFixed(2)}) exceeds the balance (${this.currencySymbol} ${invoiceBalance.toFixed(2)}). Continue anyway?`)) {
        this.recordingQuickPayment = false;
        return;
      }
    }

    // Prepare payment data
    const today = new Date();
    const paymentData = {
      paidAmount: paymentAmount,
      paymentDate: today.toISOString().split('T')[0],
      paymentMethod: 'Cash',
      notes: `Quick payment for ${this.quickPaymentTerm}`
    };

    this.financeService.updatePayment(latestInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        this.recordingQuickPayment = false;
        
        // Calculate updated balance from response
        const updatedBalance = response.invoice?.balance || 0;
        this.updatedBalanceAfterPayment = parseFloat(String(updatedBalance));
        
        const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
        this.success = `Payment of ${this.currencySymbol} ${paymentAmount.toFixed(2)} recorded successfully! Updated balance: ${this.currencySymbol} ${this.updatedBalanceAfterPayment.toFixed(2)}`;
        
        // Store the invoice ID for receipt access
        this.lastQuickPaymentInvoiceId = latestInvoice.id;
        
        // Reload invoices and student balance
        this.loadInvoices();
        
        // Reload student balance after a short delay to ensure backend has updated
        setTimeout(() => {
          this.getStudentBalance();
          // Clear the updated balance display after 10 seconds
          setTimeout(() => {
            this.updatedBalanceAfterPayment = null;
          }, 10000);
        }, 500);
        
        // If receipt is needed, show receipt preview
        if (this.quickPaymentReceiptNeeded && this.lastQuickPaymentInvoiceId) {
          setTimeout(() => {
            this.viewReceiptPDFPreview(this.lastQuickPaymentInvoiceId!);
          }, 1000);
        }
        
        // Reset payment amount
        this.quickPaymentAmount = 0;
        this.quickPaymentReceiptNeeded = false;
        
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.recordingQuickPayment = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  clearBalanceInfo() {
    this.studentBalanceInfo = null;
    this.studentIdLookup = '';
    this.quickPaymentAmount = 0;
    this.quickPaymentReceiptNeeded = false;
    this.lastQuickPaymentInvoiceId = null;
    // Reset quickPaymentTerm to currentTermFromSettings when clearing
    this.quickPaymentTerm = this.currentTermFromSettings || '';
    this.error = '';
    this.updatedBalanceAfterPayment = null;
  }

  openQuickPaymentReceipt() {
    if (this.lastQuickPaymentInvoiceId) {
      this.viewReceiptPDFPreview(this.lastQuickPaymentInvoiceId);
    } else {
      this.error = 'No receipt available. Please record a payment first.';
      setTimeout(() => this.error = '', 5000);
    }
  }

  // Helper method to check if user has admin or accountant role
  canManageFinance(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin') || this.authService.hasRole('accountant');
  }

  // ── NEW BILLING UI METHODS ──────────────────────────────────────────
  get bulkTargetTermPreview(): string {
    const t = (this.selectedBulkCurrentTerm || '').trim();
    if (!t) return '—';
    return this.getFollowingTerm(t);
  }

  loadTermsForBilling() {
    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const raw: any[] = Array.isArray(data) ? data : (data?.terms || []);
        this.terms = raw.map((t: any) => ({
          ...t,
          label: `Term ${t.termNumber} ${t.year}`,
        }));
        if (!this.selectedBillingTerm && this.terms.length) {
          const active = this.terms.find((t: any) => t.status === 'active');
          this.selectedBillingTerm = active?.label || this.terms[0]?.label || '';
        }
        if (!this.selectedBulkCurrentTerm && this.terms.length) {
          const active = this.terms.find((t: any) => t.status === 'active');
          this.selectedBulkCurrentTerm = active?.label || this.terms[0]?.label || '';
        }
      },
      error: () => {},
    });
  }

  fetchStudents(): void {
    const q = this.studentSearchQuery.trim().toLowerCase();

    if (!q) {
      this.error = 'Enter a first name, last name, or student ID to search.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }

    this.error = '';
    this.success = '';
    this.fetchingStudents = true;
    this.fetchDone = false;
    this.fetchedStudents = [];
    this.selectedStudentForBilling = null;
    this.invoiceForDisplay = null;
    this.existingInvoiceForTerm = null;

    const parts = q.split(/\s+/).filter(Boolean);

    const applyFilter = (list: any[]) =>
      list.filter((s: any) => {
        const fn = String(s.firstName || '').toLowerCase();
        const ln = String(s.lastName || '').toLowerCase();
        const num = String(s.studentNumber || '').toLowerCase();
        const id = String(s.id || '').toLowerCase();
        const full = `${fn} ${ln}`.trim();

        if (num.includes(q) || id.includes(q)) return true;
        if (fn.includes(q) || ln.includes(q)) return true;
        if (full.includes(q)) return true;

        if (parts.length >= 2) {
          const [a, b] = parts;
          if ((fn.includes(a) && ln.includes(b)) || (fn.includes(b) && ln.includes(a))) return true;
        }
        return false;
      });

    const finish = (list: any[]) => {
      this.fetchedStudents = list.slice(0, 50);
      this.fetchDone = true;
      this.fetchingStudents = false;
      if (!this.fetchedStudents.length) {
        this.error = 'No students found. Check the details and try again.';
        setTimeout(() => (this.error = ''), 5000);
      }
    };

    if (q) {
      this.studentService.getStudents({ search: q, limit: 100 }).subscribe({
        next: (data: any) => finish(applyFilter(this.parseStudentsResponse(data))),
        error: () => {
          finish(applyFilter(this.students));
        },
      });
    } else {
      finish(applyFilter(this.students));
    }
  }

  isSelectedFetchedStudent(student: any): boolean {
    if (!student || !this.selectedStudentForBilling) return false;
    const a = student.id && this.selectedStudentForBilling.id;
    if (a && student.id === this.selectedStudentForBilling.id) return true;
    return (
      String(student.studentNumber || '') ===
      String(this.selectedStudentForBilling.studentNumber || '')
    );
  }

  selectStudentFromFetch(student: any): void {
    this.selectedStudentForBilling = student;
    this.invoiceForDisplay = null;
    this.existingInvoiceForTerm = null;
    this.error = '';
    this.refreshExistingInvoiceCheck();
  }

  onBillingTermChange(): void {
    this.existingInvoiceForTerm = null;
    this.invoiceForDisplay = null;
    this.refreshExistingInvoiceCheck();
  }

  private refreshExistingInvoiceCheck(): void {
    const student = this.selectedStudentForBilling;
    const term = (this.selectedBillingTerm || '').trim();
    if (!student?.id || !term) {
      this.existingInvoiceForTerm = null;
      return;
    }

    this.checkingExistingInvoice = true;
    this.financeService.getInvoices(student.id, undefined).subscribe({
      next: (data: any) => {
        const invoices = this.parseInvoicesResponse(data);
        this.existingInvoiceForTerm =
          invoices.find((inv: any) => this.termsLooselyMatch(inv.term || '', term)) || null;
        this.checkingExistingInvoice = false;
      },
      error: () => {
        this.existingInvoiceForTerm = null;
        this.checkingExistingInvoice = false;
      },
    });
  }

  /** Match invoice.term to the term selected in billing (handles minor formatting / year differences). */
  private termsLooselyMatch(invoiceTerm: string, selectedTerm: string): boolean {
    const a = (invoiceTerm || '').trim().toLowerCase();
    const b = (selectedTerm || '').trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const numA = a.match(/term\s*(\d+)/i);
    const numB = b.match(/term\s*(\d+)/i);
    if (!numA || !numB || numA[1] !== numB[1]) return false;

    const yearA = a.match(/(\d{4})/);
    const yearB = b.match(/(\d{4})/);
    if (yearA && yearB) return yearA[1] === yearB[1];
    return true;
  }

  private parseInvoicesResponse(data: any): any[] {
    if (Array.isArray(data)) return data;
    return data?.data || [];
  }

  private readonly vacationFeeRx =
    /\bvacation\b|\bvac(?:ation)?\s*school\b|\bholiday\s*school\b|\bvac\s*fees?\b/i;
  private readonly tuitionLineRx = /\btuition\b/i;

  private isVacationFeeDescription(desc: string | null | undefined): boolean {
    return this.vacationFeeRx.test(String(desc || ''));
  }

  getSelectedBillingTermRecord(): any | null {
    const label = (this.selectedBillingTerm || '').trim();
    if (!label) return null;
    return (
      this.terms.find((t: any) => t.label === label) ||
      this.terms.find((t: any) => this.termsLooselyMatch(t.label, label)) ||
      null
    );
  }

  isRegularBillingTerm(): boolean {
    const pt = String(this.getSelectedBillingTermRecord()?.periodType || 'regular').toLowerCase();
    return pt !== 'vacation';
  }

  private isTuitionLine(desc: string | null | undefined): boolean {
    return this.tuitionLineRx.test(String(desc || ''));
  }

  private getBillingTermLabel(): string {
    return (this.invoiceForDisplay?.term || this.selectedBillingTerm || '').trim();
  }

  private getStudentClassForBand(): { form?: string | null; name?: string | null } | null {
    const stud = this.selectedStudentForBilling;
    const invStu = this.invoiceForDisplay?.student;
    return (
      stud?.classEntity ||
      stud?.class ||
      invStu?.classEntity ||
      invStu?.class ||
      null
    );
  }

  /** e.g. Tuition (O Level fees for Term 2 2026) */
  formatBillingLineDescription(desc: string): string {
    if (!this.isTuitionLine(desc)) return desc;
    const term = this.getBillingTermLabel();
    if (!term) return desc;
    if (desc.includes(`fees for ${term}`)) return desc;
    const band = this.subjectUtils.inferClassLevelBand(this.getStudentClassForBand());
    const level = band === 'A_LEVEL' ? 'A Level' : 'O Level';
    return `Tuition (${level} fees for ${term})`;
  }

  formatTermPeriodType(pt: string): string {
    const v = String(pt || 'regular').toLowerCase();
    if (v === 'vacation') return 'Vacation school';
    if (v === 'short') return 'Short term';
    return 'Regular term';
  }

  /** Hide vacation-school fee rows on billing preview for regular (and short) terms. */
  private stripVacationFeesFromInvoice(inv: any): any {
    if (!inv || !this.isRegularBillingTerm()) return inv;
    const feeLineItems = inv.feeLineItems;
    if (!Array.isArray(feeLineItems) || feeLineItems.length === 0) return inv;

    const kept: any[] = [];
    let vacationSum = 0;
    for (const row of feeLineItems) {
      const desc = row.description || row.name || '';
      if (this.isVacationFeeDescription(desc)) {
        vacationSum += parseFloat(String(row.amount ?? 0)) || 0;
      } else {
        kept.push(row);
      }
    }
    if (vacationSum < 0.001) return inv;

    const pb = parseFloat(String(inv.previousBalance ?? 0)) || 0;
    const amt = Math.max(0, (parseFloat(String(inv.amount ?? 0)) || 0) - vacationSum);
    const paid = parseFloat(String(inv.paidAmount ?? 0)) || 0;
    const totalAmount = pb + amt;
    const balance =
      inv.balance !== undefined && inv.balance !== null
        ? Math.max(0, (parseFloat(String(inv.balance)) || 0) - vacationSum)
        : totalAmount - paid;

    return { ...inv, feeLineItems: kept, amount: amt, totalAmount, balance };
  }

  /** Normalize API invoice for the billing preview (totals + student details from selection when missing). */
  private enrichInvoiceForDisplay(inv: any): any {
    if (!inv || !this.selectedStudentForBilling) return inv;
    inv = this.stripVacationFeesFromInvoice(inv);
    const stud = this.selectedStudentForBilling;
    const pb = parseFloat(String(inv.previousBalance ?? 0)) || 0;
    const amt = parseFloat(String(inv.amount ?? 0)) || 0;
    const totalAmount =
      inv.totalAmount !== undefined && inv.totalAmount !== null
        ? parseFloat(String(inv.totalAmount)) || 0
        : pb + amt;
    const stu = inv.student;
    const classRef =
      stu?.classEntity || stu?.class || stud?.classEntity || stud?.class || null;
    return {
      ...inv,
      totalAmount,
      student: stu
        ? {
            ...stu,
            classEntity: classRef ?? stu.classEntity ?? stu.class,
            class: classRef ?? stu.class ?? stu.classEntity,
          }
        : {
            firstName: stud.firstName,
            lastName: stud.lastName,
            studentNumber: stud.studentNumber,
            classEntity: stud.classEntity || stud.class,
            class: stud.class || stud.classEntity,
          },
      studentNumber: inv.studentNumber ?? stud.studentNumber,
      residenceType: inv.residenceType ?? stud.studentType,
    };
  }

  generateInvoice() {
    if (!this.selectedStudentForBilling) {
      this.error = 'Please select a student first.';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    this.loadingInvoiceDisplay = true;
    this.invoiceForDisplay = null;
    const studentId = this.selectedStudentForBilling.id;
    const term = (this.selectedBillingTerm || '').trim();

    this.financeService.getInvoices(studentId, undefined).subscribe({
      next: (data: any) => {
        const invoices: any[] = this.parseInvoicesResponse(data);
        let found: any = null;
        if (term) {
          found = invoices.find((inv: any) =>
            this.termsLooselyMatch(inv.term || '', term)
          );
        } else if (invoices.length) {
          found = invoices[0];
        }

        if (found) {
          this.existingInvoiceForTerm = found;
          this.invoiceForDisplay = this.enrichInvoiceForDisplay(found);
          this.loadingInvoiceDisplay = false;
          return;
        }

        if (!this.canManageFinance()) {
          this.error = 'No invoice found for this student.';
          setTimeout(() => this.error = '', 5000);
          this.loadingInvoiceDisplay = false;
          return;
        }

        if (!term) {
          this.error = 'Please select an academic term, then generate again.';
          setTimeout(() => this.error = '', 5000);
          this.loadingInvoiceDisplay = false;
          return;
        }

        const defaultDue = new Date();
        defaultDue.setDate(defaultDue.getDate() + 30);
        const dueDate = this.bulkDueDate || defaultDue.toISOString().split('T')[0];
        const stud = this.selectedStudentForBilling;
        const payload = {
          studentId,
          term,
          dueDate,
          amount: 0,
          description: `Fees for ${term} — ${(stud.firstName || '').trim()} ${(stud.lastName || '').trim()}`.trim()
        };

        this.financeService.createInvoice(payload).subscribe({
          next: (response: any) => {
            const createdId = response?.invoice?.id as string | undefined;
            this.financeService.getInvoices(studentId, undefined).subscribe({
              next: (d2: any) => {
                const all = this.parseInvoicesResponse(d2);
                const again = createdId ? all.find((i: any) => i.id === createdId) : null;
                const created = this.enrichInvoiceForDisplay(again || response?.invoice);
                this.existingInvoiceForTerm = created;
                this.invoiceForDisplay = created;
                this.loadingInvoiceDisplay = false;
                this.loadInvoices();
                this.success = 'Invoice created successfully.';
                setTimeout(() => this.success = '', 5000);
              },
              error: () => {
                const created = this.enrichInvoiceForDisplay(response?.invoice);
                this.existingInvoiceForTerm = created;
                this.invoiceForDisplay = created;
                this.loadingInvoiceDisplay = false;
                this.loadInvoices();
                this.success = 'Invoice created successfully.';
                setTimeout(() => this.success = '', 5000);
              }
            });
          },
          error: (err: any) => {
            this.loadingInvoiceDisplay = false;
            this.error = err.error?.message || 'Failed to create invoice.';
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: () => {
        this.error = 'Failed to load invoice.';
        setTimeout(() => this.error = '', 5000);
        this.loadingInvoiceDisplay = false;
      },
    });
  }

  cancelBilling(): void {
    this.studentSearchQuery = '';
    this.fetchedStudents = [];
    this.fetchDone = false;
    this.fetchingStudents = false;
    this.selectedStudentForBilling = null;
    this.existingInvoiceForTerm = null;
    this.invoiceForDisplay = null;
    this.error = '';
    this.success = '';
  }

  runBulkInvoicing() {
    if (!this.selectedBulkCurrentTerm?.trim()) {
      this.error = 'Please select the current (active) academic term for the school.';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 30);
    this.bulkInvoiceForm.currentTerm = this.selectedBulkCurrentTerm.trim();
    this.bulkInvoiceForm.dueDate     = this.bulkDueDate || defaultDue.toISOString().split('T')[0];
    this.createBulkInvoices();
  }

  saveEnrollmentPrefs() {
    this.success = 'Enrollment preferences saved.';
    setTimeout(() => this.success = '', 3000);
  }

  cancelEnrollmentPrefs() {
    this.enrollPrefs = {
      oLevelNewComer: false, aLevelNewComer: false, scienceLevy: false,
      oResidence: 'Day', aResidence: 'Day',
      groomingFee: false, brokenFurniture: false, lostBooks: false, otherCharges: false,
    };
  }

  getInvoiceLineItems(): any[] {
    if (!this.invoiceForDisplay) return [];
    const inv = this.invoiceForDisplay;
    const direct = inv.items || inv.feeItems || [];
    if (Array.isArray(direct) && direct.length > 0) {
      return direct.map((row: any) => ({
        ...row,
        description: this.formatBillingLineDescription(
          row.description || row.name || row.itemName || 'Fee'
        ),
      }));
    }
    const managed = inv.feeLineItems;
    if (Array.isArray(managed) && managed.length > 0) {
      const out: any[] = [];
      const pb = parseFloat(String(inv.previousBalance ?? 0)) || 0;
      if (pb > 0.01) {
        out.push({ description: 'Previous balance (outstanding)', amount: pb });
      }
      managed.forEach((row: any) => {
        const raw = row.description || row.name || 'Fee';
        if (this.isRegularBillingTerm() && this.isVacationFeeDescription(raw)) return;
        out.push({
          description: this.formatBillingLineDescription(raw),
          amount: row.amount,
        });
      });
      return out;
    }
    const lines: any[] = [];
    const pb = parseFloat(String(inv.previousBalance ?? 0)) || 0;
    const amt = parseFloat(String(inv.amount ?? 0)) || 0;
    if (pb > 0.01) {
      lines.push({ description: 'Previous balance (outstanding)', amount: pb });
    }
    if (amt > 0.01) {
      const term = this.getBillingTermLabel();
      const band = this.subjectUtils.inferClassLevelBand(this.getStudentClassForBand());
      const level = band === 'A_LEVEL' ? 'A Level' : 'O Level';
      const fallbackDesc = term
        ? `Tuition (${level} fees for ${term})`
        : inv.description || 'Fees for term';
      lines.push({
        description: fallbackDesc,
        amount: amt,
      });
    }
    return lines;
  }

  fmtCurrency(n: any): string {
    const v = parseFloat(String(n || 0));
    return isNaN(v) ? '0.00' : v.toFixed(2);
  }

  fmtDate(d: any): string {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get invoiceStatus(): string {
    const inv = this.invoiceForDisplay;
    if (!inv) return 'N/A';
    const bal = parseFloat(String(inv.balance || 0));
    if (bal <= 0) return 'PAID';
    const due = inv.dueDate ? new Date(inv.dueDate).getTime() : Infinity;
    if (due < Date.now()) return 'OVERDUE';
    return 'PENDING';
  }
}

