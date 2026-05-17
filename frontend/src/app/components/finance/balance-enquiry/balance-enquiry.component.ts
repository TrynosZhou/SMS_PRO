import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { CurrencyService } from '../../../services/currency.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-balance-enquiry',
  templateUrl: './balance-enquiry.component.html',
  styleUrls: ['./balance-enquiry.component.css']
})
export class BalanceEnquiryComponent implements OnInit, OnDestroy {
  @Input() modalMode = false;
  @Output() closeModal = new EventEmitter<void>();

  searchValue = '';
  studentData: any = null;
  loading = false;
  error = '';
  copyFeedback = '';

  invoicePdfLoading = false;
  invoicePdfError = '';
  showInvoicePdfPreview = false;
  invoicePdfBlob: Blob | null = null;
  invoicePdfFilename = 'invoice.pdf';

  // Pulled from System Settings → General tab via the shared CurrencyService.
  currencySymbol: string = CurrencyService.DEFAULT_SYMBOL;
  showInvoiceBreakdown = false;

  // Name search fallback (Admin/Accountant only)
  nameSearchResults: any[] = [];
  showStudentPicker = false;
  nameSearchLoading = false;
  nameSearchSelectedStudentKey = '';

  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private currencySub?: Subscription;

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private currencyService: CurrencyService,
    private authService: AuthService
  ) {
    this.currencySymbol = this.currencyService.current;
  }

  ngOnInit(): void {
    this.currencyService.refresh();
    this.currencySub = this.currencyService.symbol$.subscribe(
      s => (this.currencySymbol = s)
    );
  }

  ngOnDestroy(): void {
    this.currencySub?.unsubscribe();
  }

  canSearchByName(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  /** Visual state for the balance hero */
  balanceTone(): 'clear' | 'due' | 'loading' {
    if (this.loading || !this.studentData) return 'loading';
    const bal = Number(this.studentData.balance);
    if (!Number.isFinite(bal)) return 'due';
    if (bal <= 0.01) return 'clear';
    return 'due';
  }

  clear(): void {
    this.searchValue = '';
    this.studentData = null;
    this.error = '';
    this.loading = false;
    this.nameSearchResults = [];
    this.showStudentPicker = false;
    this.nameSearchSelectedStudentKey = '';
    this.showInvoiceBreakdown = false;
    this.copyFeedback = '';
    this.resetInvoicePdfState();
  }

  @HostListener('document:keyup', ['$event'])
  onDocumentKeyup(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    if (this.showStudentPicker) {
      this.showStudentPicker = false;
      this.nameSearchResults = [];
      this.nameSearchSelectedStudentKey = '';
      return;
    }
    if (this.modalMode) {
      this.closeModal.emit();
    }
  }

  getBalance(): void {
    const query = (this.searchValue || '').trim();
    if (!query) {
      this.error = 'Enter a student ID, student number, or name to continue.';
      return;
    }

    this.error = '';
    this.studentData = null;
    this.showStudentPicker = false;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentKey = '';
    this.showInvoiceBreakdown = false;
    this.copyFeedback = '';
    this.resetInvoicePdfState();

    this.loading = true;
    this.financeService.getStudentBalance(query).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
      },
      error: (err: any) => {
        const status = err?.status;
        const errMsg = err?.error?.message || err?.message || 'Failed to get student balance';

        if (status === 404 && this.canSearchByName()) {
          this.loading = false;
          this.resolveStudentByName(query);
          return;
        }

        this.error = errMsg;
        this.loading = false;
      }
    });
  }

  private resolveStudentByName(query: string): void {
    this.error = '';
    this.nameSearchLoading = true;
    this.nameSearchResults = [];
    this.showStudentPicker = false;
    this.nameSearchSelectedStudentKey = '';

    this.studentService.getStudents({ page: 1, limit: 100, search: query }).subscribe({
      next: (data: any) => {
        const results = Array.isArray(data) ? data : data?.data || [];
        this.nameSearchResults = results || [];
        this.nameSearchLoading = false;

        if (!this.nameSearchResults.length) {
          this.error = 'Student not found. Check the ID, student number, or spelling of the name.';
          return;
        }

        if (this.nameSearchResults.length === 1) {
          const match = this.nameSearchResults[0];
          const lookupId = match?.id || match?.studentNumber || query;
          this.loadBalanceForResolvedStudent(lookupId, match?.studentNumber || query);
          return;
        }

        this.showStudentPicker = true;
      },
      error: (err: any) => {
        this.nameSearchLoading = false;
        this.error = err?.error?.message || err?.message || 'Failed to search students by name';
      }
    });
  }

  private loadBalanceForResolvedStudent(lookupId: string, fallbackSearchValue: string): void {
    this.loading = true;
    this.studentData = null;
    this.showStudentPicker = false;
    this.showInvoiceBreakdown = false;
    this.resetInvoicePdfState();

    this.financeService.getStudentBalance(lookupId).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
        this.searchValue = fallbackSearchValue;
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
    const match = this.nameSearchResults.find((s: any) => String(s?.id || s?.studentNumber) === String(key));
    const lookupId = match?.id || match?.studentNumber || key;
    const fallbackValue = match?.studentNumber || this.searchValue;

    this.loadBalanceForResolvedStudent(lookupId, fallbackValue);
  }

  studentOptionKey(s: any): string {
    return String(s?.id || s?.studentNumber || '');
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium'
    }).format(d);
  }

  num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async copyText(label: string, text: string): Promise<void> {
    const t = (text || '').trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      this.flashCopyFeedback(`${label} copied`);
    } catch {
      this.flashCopyFeedback(`Could not copy ${label.toLowerCase()}`);
    }
  }

  private flashCopyFeedback(msg: string): void {
    this.copyFeedback = msg;
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
    this.copyFeedbackTimer = setTimeout(() => {
      this.copyFeedback = '';
      this.copyFeedbackTimer = null;
    }, 2200);
  }

  hasLatestInvoice(): boolean {
    return !!this.studentData?.lastInvoiceId;
  }

  viewInvoice(): void {
    const invoiceId = this.getLatestInvoiceId();
    if (!invoiceId) {
      this.invoicePdfError = 'No invoice is on file for this student.';
      return;
    }

    this.invoicePdfLoading = true;
    this.invoicePdfError = '';
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result) => {
        this.invoicePdfBlob = result.blob;
        this.invoicePdfFilename =
          result.filename ||
          `Invoice-${this.studentData?.lastInvoiceNumber || invoiceId}.pdf`;
        this.showInvoicePdfPreview = true;
        this.invoicePdfLoading = false;
      },
      error: (err: any) => {
        this.invoicePdfLoading = false;
        this.invoicePdfError =
          err?.error?.message || err?.message || 'Failed to load invoice preview.';
      }
    });
  }

  downloadInvoice(): void {
    const invoiceId = this.getLatestInvoiceId();
    if (!invoiceId) {
      this.invoicePdfError = 'No invoice is on file for this student.';
      return;
    }

    this.invoicePdfLoading = true;
    this.invoicePdfError = '';
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result) => {
        this.financeService.downloadInvoicePdfFile(
          result.blob,
          result.filename ||
            `Invoice-${this.studentData?.lastInvoiceNumber || invoiceId}.pdf`
        );
        this.invoicePdfLoading = false;
        this.flashCopyFeedback('Invoice downloaded');
      },
      error: (err: any) => {
        this.invoicePdfLoading = false;
        this.invoicePdfError =
          err?.error?.message || err?.message || 'Failed to download invoice PDF.';
      }
    });
  }

  closeInvoicePdfPreview(): void {
    this.showInvoicePdfPreview = false;
    this.invoicePdfBlob = null;
  }

  private getLatestInvoiceId(): string | null {
    const id = this.studentData?.lastInvoiceId;
    return id ? String(id) : null;
  }

  private resetInvoicePdfState(): void {
    this.invoicePdfLoading = false;
    this.invoicePdfError = '';
    this.closeInvoicePdfPreview();
  }
}
