import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ClassService } from '../../../services/class.service';
import { EnrollmentService } from '../../../services/enrollment.service';
import { StudentService } from '../../../services/student.service';

interface Term {
  id: string;
  term?: string;
  label?: string;
  termNumber?: number | string;
  year: number | string;
  status?: string;
}

interface ClassRow {
  id: string;
  name: string;
  form?: string;
}

@Component({
  selector: 'app-enrol-students',
  templateUrl: './enrol-students.component.html',
  styleUrls: ['./enrol-students.component.css']
})
export class EnrolStudentsComponent implements OnInit {
  terms: Term[] = [];
  classes: ClassRow[] = [];
  selectedTermId = '';
  selectedClassId = '';

  loadingTerms = false;
  loadingClasses = false;
  loadingList = false;
  hasFetched = false;
  error = '';
  success = '';

  enrolledStudents: any[] = [];
  unenrolledStudents: any[] = [];

  enrolling: Record<string, boolean> = {};

  constructor(
    private http: HttpClient,
    private classService: ClassService,
    private enrollmentService: EnrollmentService,
    private studentService: StudentService
  ) {}

  ngOnInit(): void {
    this.loadTerms();
    this.loadClasses();
    this.loadUnenrolled();
  }

  loadTerms(): void {
    this.loadingTerms = true;
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.terms = list;
        this.loadingTerms = false;
        const active = list.find((t: any) => t.status === 'active');
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

  loadUnenrolled(): void {
    this.enrollmentService.getUnenrolledStudents().subscribe({
      next: (data: any) => {
        this.unenrolledStudents = data || [];
      },
      error: () => {
        this.unenrolledStudents = [];
      }
    });
  }

  termLabel(t: Term): string {
    const n = t.termNumber ?? t.term;
    if (n && t.year) return `Term ${n} (${t.year})`;
    return t.label || t.term || 'Term';
  }

  fetchList(): void {
    if (!this.selectedClassId) {
      this.error = 'Please select a class.';
      setTimeout(() => (this.error = ''), 3500);
      return;
    }
    this.loadingList = true;
    this.error = '';
    this.hasFetched = true;
    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.enrolledStudents = list;
        this.loadingList = false;
      },
      error: (err: any) => {
        this.enrolledStudents = [];
        this.loadingList = false;
        this.error = err?.error?.message || 'Failed to fetch class list';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  enrol(student: any): void {
    if (!student?.id || !this.selectedClassId) return;
    this.enrolling[student.id] = true;
    this.enrollmentService
      .enrollStudent({
        studentId: student.id,
        classId: this.selectedClassId,
        enrollmentDate: new Date().toISOString().split('T')[0]
      })
      .subscribe({
        next: () => {
          this.enrolling[student.id] = false;
          this.success = 'Student enrolled';
          setTimeout(() => (this.success = ''), 3000);
          this.loadUnenrolled();
          this.fetchList();
        },
        error: (err: any) => {
          this.enrolling[student.id] = false;
          this.error = err?.error?.message || 'Failed to enrol student';
          setTimeout(() => (this.error = ''), 5000);
        }
      });
  }

  withdraw(student: any): void {
    if (!student?.id) return;
    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    if (!confirm(`Withdraw ${name || 'this student'} from the class?`)) return;
    this.enrolling[student.id] = true;
    this.enrollmentService
      .withdrawStudent({
        studentId: student.id,
        withdrawalDate: new Date().toISOString().split('T')[0]
      })
      .subscribe({
        next: () => {
          this.enrolling[student.id] = false;
          this.success = 'Student withdrawn';
          setTimeout(() => (this.success = ''), 3000);
          this.loadUnenrolled();
          this.fetchList();
        },
        error: (err: any) => {
          this.enrolling[student.id] = false;
          this.error = err?.error?.message || 'Failed to withdraw student';
          setTimeout(() => (this.error = ''), 5000);
        }
      });
  }
}
