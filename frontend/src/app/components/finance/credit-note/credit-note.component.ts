import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-credit-note',
  templateUrl: './credit-note.component.html',
  styleUrls: ['./credit-note.component.css']
})
export class CreditNoteComponent implements OnInit {
  searchValue = '';
  studentData: any = null;
  loading = false;
  applying = false;
  error = '';
  success = '';
  creditAmount = 0;

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

  /** 1 = find student, 2 = enter credit, 3 = ready to apply */
  get workflowStep(): 1 | 2 | 3 {
    if (!this.studentData?.studentId) {
      return 1;
    }
    const amt = this.parsedCreditAmount();
    if (!amt || amt <= 0) {
      return 2;
    }
    return 3;
  }

  parsedCreditAmount(): number {
    const n = parseFloat(String(this.creditAmount));
    return Number.isFinite(n) ? n : 0;
  }

  /** Estimated invoice balance after credit (excess becomes prepaid on server) */
  projectedBalanceAfterCredit(): number | null {
    if (!this.studentData) {
      return null;
    }
    const bal = parseFloat(String(this.studentData.balance)) || 0;
    const credit = this.parsedCreditAmount();
    if (!credit || credit <= 0) {
      return null;
    }
    return Math.round(Math.max(0, bal - credit) * 100) / 100;
  }

  /** Credit amount that would exceed current balance → carried as prepaid */
  excessCarryToPrepaid(): number | null {
    if (!this.studentData) {
      return null;
    }
    const bal = parseFloat(String(this.studentData.balance)) || 0;
    const credit = this.parsedCreditAmount();
    if (!credit || credit <= 0 || credit <= bal) {
      return null;
    }
    return Math.round((credit - bal) * 100) / 100;
  }

  clear(): void {
    this.searchValue = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.creditAmount = 0;
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
        this.creditAmount = Math.max(0, parseFloat(String(data?.balance || 0)));
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
        this.creditAmount = Math.max(0, parseFloat(String(data?.balance || 0)));
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

  applyCreditNote(): void {
    if (!this.studentData || !this.studentData.studentId) {
      this.error = 'Please search and select a student first.';
      return;
    }

    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to apply a credit note.';
      return;
    }

    const amount = parseFloat(String(this.creditAmount)) || 0;
    if (!amount || amount <= 0) {
      this.error = 'Please enter a valid credit amount to reduce tuition.';
      return;
    }

    const balance = parseFloat(String(this.studentData.balance || 0));
    if (amount > balance && balance > 0) {
      if (
        !confirm(
          `Credit amount (${this.currencySymbol} ${amount.toFixed(2)}) exceeds current balance (${this.currencySymbol} ${balance.toFixed(2)}). The excess will be carried forward as prepaid for the next term. Continue?`
        )
      ) {
        return;
      }
    }

    this.error = '';
    this.success = '';
    this.applying = true;

    this.financeService.applyCreditNote(this.studentData.studentId, amount).subscribe({
      next: (res: any) => {
        this.applying = false;
        this.studentData.balance = res.newBalance;
        this.studentData.prepaidAmount = res.newPrepaidAmount;
        this.creditAmount = 0;

        let msg = `Credit note applied. New balance: ${this.currencySymbol} ${parseFloat(String(res.newBalance || 0)).toFixed(2)}`;
        if (res.carriedForwardAsPrepaid > 0) {
          msg += `. Amount carried forward as prepaid: ${this.currencySymbol} ${parseFloat(String(res.carriedForwardAsPrepaid)).toFixed(2)}`;
        }
        this.success = msg;
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.applying = false;
        this.error = err?.error?.message || err?.message || 'Failed to apply credit note';
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
