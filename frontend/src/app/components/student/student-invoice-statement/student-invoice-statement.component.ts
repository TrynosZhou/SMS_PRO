import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { StudentService } from '../../../services/student.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-student-invoice-statement',
  templateUrl: './student-invoice-statement.component.html',
  styleUrls: ['./student-invoice-statement.component.css']
})
export class StudentInvoiceStatementComponent implements OnInit {
  invoiceBalance: any = null;
  /** Loading balance from API */
  loading = false;
  /** PDF download in progress */
  pdfLoading = false;
  error = '';
  studentName = '';
  studentNumber = '';
  /** School currency — default $ (overridden by settings when loaded) */
  currencySymbol = '$';

  constructor(
    private authService: AuthService,
    private studentService: StudentService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.student) {
      this.studentName = `${user.student.firstName || ''} ${user.student.lastName || ''}`.trim() || 'Student';
      this.studentNumber = user.student.studentNumber || '';
    }
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'student') {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }

    this.loadSettings();
    this.loadInvoiceBalance();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.currencySymbol = (row?.currencySymbol && String(row.currencySymbol).trim()) || '$';
      },
      error: () => {
        this.currencySymbol = '$';
      }
    });
  }

  loadInvoiceBalance(): void {
    this.loading = true;
    this.error = '';

    this.studentService.getStudentInvoiceBalance().subscribe({
      next: (response: any) => {
        this.loading = false;
        this.invoiceBalance = response;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else if (err.status === 404) {
          this.error = err.error?.message || 'Invoice information not found';
        } else {
          this.error = err.error?.message || 'Failed to load invoice balance';
        }
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  refresh(): void {
    this.loadInvoiceBalance();
  }

  downloadPDF(): void {
    if (!this.invoiceBalance || !this.invoiceBalance.lastInvoiceId) {
      this.error = 'No invoice available to download';
      return;
    }

    this.loading = true;
    this.error = '';

    this.financeService.getInvoicePDF(this.invoiceBalance.lastInvoiceId).subscribe({
      next: (response: any) => {
        this.loading = false;
        const blob = response.blob;
        const filename = response.filename || 'Invoice.pdf';

        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          return;
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.pdfLoading = false;
        this.error = err.error?.message || err.message || 'Failed to download PDF';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  formatDate(date: string | Date): string {
    if (!date) {
      return '—';
    }
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  formatCurrency(amount: number | null | undefined): string {
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    const sym = this.currencySymbol || '$';
    const sep = sym === '$' ? '' : ' ';
    return `${sym}${sep}${safe.toFixed(2)}`;
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }
}
