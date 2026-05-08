import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-debit-note',
  templateUrl: './debit-note.component.html',
  styleUrls: ['./debit-note.component.css']
})
export class DebitNoteComponent implements OnInit {
  searchValue = '';
  studentData: any = null;
  loading = false;
  applying = false;
  error = '';
  success = '';
  debitAmount = 0;

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

  canManageFinance(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  /** Visual workflow: 1 = find student, 2 = enter debit, 3 = ready to apply */
  get workflowStep(): 1 | 2 | 3 {
    if (!this.studentData?.studentId) {
      return 1;
    }
    const amt = this.parsedDebitAmount();
    if (!amt || amt <= 0) {
      return 2;
    }
    return 3;
  }

  /** Parsed debit amount for display / validation */
  parsedDebitAmount(): number {
    const n = parseFloat(String(this.debitAmount));
    return Number.isFinite(n) ? n : 0;
  }

  /** Estimated balance after applying (before server round-trip) */
  projectedBalanceAfterDebit(): number | null {
    if (!this.studentData) return null;
    const bal = parseFloat(String(this.studentData.balance)) || 0;
    const add = this.parsedDebitAmount();
    if (!add || add <= 0) return null;
    return Math.round((bal + add) * 100) / 100;
  }

  clear(): void {
    this.searchValue = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.debitAmount = 0;
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
        this.debitAmount = 0;
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
        this.debitAmount = 0;
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

  applyDebitNote(): void {
    if (!this.studentData || !this.studentData.studentId) {
      this.error = 'Please search and select a student first.';
      return;
    }

    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to apply a debit note.';
      return;
    }

    const amount = parseFloat(String(this.debitAmount)) || 0;
    if (!amount || amount <= 0) {
      this.error = 'Please enter a valid debit amount to add to the invoice.';
      return;
    }

    this.error = '';
    this.success = '';
    this.applying = true;

    this.financeService.applyDebitNote(this.studentData.studentId, amount).subscribe({
      next: (res: any) => {
        this.applying = false;
        this.studentData.balance = res.newBalance;
        this.debitAmount = 0;

        this.success = `Debit note applied. New balance: ${this.currencySymbol} ${parseFloat(String(res.newBalance || 0)).toFixed(2)}`;
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.applying = false;
        this.error = err?.error?.message || err?.message || 'Failed to apply debit note';
      }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}
