import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ETaskDto {
  id: string;
  title: string;
  description: string | null;
  taskType: 'assignment' | 'test' | 'notes';
  teacherId: string;
  classId: string;
  attachmentUrl: string | null;
  dueDate: string | null;
  sentAt: string;
  teacher?: { firstName?: string; lastName?: string };
  classEntity?: { id: string; name: string };
}

/** Student submission for an e-task (teacher list or student own). */
export interface ETaskSubmissionDto {
  id: string;
  eTaskId: string;
  studentId: string;
  fileUrl: string;
  note: string | null;
  submittedAt: string;
  student?: { firstName?: string; lastName?: string };
  eTask?: ETaskDto;
}

@Injectable({
  providedIn: 'root'
})
export class EtaskService {
  private apiUrl = `${environment.apiUrl}/etasks`;

  constructor(private http: HttpClient) {}

  createTask(formData: FormData): Observable<any> {
    return this.http.post(this.apiUrl, formData);
  }

  listTeacherTasks(): Observable<ETaskDto[]> {
    return this.http.get<ETaskDto[]>(`${this.apiUrl}/teacher/mine`);
  }

  listStudentTasks(): Observable<ETaskDto[]> {
    return this.http.get<ETaskDto[]>(`${this.apiUrl}/student/mine`);
  }

  getStudentTask(id: string): Observable<ETaskDto> {
    return this.http.get<ETaskDto>(`${this.apiUrl}/student/${id}`);
  }

  /** Teacher: all submissions for tasks this teacher created. */
  listTeacherSubmissions(): Observable<ETaskSubmissionDto[]> {
    return this.http.get<ETaskSubmissionDto[]>(`${this.apiUrl}/teacher/submissions`);
  }

  /** Student: own submissions (with task relation). */
  listStudentMySubmissions(): Observable<ETaskSubmissionDto[]> {
    return this.http.get<ETaskSubmissionDto[]>(`${this.apiUrl}/student/submissions/mine`);
  }

  /** Student: upload or replace submission file for a task. */
  submitStudentTask(taskId: string, file: File, note?: string): Observable<{ message: string; submission: ETaskSubmissionDto }> {
    const fd = new FormData();
    fd.append('file', file);
    if (note && note.trim()) {
      fd.append('note', note.trim());
    }
    return this.http.post<{ message: string; submission: ETaskSubmissionDto }>(
      `${this.apiUrl}/student/submit/${taskId}`,
      fd
    );
  }

  /** Teacher: delete a task they created. */
  deleteTeacherTask(taskId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/teacher/${taskId}`);
  }

  /** Full URL for opening/downloading an attachment (served from API host, not /api). */
  static resolveUploadUrl(attachmentPath: string | null | undefined): string | null {
    if (!attachmentPath) {
      return null;
    }
    const base = environment.apiUrl.replace(/\/api\/?$/, '');
    if (attachmentPath.startsWith('http')) {
      return attachmentPath;
    }
    return `${base}${attachmentPath.startsWith('/') ? '' : '/'}${attachmentPath}`;
  }
}
