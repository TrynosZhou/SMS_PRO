import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';

@Component({
  selector: 'app-manage-students',
  templateUrl: './manage-students.component.html',
  styleUrls: ['./manage-students.component.css']
})
export class ManageStudentsComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  loading = false;
  error = '';
  success = '';

  searchQuery = '';
  selectedGender = '';

  pagination = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [5, 10, 25, 50];

  constructor(
    private studentService: StudentService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadStudents();
  }

  loadStudents(): void {
    this.loading = true;
    this.error = '';
    this.studentService.getStudents().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.students = list;
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        this.students = [];
        this.filteredStudents = [];
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load students';
      }
    });
  }

  applyFilters(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    const gender = (this.selectedGender || '').toLowerCase();

    let list = [...this.students];

    if (gender) {
      list = list.filter((s) => (s.gender || '').toLowerCase() === gender);
    }

    if (q) {
      list = list.filter((s) => {
        const haystack = [
          s.firstName,
          s.lastName,
          s.studentNumber,
          s.contactNumber,
          s.phoneNumber
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return haystack.includes(q);
      });
    }

    this.pagination.total = list.length;
    this.pagination.totalPages = Math.max(1, Math.ceil(list.length / this.pagination.limit));
    if (this.pagination.page > this.pagination.totalPages) {
      this.pagination.page = 1;
    }

    const start = (this.pagination.page - 1) * this.pagination.limit;
    this.filteredStudents = list.slice(start, start + this.pagination.limit);
  }

  onSearchChange(): void {
    this.pagination.page = 1;
    this.applyFilters();
  }

  onGenderChange(): void {
    this.pagination.page = 1;
    this.applyFilters();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.pagination.page = page;
    this.applyFilters();
  }

  changePageSize(value: any): void {
    const n = parseInt(String(value), 10);
    if (!n || n === this.pagination.limit) return;
    this.pagination.limit = n;
    this.pagination.page = 1;
    this.applyFilters();
  }

  refresh(): void {
    this.loadStudents();
  }

  viewStudent(s: any): void {
    if (!s?.id) return;
    this.router.navigate(['/students/manage/edit', s.id]);
  }

  deleteStudent(s: any): void {
    if (!s?.id) return;
    const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.studentNumber;
    if (!confirm(`Delete student "${name}"? This cannot be undone.`)) return;
    this.loading = true;
    this.studentService.deleteStudent(s.id).subscribe({
      next: () => {
        this.success = 'Student deleted';
        setTimeout(() => (this.success = ''), 3000);
        this.loadStudents();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to delete student';
        this.loading = false;
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  fullName(s: any): string {
    return `${s?.firstName || ''} ${s?.lastName || ''}`.trim() || '—';
  }

  phoneOf(s: any): string {
    return s?.contactNumber || s?.phoneNumber || '—';
  }
}
