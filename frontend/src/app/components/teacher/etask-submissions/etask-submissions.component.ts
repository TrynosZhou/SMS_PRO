import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { EtaskService, ETaskSubmissionDto } from '../../../services/etask.service';

export type SubmissionsSortKey = 'submittedAt' | 'student' | 'task';

@Component({
  selector: 'app-etask-submissions',
  templateUrl: './etask-submissions.component.html',
  styleUrls: ['./etask-submissions.component.css']
})
export class EtaskSubmissionsComponent implements OnInit {
  rows: ETaskSubmissionDto[] = [];
  loading = true;
  error = '';

  /** Toolbar */
  searchQuery = '';
  selectedTaskId = '';
  sortKey: SubmissionsSortKey = 'submittedAt';
  sortDir: 'asc' | 'desc' = 'desc';

  constructor(
    private etaskService: EtaskService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || String(user.role).toLowerCase() !== 'teacher') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.etaskService.listTeacherSubmissions().subscribe({
      next: (data) => {
        this.rows = Array.isArray(data) ? data : [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Could not load submissions.';
        this.loading = false;
      }
    });
  }

  get taskOptions(): { id: string; title: string }[] {
    const map = new Map<string, string>();
    for (const r of this.rows) {
      if (r.eTaskId) {
        const t = r.eTask?.title?.trim() || 'Untitled task';
        map.set(r.eTaskId, t);
      }
    }
    return Array.from(map.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  get totalCount(): number {
    return this.rows.length;
  }

  get uniqueStudentCount(): number {
    return new Set(this.rows.map((r) => r.studentId)).size;
  }

  get uniqueTaskCount(): number {
    return new Set(this.rows.map((r) => r.eTaskId)).size;
  }

  /** Filtered + sorted list for the table */
  get displayRows(): ETaskSubmissionDto[] {
    let list = [...this.rows];
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = this.studentFullName(r).toLowerCase();
        const task = this.taskTitle(r).toLowerCase();
        const note = (r.note || '').toLowerCase();
        return name.includes(q) || task.includes(q) || note.includes(q);
      });
    }
    if (this.selectedTaskId) {
      list = list.filter((r) => r.eTaskId === this.selectedTaskId);
    }

    const dir = this.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (this.sortKey === 'submittedAt') {
        const ta = new Date(a.submittedAt).getTime();
        const tb = new Date(b.submittedAt).getTime();
        return (ta - tb) * dir;
      }
      if (this.sortKey === 'student') {
        return this.studentFullName(a).localeCompare(this.studentFullName(b)) * dir;
      }
      return this.taskTitle(a).localeCompare(this.taskTitle(b)) * dir;
    });
    return list;
  }

  trackById(_index: number, row: ETaskSubmissionDto): string {
    return row.id;
  }

  studentInitials(row: ETaskSubmissionDto): string {
    const s = row.student;
    if (!s) {
      return '?';
    }
    const a = (s.firstName || '').trim().charAt(0);
    const b = (s.lastName || '').trim().charAt(0);
    const out = `${a}${b}`.toUpperCase();
    return out || '?';
  }

  studentFullName(row: ETaskSubmissionDto): string {
    const s = row.student;
    if (!s) {
      return '—';
    }
    const fn = (s.firstName || '').trim();
    const ln = (s.lastName || '').trim();
    return [fn, ln].filter(Boolean).join(' ') || '—';
  }

  taskTitle(row: ETaskSubmissionDto): string {
    return row.eTask?.title?.trim() || '—';
  }

  taskTypeLabel(row: ETaskSubmissionDto): 'assignment' | 'test' | 'notes' | null {
    const t = row.eTask?.taskType;
    if (t === 'assignment' || t === 'test' || t === 'notes') {
      return t;
    }
    return null;
  }

  openUrl(row: ETaskSubmissionDto): string | null {
    return EtaskService.resolveUploadUrl(row.fileUrl);
  }

  toggleSort(key: SubmissionsSortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'submittedAt' ? 'desc' : 'asc';
    }
  }

  sortLabel(): string {
    const k =
      this.sortKey === 'submittedAt'
        ? 'Date'
        : this.sortKey === 'student'
          ? 'Student'
          : 'Task';
    return `${k} (${this.sortDir === 'asc' ? 'A→Z / oldest first' : 'Z→A / newest first'})`;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedTaskId = '';
    this.sortKey = 'submittedAt';
    this.sortDir = 'desc';
  }

  hasActiveFilters(): boolean {
    return !!this.searchQuery.trim() || !!this.selectedTaskId;
  }
}
