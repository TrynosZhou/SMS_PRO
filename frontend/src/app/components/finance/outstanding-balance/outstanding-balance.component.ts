import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { CurrencyService } from '../../../services/currency.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-outstanding-balance',
  templateUrl: './outstanding-balance.component.html',
  styleUrls: ['./outstanding-balance.component.css']
})
export class OutstandingBalanceComponent implements OnInit {
  outstandingBalances: any[] = [];
  filteredBalances: any[] = [];
  pagedBalances: any[] = [];
  loading = false;
  error = '';
  searchQuery = '';
  currencySymbol = CurrencyService.DEFAULT_SYMBOL;
  activeTerm = '';

  // Modern UI controls (client-side) – default: balance descending
  sortBy: 'studentNumber' | 'name' | 'invoiceBalance' = 'invoiceBalance';
  sortDirection: 'asc' | 'desc' = 'desc';
  riskFilter: 'all' | 'low' | 'medium' | 'high' = 'all';
  page = 1;
  pageSize = 100;
  maxBalance = 0;

  constructor(
    private financeService: FinanceService,
    private currencyService: CurrencyService,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.currencyService.symbol$.subscribe(s => (this.currencySymbol = s));
    this.loadOutstandingBalances();
  }

  loadOutstandingBalances(): void {
    this.loading = true;
    this.error = '';
    
    this.financeService.getOutstandingBalances().subscribe({
      next: (data: any) => {
        // API now returns { activeTerm, outstandingBalances } but can also be a plain array (legacy).
        if (Array.isArray(data)) {
          this.outstandingBalances = data;
          this.activeTerm = '';
        } else {
          this.outstandingBalances = data?.outstandingBalances ?? [];
          this.activeTerm = data?.activeTerm ?? '';
        }
        this.sortBy = 'invoiceBalance';
        this.sortDirection = 'desc';
        this.maxBalance = this.getMaxOutstanding(this.outstandingBalances);
        this.page = 1;
        this.filterBalances();
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load outstanding balances';
        this.loading = false;
        this.outstandingBalances = [];
        this.filteredBalances = [];
        this.pagedBalances = [];
      }
    });
  }

  filterBalances(): void {
    const query = this.searchQuery?.toLowerCase().trim() || '';

    const baseFiltered = !query
      ? this.outstandingBalances
      : this.outstandingBalances.filter(balance => {
          const studentNumber = String(balance.studentNumber || balance.studentId || '');
          const firstName = String(balance.firstName || '');
          const lastName = String(balance.lastName || '');
          const phone = String(balance.phoneNumber || '');

          return (
            studentNumber.toLowerCase().includes(query) ||
            firstName.toLowerCase().includes(query) ||
            lastName.toLowerCase().includes(query) ||
            phone.toLowerCase().includes(query)
          );
        });

    const filteredByRisk = baseFiltered.filter(balance => {
      if (this.riskFilter === 'all') return true;
      const risk = this.getRiskCategory(this.getBalance(balance));
      return risk.toLowerCase() === this.riskFilter;
    });

    this.filteredBalances = filteredByRisk;
    this.page = 1;
    this.applySortingAndPagination();
  }

  applySortingAndPagination(): void {
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    const sorted = [...this.filteredBalances].sort((a, b) => {
      switch (this.sortBy) {
        case 'studentNumber': {
          const an = String(a.studentNumber || a.studentId || '').toLowerCase();
          const bn = String(b.studentNumber || b.studentId || '').toLowerCase();
          return an.localeCompare(bn) * dir;
        }
        case 'name': {
          const al = String(a.lastName || '').toLowerCase();
          const bl = String(b.lastName || '').toLowerCase();
          const lastCmp = al.localeCompare(bl);
          if (lastCmp !== 0) return lastCmp * dir;
          const af = String(a.firstName || '').toLowerCase();
          const bf = String(b.firstName || '').toLowerCase();
          return af.localeCompare(bf) * dir;
        }
        case 'invoiceBalance':
        default: {
          const av = this.getBalance(a);
          const bv = this.getBalance(b);
          return (av - bv) * dir;
        }
      }
    });

    this.maxBalance = this.getMaxOutstanding(this.outstandingBalances);
    const totalPages = this.getTotalPages(sorted.length);
    this.page = Math.min(Math.max(1, this.page), totalPages);

    const start = (this.page - 1) * this.pageSize;
    this.pagedBalances = sorted.slice(start, start + this.pageSize);
  }

  getTotalOutstanding(): number {
    return this.filteredBalances.reduce((sum, balance) => {
      return sum + parseFloat(String(balance.invoiceBalance || 0));
    }, 0);
  }

  getAverageOutstanding(): number {
    if (this.filteredBalances.length === 0) return 0;
    return this.getTotalOutstanding() / this.filteredBalances.length;
  }

  getHighestOutstanding(): number {
    if (this.filteredBalances.length === 0) return 0;
    return Math.max(
      ...this.filteredBalances.map(b => this.getBalance(b))
    );
  }

  getMaxOutstanding(balances: any[]): number {
    if (!balances || balances.length === 0) return 0;
    return Math.max(...balances.map(b => this.getBalance(b)));
  }

  getBalance(balance: any): number {
    return parseFloat(String(balance?.invoiceBalance ?? 0)) || 0;
  }

  // Risk is relative to the maximum outstanding on this page (for simple, explainable UI).
  getRiskCategory(amount: number): 'High' | 'Medium' | 'Low' {
    if (!this.maxBalance || this.maxBalance <= 0) return 'Low';
    const ratio = amount / this.maxBalance;
    if (ratio >= 0.66) return 'High';
    if (ratio >= 0.34) return 'Medium';
    return 'Low';
  }

  getTotalPages(sourceLength: number = this.filteredBalances.length): number {
    return Math.max(1, Math.ceil(sourceLength / this.pageSize));
  }

  /** 1-based inclusive range for current page (“Showing …” label). */
  getPageRange(): { from: number; to: number; total: number } {
    const total = this.filteredBalances.length;
    if (total === 0) return { from: 0, to: 0, total: 0 };
    const from = (this.page - 1) * this.pageSize + 1;
    const to = Math.min(this.page * this.pageSize, total);
    return { from, to, total };
  }

  changePage(nextPage: number): void {
    this.page = nextPage;
    this.applySortingAndPagination();
  }

  onPageSizeChange(value: string | number): void {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!parsed || parsed === this.pageSize) return;
    this.pageSize = parsed;
    this.page = 1;
    this.applySortingAndPagination();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  canManageFinance(): boolean {
    return this.authService.hasRole('admin') || 
           this.authService.hasRole('superadmin') || 
           this.authService.hasRole('accountant');
  }

  setRiskFilter(level: 'all' | 'low' | 'medium' | 'high'): void {
    this.riskFilter = level;
    this.filterBalances();
  }

  trackByBalance(_index: number, balance: any): string {
    return String(balance?.studentId || balance?.studentNumber || balance?.invoiceId || _index);
  }

  payInvoice(balance: any): void {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      return;
    }

    // Navigate to payments/record page with student ID as query parameter
    this.router.navigate(['/payments/record'], {
      queryParams: {
        studentId: balance.studentNumber || balance.studentId,
        firstName: balance.firstName,
        lastName: balance.lastName,
        balance: balance.invoiceBalance
      }
    });
  }
}

