import { Component, OnDestroy, OnInit } from '@angular/core';
import { PaymentAuditService } from '../../../services/payment-audit.service';

type SortDir = 'ASC' | 'DESC';

@Component({
  selector: 'app-user-log',
  templateUrl: './user-log.component.html',
  styleUrls: ['./user-log.component.css'],
})
export class UserLogComponent implements OnInit, OnDestroy {
  loading = false;
  error = '';

  /** Payment / financial audit rows from API */
  logs: any[] = [];

  filterAction: '' | 'create' | 'update' | 'delete' = '';
  filterEntityType: '' | 'with_invoice' | 'no_invoice' = '';
  filterEntityId = '';
  filterPerformedBy = '';
  filterStartDate = '';
  filterEndDate = '';

  page = 1;
  limit = 50;
  total = 0;
  totalPages = 1;

  sortBy = 'eventAt';
  sortDir: SortDir = 'DESC';

  readonly actionOptions = [
    { value: '', label: 'All Actions' },
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
  ];

  readonly entityTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'with_invoice', label: 'With invoice' },
    { value: 'no_invoice', label: 'Without invoice' },
  ];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly paymentAuditService: PaymentAuditService) {}

  ngOnInit(): void {
    this.loadLogs();
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  loadLogs(): void {
    this.loading = true;
    this.error = '';
    this.paymentAuditService
      .getPaymentAuditLogs({
        startDate: this.filterStartDate || undefined,
        endDate: this.filterEndDate || undefined,
        action: this.filterAction || undefined,
        entityType: this.filterEntityType || undefined,
        entityId: this.filterEntityId.trim() || undefined,
        performedBy: this.filterPerformedBy.trim() || undefined,
        page: this.page,
        limit: this.limit,
        sortBy: this.sortBy,
        sortDir: this.sortDir,
      })
      .subscribe({
        next: (data: any) => {
          this.logs = data?.data || [];
          this.page = data?.page || this.page;
          this.limit = data?.limit || this.limit;
          this.total = data?.total ?? 0;
          this.totalPages = data?.totalPages ?? 1;
          this.loading = false;
        },
        error: (err: any) => {
          this.error =
            err?.error?.message || err?.message || 'Failed to load audit logs';
          this.logs = [];
          this.loading = false;
        },
      });
  }

  /** Immediate reload (dropdowns / dates) */
  onFilterImmediate(): void {
    this.page = 1;
    this.loadLogs();
  }

  /** Debounced reload for free-text filters */
  onFilterTextDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.page = 1;
      this.loadLogs();
    }, 450);
  }

  clearFilters(): void {
    this.filterAction = '';
    this.filterEntityType = '';
    this.filterEntityId = '';
    this.filterPerformedBy = '';
    this.filterStartDate = '';
    this.filterEndDate = '';
    this.page = 1;
    this.sortBy = 'eventAt';
    this.sortDir = 'DESC';
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

  sortChevron(column: string): string {
    if (this.sortBy !== column) return '';
    return this.sortDir === 'ASC' ? '↑' : '↓';
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page--;
    this.loadLogs();
  }

  nextPage(): void {
    if (this.page >= this.totalPages) return;
    this.page++;
    this.loadLogs();
  }

  onLimitChange(n: number | string): void {
    const v = typeof n === 'number' ? n : parseInt(String(n), 10);
    if (!Number.isFinite(v) || v < 1 || v === this.limit) return;
    this.limit = v;
    this.page = 1;
    this.loadLogs();
  }

  pageSummary(): string {
    if (this.total === 0) return '0 events';
    const from = (this.page - 1) * this.limit + 1;
    const to = Math.min(this.total, this.page * this.limit);
    return `${from}–${to} of ${this.total}`;
  }

  formatAmount(value: unknown): string {
    const num = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    if (!Number.isFinite(num)) return '—';
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  formatEventType(t: string | undefined): string {
    const s = (t || '').toLowerCase();
    if (s === 'create') return 'Create';
    if (s === 'update') return 'Update';
    if (s === 'delete') return 'Delete';
    return s || '—';
  }

  trackByLog(_index: number, log: any): string {
    return String(log?.id ?? _index);
  }
}
