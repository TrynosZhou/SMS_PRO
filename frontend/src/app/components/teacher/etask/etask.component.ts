import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { EtaskService, ETaskDto } from '../../../services/etask.service';

@Component({
  selector: 'app-etask',
  templateUrl: './etask.component.html',
  styleUrls: ['./etask.component.css']
})
export class EtaskComponent implements OnInit {
  @ViewChild('attachmentInput') attachmentInput?: ElementRef<HTMLInputElement>;

  classes: any[] = [];
  loadingClasses = true;
  loadingSubmit = false;
  loadingList = true;
  deletingTaskId: string | null = null;
  error = '';
  success = '';

  title = '';
  taskType: 'assignment' | 'test' | 'notes' = 'assignment';
  classId = '';
  description = '';
  dueDate = '';
  attachment: File | null = null;
  attachmentName = '';

  recentTasks: ETaskDto[] = [];
  /** Filter sent tasks list */
  listSearch = '';

  constructor(
    private teacherService: TeacherService,
    private etaskService: EtaskService
  ) {}

  ngOnInit(): void {
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        const list = teacher?.classes || [];
        this.classes = Array.isArray(list) ? list : [];
        this.loadingClasses = false;
      },
      error: () => {
        this.error = 'Could not load your classes.';
        this.loadingClasses = false;
      }
    });
    this.loadTasks();
  }

  loadTasks(): void {
    this.loadingList = true;
    this.etaskService.listTeacherTasks().subscribe({
      next: (tasks) => {
        this.recentTasks = Array.isArray(tasks) ? tasks : [];
        this.loadingList = false;
      },
      error: () => {
        this.recentTasks = [];
        this.loadingList = false;
      }
    });
  }

  get totalTaskCount(): number {
    return this.recentTasks.length;
  }

  get assignmentCount(): number {
    return this.recentTasks.filter((t) => t.taskType === 'assignment').length;
  }

  get testCount(): number {
    return this.recentTasks.filter((t) => t.taskType === 'test').length;
  }

  get notesCount(): number {
    return this.recentTasks.filter((t) => t.taskType === 'notes').length;
  }

  get filteredTasks(): ETaskDto[] {
    const q = this.listSearch.trim().toLowerCase();
    if (!q) {
      return this.recentTasks;
    }
    return this.recentTasks.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const cls = (t.classEntity?.name || '').toLowerCase();
      return title.includes(q) || cls.includes(q);
    });
  }

  trackByTaskId(_: number, t: ETaskDto): string {
    return t.id;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.attachment = input.files[0];
      this.attachmentName = this.attachment.name;
    } else {
      this.attachment = null;
      this.attachmentName = '';
    }
  }

  clearAttachment(): void {
    this.attachment = null;
    this.attachmentName = '';
    if (this.attachmentInput?.nativeElement) {
      this.attachmentInput.nativeElement.value = '';
    }
  }

  submit(): void {
    this.error = '';
    this.success = '';
    if (!this.title.trim()) {
      this.error = 'Title is required.';
      return;
    }
    if (!this.classId) {
      this.error = 'Please select a class.';
      return;
    }

    const fd = new FormData();
    fd.append('title', this.title.trim());
    fd.append('taskType', this.taskType);
    fd.append('classId', this.classId);
    if (this.description.trim()) {
      fd.append('description', this.description.trim());
    }
    if (this.dueDate) {
      fd.append('dueDate', this.dueDate);
    }
    if (this.attachment) {
      fd.append('attachment', this.attachment, this.attachment.name);
    }

    this.loadingSubmit = true;
    this.etaskService.createTask(fd).subscribe({
      next: (res) => {
        this.success = res?.message || 'Task sent to students in this class.';
        this.title = '';
        this.description = '';
        this.dueDate = '';
        this.attachment = null;
        this.attachmentName = '';
        if (this.attachmentInput?.nativeElement) {
          this.attachmentInput.nativeElement.value = '';
        }
        this.loadingSubmit = false;
        this.loadTasks();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Could not create task.';
        this.loadingSubmit = false;
      }
    });
  }

  attachmentLink(path: string | null | undefined): string | null {
    return EtaskService.resolveUploadUrl(path);
  }

  setTaskType(type: 'assignment' | 'test' | 'notes'): void {
    this.taskType = type;
  }

  deleteTask(taskId: string): void {
    if (!taskId) return;

    const ok = confirm('Delete this task? This will remove related submissions.');
    if (!ok) return;

    this.error = '';
    this.success = '';
    this.deletingTaskId = taskId;

    this.etaskService.deleteTeacherTask(taskId).subscribe({
      next: (res) => {
        this.success = res?.message || 'Task deleted';
        this.deletingTaskId = null;
        this.loadTasks();
      },
      error: (err) => {
        this.error = err?.error?.message || err?.message || 'Failed to delete task';
        this.deletingTaskId = null;
      }
    });
  }
}
