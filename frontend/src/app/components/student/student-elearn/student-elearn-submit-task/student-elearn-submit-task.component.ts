import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { EtaskService, ETaskDto, ETaskSubmissionDto } from '../../../../services/etask.service';

export type SubmitFilter = 'all' | 'assignment' | 'test';

/** Upload work for assignments and tests only (submit_task). */
@Component({
  selector: 'app-student-elearn-submit-task',
  templateUrl: './student-elearn-submit-task.component.html',
  styleUrls: ['../elearn-shared.css'],
})
export class StudentElearnSubmitTaskComponent implements OnInit {
  tasks: ETaskDto[] = [];
  submissionByTaskId: Record<string, ETaskSubmissionDto> = {};
  loading = true;
  error = '';
  uploadingTaskId: string | null = null;
  uploadError: Record<string, string> = {};

  filterKind: SubmitFilter = 'all';
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
    forkJoin({
      tasks: this.etaskService.listStudentTasks(),
      subs: this.etaskService.listStudentMySubmissions(),
    }).subscribe({
      next: ({ tasks, subs }) => {
        const all = Array.isArray(tasks) ? tasks : [];
        this.tasks = all.filter((t) => t.taskType === 'assignment' || t.taskType === 'test');
        const list = Array.isArray(subs) ? subs : [];
        this.submissionByTaskId = {};
        for (const s of list) {
          if (s.eTaskId && !this.submissionByTaskId[s.eTaskId]) {
            this.submissionByTaskId[s.eTaskId] = s;
          }
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Could not load tasks.';
        this.loading = false;
      },
    });
  }

  setFilter(kind: SubmitFilter): void {
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
    return t.taskType === 'test' ? 'Test' : 'Assignment';
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

  linkFor(t: ETaskDto): string | null {
    return EtaskService.resolveUploadUrl(t.attachmentUrl);
  }

  linkForMySubmission(taskId: string): string | null {
    const s = this.submissionByTaskId[taskId];
    if (!s?.fileUrl) {
      return null;
    }
    return EtaskService.resolveUploadUrl(s.fileUrl);
  }

  onFileSelected(taskId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.uploadError[taskId] = '';
    this.uploadingTaskId = taskId;
    this.etaskService.submitStudentTask(taskId, file).subscribe({
      next: (res) => {
        this.uploadingTaskId = null;
        if (res?.submission) {
          this.submissionByTaskId[taskId] = res.submission;
        }
      },
      error: (err) => {
        this.uploadingTaskId = null;
        this.uploadError[taskId] = err?.error?.message || 'Upload failed.';
      },
    });
  }
}
