import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';

interface TermRow {
  id: string;
  term?: string;
  termNumber?: number | string;
  label?: string;
  year: number | string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface ClassRow {
  id: string;
  name: string;
  form?: string;
  isActive?: boolean;
}

interface ReportRow {
  studentId?: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  attendanceRate: number | string;
  attendanceRateNumber: number;
}

@Component({
  selector: 'app-attendance-reports-view',
  templateUrl: './attendance-reports-view.component.html',
  styleUrls: ['./attendance-reports-view.component.css']
})
export class AttendanceReportsViewComponent implements OnInit {
  // Filter selections
  terms: TermRow[] = [];
  classes: ClassRow[] = [];
  selectedTermId = '';
  selectedClassId = '';

  // Loading / status
  loadingTerms = false;
  loadingClasses = false;
  loading = false;
  hasGenerated = false;
  error = '';

  // Report data
  rawRows: ReportRow[] = [];
  filteredRows: ReportRow[] = [];

  // Summary stats
  averageAttendanceRate = 0;
  concernCount = 0;
  topPerformer: ReportRow | null = null;
  lowestPerformer: ReportRow | null = null;
  attendanceByStatus = { present: 0, absent: 0, late: 0, excused: 0 };

  // Table filters
  searchQuery = '';
  statusFilter: 'all' | 'excellent' | 'good' | 'attention' | 'critical' = 'all';
  sortField: 'attendanceRateNumber' | 'firstName' | 'studentNumber' = 'attendanceRateNumber';
  sortDirection: 'asc' | 'desc' = 'desc';

  readonly concernThreshold = 75;
  lastGeneratedAt: Date | null = null;

  constructor(
    private http: HttpClient,
    private attendanceService: AttendanceService,
    private classService: ClassService
  ) {}

  ngOnInit(): void {
    this.loadTerms();
    this.loadClasses();
  }

  // ---------- Data loaders ----------
  loadTerms(): void {
    this.loadingTerms = true;
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        const list: TermRow[] = Array.isArray(data) ? data : data?.data || [];
        this.terms = list;
        this.loadingTerms = false;
        const active = list.find((t) => t.status === 'active');
        if (active) this.selectedTermId = active.id;
      },
      error: () => {
        this.terms = [];
        this.loadingTerms = false;
      }
    });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const active = list.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(active);
        this.loadingClasses = false;
      },
      error: () => {
        this.classes = [];
        this.loadingClasses = false;
      }
    });
  }

  termLabel(t: TermRow): string {
    const n = t.termNumber ?? t.term;
    if (n && t.year) return `Term ${n} (${t.year})`;
    return t.label || t.term || 'Term';
  }

  getSelectedTerm(): TermRow | undefined {
    return this.terms.find((t) => t.id === this.selectedTermId);
  }

  getSelectedClassName(): string {
    const c = this.classes.find((x) => x.id === this.selectedClassId);
    return c ? c.name : '';
  }

  get canGenerate(): boolean {
    return !!this.selectedTermId && !!this.selectedClassId;
  }

  // ---------- Generate report ----------
  generate(): void {
    if (!this.canGenerate) {
      this.error = 'Please choose a term and a class.';
      setTimeout(() => (this.error = ''), 3500);
      return;
    }
    this.loading = true;
    this.error = '';
    this.hasGenerated = true;

    const params: any = { classId: this.selectedClassId };
    const term = this.getSelectedTerm();
    if (term) {
      const label = this.termLabel(term);
      params.term = label;
      if (term.startDate) params.startDate = term.startDate;
      if (term.endDate) params.endDate = term.endDate;
    }

    this.attendanceService.getAttendanceReport(params).subscribe({
      next: (response: any) => {
        this.prepareReport(response?.report ?? response ?? []);
        this.lastGeneratedAt = new Date();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to generate report';
        this.loading = false;
        this.rawRows = [];
        this.filteredRows = [];
      }
    });
  }

  private prepareReport(rows: any[]): void {
    const list = Array.isArray(rows) ? rows : [];
    this.rawRows = list.map((r) => ({
      studentId: r.studentId,
      studentNumber: r.studentNumber ?? '',
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      present: Number(r.present ?? 0),
      absent: Number(r.absent ?? 0),
      late: Number(r.late ?? 0),
      excused: Number(r.excused ?? 0),
      total: Number(r.total ?? 0),
      attendanceRate: r.attendanceRate,
      attendanceRateNumber: this.toNumber(r.attendanceRate)
    }));

    const n = this.rawRows.length;
    this.averageAttendanceRate = n
      ? this.rawRows.reduce((s, r) => s + r.attendanceRateNumber, 0) / n
      : 0;
    this.concernCount = this.rawRows.filter(
      (r) => r.attendanceRateNumber < this.concernThreshold
    ).length;

    this.topPerformer = n
      ? [...this.rawRows].sort((a, b) => b.attendanceRateNumber - a.attendanceRateNumber)[0]
      : null;
    this.lowestPerformer = n
      ? [...this.rawRows].sort((a, b) => a.attendanceRateNumber - b.attendanceRateNumber)[0]
      : null;

    this.attendanceByStatus = {
      present: this.rawRows.reduce((s, r) => s + r.present, 0),
      absent: this.rawRows.reduce((s, r) => s + r.absent, 0),
      late: this.rawRows.reduce((s, r) => s + r.late, 0),
      excused: this.rawRows.reduce((s, r) => s + r.excused, 0)
    };

    this.applyFilters();
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const p = parseFloat(value);
      return isNaN(p) ? 0 : p;
    }
    return 0;
  }

  // ---------- Filters / sorting ----------
  onSearchChange(): void {
    this.applyFilters();
  }

  onStatusFilterChange(): void {
    this.applyFilters();
  }

  changeSort(field: 'attendanceRateNumber' | 'firstName' | 'studentNumber'): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = field === 'firstName' ? 'asc' : 'desc';
    }
    this.applyFilters();
  }

  getSortDirection(field: string): 'asc' | 'desc' | null {
    return this.sortField === field ? this.sortDirection : null;
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.sortField = 'attendanceRateNumber';
    this.sortDirection = 'desc';
    this.applyFilters();
  }

  private applyFilters(): void {
    let data = [...this.rawRows];

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      data = data.filter(
        (r) =>
          `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
          String(r.studentNumber).toLowerCase().includes(q)
      );
    }

    if (this.statusFilter !== 'all') {
      data = data.filter((r) => this.bucketOf(r.attendanceRateNumber) === this.statusFilter);
    }

    data.sort((a, b) => {
      const av = this.getSortValue(a);
      const bv = this.getSortValue(b);
      if (av < bv) return this.sortDirection === 'asc' ? -1 : 1;
      if (av > bv) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.filteredRows = data;
  }

  private getSortValue(r: ReportRow): string | number {
    if (this.sortField === 'firstName') {
      return `${r.firstName} ${r.lastName}`.toLowerCase();
    }
    if (this.sortField === 'studentNumber') {
      return String(r.studentNumber).toLowerCase();
    }
    return r.attendanceRateNumber;
  }

  // ---------- Display helpers ----------
  bucketOf(rate: number): 'excellent' | 'good' | 'attention' | 'critical' {
    if (rate >= 95) return 'excellent';
    if (rate >= 85) return 'good';
    if (rate >= this.concernThreshold) return 'attention';
    return 'critical';
  }

  badgeClass(rate: number): string {
    return `arv-badge arv-badge--${this.bucketOf(rate)}`;
  }

  statusLabel(rate: number): string {
    const b = this.bucketOf(rate);
    if (b === 'excellent') return 'Excellent';
    if (b === 'good') return 'Good';
    if (b === 'attention') return 'Needs attention';
    return 'Critical';
  }

  totalRecords(): number {
    const s = this.attendanceByStatus;
    return s.present + s.absent + s.late + s.excused;
  }

  statusPercent(key: 'present' | 'absent' | 'late' | 'excused'): number {
    const t = this.totalRecords();
    if (!t) return 0;
    return (this.attendanceByStatus[key] / t) * 100;
  }

  trackByStudent = (_: number, r: ReportRow) => r.studentId || r.studentNumber;

  // ---------- Export ----------
  exportCSV(): void {
    if (!this.filteredRows.length) return;
    const headers = [
      'Student #',
      'First Name',
      'Last Name',
      'Present',
      'Absent',
      'Late',
      'Excused',
      'Total',
      'Attendance Rate (%)'
    ];
    const rows = this.filteredRows.map((r) => [
      r.studentNumber,
      r.firstName,
      r.lastName,
      r.present,
      r.absent,
      r.late,
      r.excused,
      r.total,
      r.attendanceRateNumber.toFixed(2)
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
      )
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const className = (this.getSelectedClassName() || 'Class').replace(/\s+/g, '_');
    link.download = `Attendance_Report_${className}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  exportPDF(): void {
    if (!this.filteredRows.length) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const className = this.getSelectedClassName() || 'Class';
    const term = this.getSelectedTerm();
    const html = `
      <!DOCTYPE html>
      <html><head><title>Attendance Report - ${className}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color:#1f2937; }
        h1 { margin:0 0 6px; color:#1f1f4d; }
        .meta { color:#6b7280; margin-bottom:18px; font-size:13px; }
        table { width:100%; border-collapse:collapse; margin-top:14px; font-size:13px; }
        th { background:#f3eeff; padding:10px; text-align:left; border-bottom:2px solid #d8cdf2; color:#4b3f7a; }
        td { padding:8px 10px; border-bottom:1px solid #ece4ff; }
        .summary { padding:12px 14px; background:#faf7ff; border-radius:8px; border:1px solid #e2d8ff; }
      </style></head><body>
        <h1>Attendance Report — ${className}</h1>
        <div class="meta">
          Term: ${term ? this.termLabel(term) : 'All terms'}
          &middot; Generated: ${new Date().toLocaleString()}
        </div>
        <div class="summary">
          <div><strong>Average attendance:</strong> ${this.averageAttendanceRate.toFixed(2)}%</div>
          <div><strong>Students:</strong> ${this.filteredRows.length}</div>
          <div><strong>Needing attention:</strong> ${this.concernCount}</div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>Student #</th><th>Name</th>
            <th>Present</th><th>Absent</th><th>Late</th><th>Excused</th>
            <th>Total</th><th>Attendance %</th>
          </tr></thead>
          <tbody>
            ${this.filteredRows
              .map(
                (r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${r.studentNumber}</td>
                <td>${r.firstName} ${r.lastName}</td>
                <td>${r.present}</td>
                <td>${r.absent}</td>
                <td>${r.late}</td>
                <td>${r.excused}</td>
                <td>${r.total}</td>
                <td>${r.attendanceRateNumber.toFixed(2)}%</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }
}
