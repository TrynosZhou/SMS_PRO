import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-prepaid-adjust',
  templateUrl: './prepaid-adjust.component.html',
  styleUrls: ['./prepaid-adjust.component.css']
})
export class PrepaidAdjustComponent implements OnInit {
  searchValue = '';
  studentData: any = null;
  loading = false;
  applying = false;
  error = '';
  success = '';
  /** Correct remaining prepaid carry-forward amount */
  correctedPrepaidAmount = 0;

  currencySymbol = 'KES';

  nameSearchResults: any[] = [];
  showStudentPicker = false;
  nameSearchLoading = false;
  nameSearchSelectedStudentKey = '';

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.currencySymbol = settings?.currencySymbol || 'KES';
      },
      error: () => {
        this.currencySymbol = 'KES';
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

  clear(): void {
    this.searchValue = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.correctedPrepaidAmount = 0;
    this.loading = false;
    this.applying = false;
    this.nameSearchResults = [];
    this.showStudentPicker = false;
    this.nameSearchSelectedStudentKey = '';
  }

  backToInvoices(): void {
    this.router.navigate(['/invoices']);
  }

  searchStudent(): void {
    const query = (this.searchValue || '').trim();
    if (!query) {
      this.error = 'Please enter Student ID, Last Name, or First Name';
      return;
    }

    this.error = '';
    this.success = '';
    this.studentData = null;
    this.showStudentPicker = false;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentKey = '';

    this.loading = true;
    this.financeService.getStudentBalance(query).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
        this.correctedPrepaidAmount = parseFloat(String(data?.prepaidAmount ?? 0)) || 0;
        if (!data?.lastInvoiceId) {
          this.error = 'No invoice found for this student.';
        }
      },
      error: (err: any) => {
        const status = err?.status;
        const errMsg = err?.error?.message || err?.message || 'Failed to get student record';

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

    this.studentService.getStudents({ page: 1, limit: 100, search: query }).subscribe({
      next: (data: any) => {
        const results = Array.isArray(data) ? data : data?.data || [];
        this.nameSearchResults = results || [];
        this.nameSearchLoading = false;

        if (!this.nameSearchResults.length) {
          this.error = 'No student found. Check Student ID, Last Name, or First Name.';
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
    this.showStudentPicker = false;

    this.financeService.getStudentBalance(lookupId).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.loading = false;
        this.searchValue = fallbackSearchValue;
        this.correctedPrepaidAmount = parseFloat(String(data?.prepaidAmount ?? 0)) || 0;
        if (!data?.lastInvoiceId) {
          this.error = 'No invoice found for this student.';
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

  applyCorrection(): void {
    if (!this.studentData?.studentId || !this.studentData?.lastInvoiceId) {
      this.error = 'Please search and select a student with an invoice.';
      return;
    }

    const corrected = Number(this.correctedPrepaidAmount);
    if (!Number.isFinite(corrected) || corrected < 0) {
      this.error = 'Please enter a valid non-negative prepaid amount.';
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
      .correctPrepaid({
        studentId: this.studentData.studentId,
        fromInvoiceId: this.studentData.lastInvoiceId,
        correctedPrepaidAmount: corrected,
        strategy: 'carryOutOnly'
      })
      .subscribe({
        next: (response: any) => {
          this.applying = false;
          this.success = response.message || 'Prepaid corrected successfully';
          this.studentData.prepaidAmount = corrected;
          setTimeout(() => (this.success = ''), 6000);
        },
        error: (err: any) => {
          this.applying = false;
          this.error = err?.error?.message || err?.message || 'Failed to correct prepaid';
        }
      });
  }

  canManageFinance(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}
