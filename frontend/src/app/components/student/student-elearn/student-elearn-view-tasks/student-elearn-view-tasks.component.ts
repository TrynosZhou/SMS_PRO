import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../services/auth.service';
import { EtaskService, ETaskDto } from '../../../../services/etask.service';

export type ElearnFilter = 'all' | 'assignment' | 'test' | 'notes';

/** View-only list of assignments, tests, and notes (view_task). */
@Component({
  selector: 'app-student-elearn-view-tasks',
  templateUrl: './student-elearn-view-tasks.component.html',
  styleUrls: ['../elearn-shared.css'],
})
export class StudentElearnViewTasksComponent implements OnInit {
  tasks: ETaskDto[] = [];
  loading = true;
  error = '';

  filterKind: ElearnFilter = 'all';
  searchQuery = '';

  constructor(
    private etaskService: EtaskService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || String(user.role).toLowerCase() !== 'student') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.etaskService.listStudentTasks().subscribe({
      next: (tasks) => {
        this.tasks = Array.isArray(tasks) ? tasks : [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Could not load materials.';
        this.loading = false;
      },
    });
  }

  setFilter(kind: ElearnFilter): void {
    this.filterKind = kind;
  }

  get filteredTasks(): ETaskDto[] {
    let list = this.tasks;
    if (this.filterKind !== 'all') {
      list = list.filter((t) => t.taskType === this.filterKind);
    }
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const cls = (t.classEntity?.name || '').toLowerCase();
      const teacher = this.teacherDisplay(t).toLowerCase();
      return title.includes(q) || cls.includes(q) || teacher.includes(q);
    });
  }

  typeLabel(t: ETaskDto): string {
    if (t.taskType === 'test') {
      return 'Test';
    }
    if (t.taskType === 'notes') {
      return 'Notes';
    }
    return 'Assignment';
  }

  teacherDisplay(t: ETaskDto): string {
    const tr = t.teacher;
    if (!tr) {
      return '—';
    }
    const fn = (tr.firstName || '').trim();
    const ln = (tr.lastName || '').trim();
    const name = [fn, ln].filter(Boolean).join(' ');
    return name || '—';
  }

  classLabel(t: ETaskDto): string {
    return (t.classEntity?.name || '').trim() || '—';
  }

  needsDueLine(t: ETaskDto): boolean {
    return (t.taskType === 'assignment' || t.taskType === 'test') && !!t.dueDate;
  }

  linkFor(t: ETaskDto): string | null {
    return EtaskService.resolveUploadUrl(t.attachmentUrl);
  }
}
