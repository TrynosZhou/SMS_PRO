import { Component, OnInit } from '@angular/core';
import { UserActivityService } from '../../../services/user-activity.service';

type SortDir = 'ASC' | 'DESC';

@Component({
  selector: 'app-user-log',
  templateUrl: './user-log.component.html',
  styleUrls: ['./user-log.component.css']
})
export class UserLogComponent implements OnInit {
  loading = false;
  error = '';

  // Raw logs from backend
  private allLogs: any[] = [];

  // Current page rows (template binds to `logs`)
  logs: any[] = [];

  // Filters
  fromDate = '';
  toDate = '';
  searchQuery = '';
  roleFilter: 'all' | 'ADMIN' | 'SUPERADMIN' | 'ACCOUNTANT' = 'all';
  activeOnly = false;

  // Sorting
  sortBy: 'loginAt' | 'logoutAt' | 'username' | 'role' | 'lastMenuAccessed' = 'loginAt';
  sortDir: SortDir = 'DESC';

  // Pagination
  page = 1;
  limit = 100;
  total = 0;
  totalPages = 1;

  constructor(private userActivityService: UserActivityService) { }

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs() {
    this.loading = true;
    this.error = '';
    this.userActivityService.getUserActivityLogs().subscribe({
      next: (data: any) => {
        this.allLogs = data?.logs || [];
        this.loading = false;
        this.applyViewModel();
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to load activity logs';
        this.allLogs = [];
        this.logs = [];
        this.loading = false;
      }
    });
  }

  private applyViewModel(): void {
    let rows = [...this.allLogs];

    // Role filter
    if (this.roleFilter !== 'all') {
      rows = rows.filter((l) => String(l?.role || '').toUpperCase() === this.roleFilter);
    }

    // Active sessions only (logoutAt is null/empty)
    if (this.activeOnly) {
      rows = rows.filter((l) => !l?.logoutAt);
    }

    // Date filters (based on loginAt)
    if (this.fromDate) {
      const from = new Date(this.fromDate);
      from.setHours(0, 0, 0, 0);
      rows = rows.filter((l) => l?.loginAt && new Date(l.loginAt).getTime() >= from.getTime());
    }
    if (this.toDate) {
      const to = new Date(this.toDate);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((l) => l?.loginAt && new Date(l.loginAt).getTime() <= to.getTime());
    }

    // Search (username + menus)
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((l) => {
        const hay = [
          l?.username,
          l?.lastMenuAccessed,
          l?.menusAccessed,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort
    rows.sort((a, b) => {
      const dir = this.sortDir === 'ASC' ? 1 : -1;
      const getTime = (v: any) => (v ? new Date(v).getTime() : null);

      if (this.sortBy === 'loginAt' || this.sortBy === 'logoutAt') {
        const at = getTime(a?.[this.sortBy]);
        const bt = getTime(b?.[this.sortBy]);
        // Nulls at end
        if (at === null && bt === null) return 0;
        if (at === null) return 1;
        if (bt === null) return -1;
        return (at! - bt!) * dir;
      }

      const av = (a?.[this.sortBy] ?? '').toString().toLowerCase();
      const bv = (b?.[this.sortBy] ?? '').toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });

    // Pagination
    this.total = rows.length;
    this.totalPages = Math.max(1, Math.ceil(this.total / this.limit));
    if (this.page > this.totalPages) this.page = this.totalPages;

    const start = (this.page - 1) * this.limit;
    const end = this.page * this.limit;
    this.logs = rows.slice(start, end);
  }

  onFilterChange(): void {
    this.page = 1;
    this.applyViewModel();
  }

  toggleSort(column: typeof this.sortBy): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortBy = column;
      this.sortDir = 'DESC';
    }
    this.page = 1;
    this.applyViewModel();
  }

  clearFilters(): void {
    this.fromDate = '';
    this.toDate = '';
    this.searchQuery = '';
    this.roleFilter = 'all';
    this.activeOnly = false;
    this.sortBy = 'loginAt';
    this.sortDir = 'DESC';
    this.page = 1;
    this.applyViewModel();
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page--;
    this.applyViewModel();
  }

  nextPage(): void {
    if (this.page >= this.totalPages) return;
    this.page++;
    this.applyViewModel();
  }

  onLimitChange(): void {
    this.page = 1;
    this.applyViewModel();
  }

  pageSummary(): string {
    if (this.total === 0) return '0 records';
    const start = (this.page - 1) * this.limit + 1;
    const end = Math.min(this.total, this.page * this.limit);
    return `${start}–${end} of ${this.total}`;
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString();
  }

  formatTime(ts: any): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  formatRole(role: string): { label: string; cls: string } {
    const r = (role || '').toUpperCase();
    if (r === 'SUPERADMIN') return { label: 'SUPERADMIN', cls: 'role-pill role-pill-superadmin' };
    if (r === 'ACCOUNTANT') return { label: 'ACCOUNTANT', cls: 'role-pill role-pill-accountant' };
    return { label: r || 'ADMIN', cls: 'role-pill role-pill-admin' };
  }

  getMenusCount(log: any): number {
    const txt = log?.menusAccessed;
    if (!txt) return 0;
    return txt
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean)
      .length;
  }
}

