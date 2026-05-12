import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TeacherService } from '../../../services/teacher.service';
import { AddTeacherModalService } from '../../../services/add-teacher-modal.service';

@Component({
  selector: 'app-manage-teachers',
  templateUrl: './manage-teachers.component.html',
  styleUrls: ['./manage-teachers.component.css']
})
export class ManageTeachersComponent implements OnInit, OnDestroy {
  private addTeacherSub?: Subscription;

  teachers: any[] = [];
  filteredTeachers: any[] = [];
  loading = false;
  error = '';
  success = '';

  searchQuery = '';
  showMales = true;
  showFemales = true;
  showActive = true;
  showInactive = true;

  pagination = {
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [5, 10, 25, 50];

  constructor(
    private teacherService: TeacherService,
    private router: Router,
    private addTeacherModal: AddTeacherModalService
  ) {}

  ngOnInit(): void {
    this.loadTeachers();
    this.addTeacherSub = this.addTeacherModal.created$.subscribe(() => {
      this.success = 'Teacher added';
      setTimeout(() => (this.success = ''), 4000);
      this.loadTeachers();
    });
  }

  ngOnDestroy(): void {
    this.addTeacherSub?.unsubscribe();
  }

  loadTeachers(): void {
    this.loading = true;
    this.error = '';
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.teachers = list;
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teachers:', err);
        this.teachers = [];
        this.filteredTeachers = [];
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load teachers';
      }
    });
  }

  applyFilters(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    let list = [...this.teachers];

    list = list.filter((t) => {
      const gender = (t.gender || '').toLowerCase();
      const isMale = gender === 'male';
      const isFemale = gender === 'female';
      if (!this.showMales && isMale) return false;
      if (!this.showFemales && isFemale) return false;
      if (!this.showMales && !this.showFemales && (isMale || isFemale)) return false;

      const active = t.isActive !== false;
      if (!this.showActive && active) return false;
      if (!this.showInactive && !active) return false;

      return true;
    });

    if (q) {
      list = list.filter((t) => {
        const haystack = [
          t.firstName,
          t.lastName,
          t.teacherId,
          t.phoneNumber,
          t.email,
          t.role
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
    this.filteredTeachers = list.slice(start, start + this.pagination.limit);
  }

  onSearchChange(): void {
    this.pagination.page = 1;
    this.applyFilters();
  }

  toggleFilter(): void {
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

  goToAddTeacher(): void {
    this.addTeacherModal.open();
  }

  viewTeacher(t: any): void {
    if (!t?.id) return;
    this.router.navigate(['/teachers/manage/edit', t.id]);
  }

  deleteTeacher(t: any): void {
    if (!t?.id) return;
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherId;
    if (!confirm(`Delete teacher "${name}"? This cannot be undone.`)) return;
    this.loading = true;
    this.teacherService.deleteTeacher(t.id).subscribe({
      next: () => {
        this.success = 'Teacher deleted';
        setTimeout(() => (this.success = ''), 3000);
        this.loadTeachers();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to delete teacher';
        this.loading = false;
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  titleFor(t: any): string {
    if (!t) return '';
    const g = (t.gender || '').toLowerCase();
    const m = (t.maritalStatus || '').toLowerCase();
    if (g === 'female') {
      if (m === 'married') return 'Mrs';
      if (m === 'divorced' || m === 'widowed') return 'Ms';
      if (m === 'single') return 'Miss';
      return 'Ms';
    }
    if (g === 'male') return 'Mr';
    return '';
  }

  rangeInfo(): string {
    const total = this.pagination.total;
    if (total === 0) return '0 of 0';
    const start = (this.pagination.page - 1) * this.pagination.limit + 1;
    const end = start + this.filteredTeachers.length - 1;
    return `${start} – ${end} of ${total}`;
  }
}
