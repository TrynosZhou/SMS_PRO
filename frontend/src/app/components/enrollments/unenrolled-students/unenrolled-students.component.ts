import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  isInStudentsManageShell,
  studentsManageNav,
} from '../../students/students-manage-navigation';
import { EnrollmentService } from '../../../services/enrollment.service';
import { StudentService } from '../../../services/student.service';

@Component({
  selector: 'app-unenrolled-students',
  templateUrl: './unenrolled-students.component.html',
  styleUrls: ['./unenrolled-students.component.css']
})
export class UnenrolledStudentsComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  paginatedStudents: any[] = [];
  loading = false;
  error = '';
  searchQuery = '';
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50, 100];

  /** 1–3 for workflow strip (visual only) */
  workflowStep: 1 | 2 | 3 = 1;

  constructor(
    private enrollmentService: EnrollmentService,
    private studentService: StudentService,
    public router: Router
  ) { }

  ngOnInit() {
    this.loadUnenrolledStudents();
  }

  get totalUnenrolled(): number {
    return this.filteredStudents.length;
  }

  get boarderCount(): number {
    return this.filteredStudents.filter(
      (s: any) => String(s.studentType || '').toLowerCase().includes('board')
    ).length;
  }

  get dayScholarCount(): number {
    return this.filteredStudents.filter(
      (s: any) => !String(s.studentType || '').toLowerCase().includes('board')
    ).length;
  }

  /** Full unenrolled queue (not affected by search filter) */
  get maleUnenrolledTotal(): number {
    return this.countUnenrolledByGender('Male');
  }

  /** Full unenrolled queue (not affected by search filter) */
  get femaleUnenrolledTotal(): number {
    return this.countUnenrolledByGender('Female');
  }

  private countUnenrolledByGender(gender: string): number {
    const g = gender.toLowerCase();
    return this.students.filter(
      (s: any) => String(s.gender || '').trim().toLowerCase() === g
    ).length;
  }

  get hasActiveSearch(): boolean {
    return !!this.searchQuery.trim();
  }

  loadUnenrolledStudents() {
    this.loading = true;
    this.error = '';
    this.workflowStep = 1;
    this.enrollmentService.getUnenrolledStudents().subscribe({
      next: (data: any) => {
        this.applyStudentList(data || []);
      },
      error: () => {
        this.studentService.getStudents({ enrollmentStatus: 'Not Enrolled' }).subscribe({
          next: (data: any) => {
            this.applyStudentList(data || []);
          },
          error: (err2: any) => {
            console.error('Error loading unenrolled students:', err2);
            this.error = 'Failed to load unenrolled students';
            this.loading = false;
            setTimeout(() => (this.error = ''), 6000);
          }
        });
      }
    });
  }

  private applyStudentList(data: any[]) {
    this.students = data;
    this.filteredStudents = this.students;
    this.pagination.total = this.filteredStudents.length;
    this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.limit);
    this.pagination.page = 1;
    this.updatePaginatedStudents();
    this.loading = false;
    this.workflowStep = this.totalUnenrolled > 0 ? 2 : 3;
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterStudents();
  }

  filterStudents() {
    if (!this.searchQuery.trim()) {
      this.filteredStudents = this.students;
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredStudents = this.students.filter(
        (s: any) =>
          s.studentNumber?.toLowerCase().includes(query) ||
          s.firstName?.toLowerCase().includes(query) ||
          s.lastName?.toLowerCase().includes(query) ||
          `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(query)
      );
    }
    this.pagination.total = this.filteredStudents.length;
    this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.limit);
    this.pagination.page = 1;
    this.updatePaginatedStudents();
  }

  updatePaginatedStudents() {
    const start = (this.pagination.page - 1) * this.pagination.limit;
    const end = start + this.pagination.limit;
    this.paginatedStudents = this.filteredStudents.slice(start, end);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.updatePaginatedStudents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) return;
    this.pagination.limit = parsedLimit;
    this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.limit);
    this.pagination.page = 1;
    this.updatePaginatedStudents();
  }

  enrollStudent(studentId: string) {
    if (isInStudentsManageShell(this.router)) {
      this.router.navigate(['/students', 'manage', 'enroll'], { queryParams: { studentId } });
    } else {
      this.router.navigate(['/enrollments', 'new'], { queryParams: { studentId } });
    }
  }

  goToAddStudent(): void {
    this.router.navigateByUrl(studentsManageNav(this.router).addNew);
  }

  formatDate(dateString: string | Date | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  initials(student: any): string {
    const a = (student?.firstName || '').trim().charAt(0) || '?';
    const b = (student?.lastName || '').trim().charAt(0) || '';
    return (a + b).toUpperCase();
  }
}
