import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';

interface TermRow {
  id: string;
  term?: string;
  termNumber?: number | string;
  label?: string;
  year: number | string;
  status?: string;
}

interface ClassRow {
  id: string;
  name: string;
  form?: string;
  isActive?: boolean;
}

type AttStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRow {
  studentId: string;
  status: AttStatus;
  remarks: string;
}

@Component({
  selector: 'app-mark-register',
  templateUrl: './mark-register.component.html',
  styleUrls: ['./mark-register.component.css']
})
export class MarkRegisterComponent implements OnInit {
  // Filter selections
  terms: TermRow[] = [];
  classes: ClassRow[] = [];
  selectedTermId = '';
  selectedClassId = '';
  selectedDate = '';

  // Loading / status flags
  loadingTerms = false;
  loadingClasses = false;
  loadingList = false;
  submitting = false;
  hasFetched = false;
  error = '';
  success = '';

  // Roster + attendance
  students: any[] = [];
  attendanceData: AttendanceRow[] = [];
  filteredAttendanceData: AttendanceRow[] = [];

  // Table filters
  searchQuery = '';
  statusFilter: 'all' | AttStatus = 'all';

  hasUnsavedChanges = false;
  lastSavedDate: Date | null = null;

  readonly weekendNotAllowedMessage =
    'Attendance can only be marked Monday to Friday (Sundays and Saturdays are not allowed).';

  constructor(
    private http: HttpClient,
    private attendanceService: AttendanceService,
    private classService: ClassService,
    private studentService: StudentService
  ) {}

  ngOnInit(): void {
    this.loadTerms();
    this.loadClasses();
    const today = this.normalizeToAllowedDate(new Date());
    this.selectedDate = this.formatDateToYMD(today);
  }

  // ----- Data loaders -----
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

  get canFetch(): boolean {
    return !!this.selectedTermId && !!this.selectedClassId && !!this.selectedDate;
  }

  // ----- Date helpers -----
  private formatDateToYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isWeekendDate(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private normalizeToAllowedDate(date: Date): Date {
    const dt = new Date(date);
    const day = dt.getDay();
    if (day === 0) dt.setDate(dt.getDate() + 1);
    if (day === 6) dt.setDate(dt.getDate() - 1);
    return dt;
  }

  private shiftToNextAllowedDate(date: Date, direction: 1 | -1): Date {
    const dt = new Date(date);
    while (this.isWeekendDate(dt)) {
      dt.setDate(dt.getDate() + direction);
    }
    return dt;
  }

  get isMarkingAllowed(): boolean {
    if (!this.selectedDate) return true;
    const parts = this.selectedDate.split('-').map((p) => Number(p));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return true;
    const [y, m, d] = parts;
    const day = new Date(y, m - 1, d).getDay();
    return day >= 1 && day <= 5;
  }

  isToday(): boolean {
    return this.selectedDate === this.formatDateToYMD(new Date());
  }

  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    const parts = this.selectedDate.split('-').map((p) => Number(p));
    if (parts.length !== 3) return this.selectedDate;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  navigateDate(days: number): void {
    if (!this.selectedDate) return;
    const direction: 1 | -1 = days >= 0 ? 1 : -1;
    const parts = this.selectedDate.split('-').map((p) => Number(p));
    if (parts.length !== 3) return;
    const [y, m, d] = parts;
    const current = new Date(y, m - 1, d);
    current.setDate(current.getDate() + days);
    const allowed = this.shiftToNextAllowedDate(current, direction);
    this.selectedDate = this.formatDateToYMD(allowed);
    if (this.hasFetched) this.loadExistingAttendance();
  }

  goToToday(): void {
    const today = this.normalizeToAllowedDate(new Date());
    this.selectedDate = this.formatDateToYMD(today);
    if (this.hasFetched) this.loadExistingAttendance();
  }

  // ----- Fetch class list & attendance -----
  fetchList(): void {
    if (!this.canFetch) {
      this.error = 'Please choose a term, a class, and a date.';
      setTimeout(() => (this.error = ''), 3500);
      return;
    }
    this.loadingList = true;
    this.error = '';
    this.success = '';
    this.hasFetched = true;

    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.students = list.filter((s: any) => s.isActive !== false);
        this.initializeAttendanceData();
        this.loadExistingAttendance();
        this.loadingList = false;
      },
      error: (err: any) => {
        this.students = [];
        this.attendanceData = [];
        this.filteredAttendanceData = [];
        this.loadingList = false;
        this.error = err?.error?.message || 'Failed to fetch class list';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  private initializeAttendanceData(): void {
    this.attendanceData = this.students.map((s) => ({
      studentId: s.id,
      status: 'present',
      remarks: ''
    }));
    this.hasUnsavedChanges = false;
    this.updateFilteredData();
  }

  private loadExistingAttendance(): void {
    if (!this.selectedClassId || !this.selectedDate) return;
    this.attendanceService
      .getAttendance({ classId: this.selectedClassId, date: this.selectedDate })
      .subscribe({
        next: (response: any) => {
          if (response?.attendance?.length) {
            const map = new Map<string, any>(
              response.attendance.map((a: any) => [a.studentId, a])
            );
            this.attendanceData = this.attendanceData.map((row) => {
              const ex = map.get(row.studentId);
              if (ex) {
                return {
                  studentId: row.studentId,
                  status: (ex.status || 'present') as AttStatus,
                  remarks: ex.remarks || ''
                };
              }
              return row;
            });
            this.hasUnsavedChanges = false;
            this.updateFilteredData();
          }
        },
        error: () => {
          // Nothing saved yet for this date — keep defaults.
        }
      });
  }

  // ----- Student helpers -----
  getStudentName(studentId: string): string {
    const s = this.students.find((x) => x.id === studentId);
    return s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : '';
  }

  getStudentNumber(studentId: string): string {
    const s = this.students.find((x) => x.id === studentId);
    return s ? s.studentNumber || '' : '';
  }

  getStudentGender(studentId: string): string {
    const s = this.students.find((x) => x.id === studentId);
    return s ? s.gender || '' : '';
  }

  // ----- Marking -----
  updateStatus(studentId: string, status: AttStatus): void {
    if (!this.isMarkingAllowed) return;
    const item = this.attendanceData.find((a) => a.studentId === studentId);
    if (!item) return;
    item.status = status;
    this.hasUnsavedChanges = true;
    this.updateFilteredData();
  }

  markAll(status: AttStatus): void {
    if (!this.isMarkingAllowed) {
      this.error = this.weekendNotAllowedMessage;
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    this.attendanceData.forEach((it) => (it.status = status));
    this.hasUnsavedChanges = true;
    this.updateFilteredData();
  }

  submit(): void {
    if (!this.canFetch || this.attendanceData.length === 0) {
      this.error = 'Nothing to save — please fetch a class list first.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    if (!this.isMarkingAllowed) {
      this.error = this.weekendNotAllowedMessage;
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';
    this.attendanceService
      .markAttendance(this.selectedClassId, this.selectedDate, this.attendanceData)
      .subscribe({
        next: (res: any) => {
          this.success = res?.message || 'Attendance saved successfully';
          this.submitting = false;
          this.hasUnsavedChanges = false;
          this.lastSavedDate = new Date();
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to save attendance';
          this.submitting = false;
          setTimeout(() => (this.error = ''), 5000);
        }
      });
  }

  // ----- Stats / filtering -----
  getStatistics() {
    const stats = { present: 0, absent: 0, late: 0, excused: 0, total: this.attendanceData.length };
    for (const a of this.attendanceData) {
      if (a.status === 'present') stats.present++;
      else if (a.status === 'absent') stats.absent++;
      else if (a.status === 'late') stats.late++;
      else if (a.status === 'excused') stats.excused++;
    }
    return stats;
  }

  getAttendanceRate(): number {
    const s = this.getStatistics();
    if (s.total === 0) return 0;
    return Math.round(((s.present + s.excused) / s.total) * 100);
  }

  onSearchChange(): void {
    this.updateFilteredData();
  }

  onStatusFilterChange(): void {
    this.updateFilteredData();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.updateFilteredData();
  }

  private updateFilteredData(): void {
    let list = [...this.attendanceData];
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter((row) => {
        const name = this.getStudentName(row.studentId).toLowerCase();
        const num = this.getStudentNumber(row.studentId).toLowerCase();
        return name.includes(q) || num.includes(q);
      });
    }
    if (this.statusFilter !== 'all') {
      list = list.filter((row) => row.status === this.statusFilter);
    }
    this.filteredAttendanceData = list;
  }

  trackByStudent = (_: number, row: AttendanceRow) => row.studentId;
}
