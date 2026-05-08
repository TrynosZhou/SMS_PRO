import { Component, OnInit } from '@angular/core';
import { PaymentAuditService } from '../../../services/payment-audit.service';
import { AuthService } from '../../../services/auth.service';

type SortDir = 'ASC' | 'DESC';

@Component({
  selector: 'app-transaction-audit',
  templateUrl: './transaction-audit.component.html',
  styleUrls: ['./transaction-audit.component.css']
})
export class TransactionAuditComponent implements OnInit {
  fromDate = '';
  toDate = '';
  studentSearch = '';
  paymentMethod = '';
  anomalyOnly = false;

  logs: any[] = [];
  loading = false;
  error = '';

  page = 1;
  limit = 100;
  total = 0;
  totalPages = 1;

  sortBy: string = 'eventAt';
  sortDir: SortDir = 'DESC';

  paymentMethods = [
    { label: 'All', value: '' },
    { label: 'Cash', value: 'cash' },
    { label: 'EcoCash', value: 'ecocash' },
    { label: 'InnBucks', value: 'innbucks' },
    { label: 'Visa', value: 'visa' },
    { label: 'Mastercard', value: 'mastercard' },
    { label: 'Bank Transfer', value: 'bank_transfer' }
  ];

  constructor(
    private paymentAuditService: PaymentAuditService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.loadLogs();
  }

  toggleSort(column: string): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = column;
      this.sortDir = 'DESC';
    }
    this.page = 1;
    this.loadLogs();
  }

  loadLogs() {
    this.loading = true;
    this.error = '';

    this.paymentAuditService.getPaymentAuditLogs({
      startDate: this.fromDate || undefined,
      endDate: this.toDate || undefined,
      search: this.studentSearch || undefined,
      paymentMethod: this.paymentMethod || undefined,
      anomalyOnly: this.anomalyOnly,
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    }).subscribe({
      next: (data: any) => {
        this.logs = data?.data || [];
        this.page = data?.page || this.page;
        this.limit = data?.limit || this.limit;
        this.total = data?.total || 0;
        this.totalPages = data?.totalPages || 1;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to load audit logs';
        this.logs = [];
        this.loading = false;
      }
    });
  }

  onSearch() {
    this.page = 1;
    this.loadLogs();
  }

  clearFilters() {
    this.fromDate = '';
    this.toDate = '';
    this.studentSearch = '';
    this.paymentMethod = '';
    this.anomalyOnly = false;
    this.page = 1;
    this.loadLogs();
  }

  prevPage() {
    if (this.page <= 1) return;
    this.page--;
    this.loadLogs();
  }

  nextPage() {
    if (this.page >= this.totalPages) return;
    this.page++;
    this.loadLogs();
  }

  onLimitChange(next: number | string): void {
    const n = typeof next === 'number' ? next : parseInt(String(next), 10);
    if (!Number.isFinite(n) || n < 1 || n === this.limit) return;
    this.limit = n;
    this.page = 1;
    this.loadLogs();
  }

  sortChevron(column: string): string {
    if (this.sortBy !== column) return '';
    return this.sortDir === 'ASC' ? '↑' : '↓';
  }

  trackByLog(_index: number, log: any): string {
    return String(log?.id ?? log?.eventAt ?? _index);
  }

  getShowingRange(): { from: number; to: number } {
    if (this.total === 0) return { from: 0, to: 0 };
    const from = (this.page - 1) * this.limit + 1;
    const to = Math.min(this.page * this.limit, this.total);
    return { from, to };
  }

  refresh(): void {
    this.loadLogs();
  }

  highlightAnomaly(anomaly: boolean): string {
    return anomaly ? 'anomaly-row' : '';
  }

  formatAmount(value: unknown): string {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    if (!Number.isFinite(n)) return String(value ?? '—');
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  }
}

