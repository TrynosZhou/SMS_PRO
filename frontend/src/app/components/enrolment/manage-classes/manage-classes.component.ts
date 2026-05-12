import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';

interface FormOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-manage-classes',
  templateUrl: './manage-classes.component.html',
  styleUrls: ['./manage-classes.component.css']
})
export class ManageClassesComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  studentCounts: Record<string, number> = {};
  loading = false;
  error = '';
  success = '';

  searchQuery = '';
  selectedForm = '';
  formOptions: FormOption[] = [];

  // Add/edit modal
  showFormModal = false;
  editingClassId: string | null = null;
  saving = false;
  formError = '';
  formData = {
    name: '',
    form: '',
    capacity: 40,
    isActive: true
  };

  constructor(
    private classService: ClassService,
    private studentService: StudentService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadClasses();
    this.loadStudentCounts();
  }

  loadClasses(): void {
    this.loading = true;
    this.error = '';
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.classes = this.classService.sortClasses(list);
        this.buildFormOptions();
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.classes = [];
        this.filteredClasses = [];
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load classes';
      }
    });
  }

  loadStudentCounts(): void {
    this.studentService.getStudents().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const counts: Record<string, number> = {};
        for (const s of list) {
          const cid = String(s.classId || s.class?.id || s.classEntity?.id || '');
          if (!cid) continue;
          counts[cid] = (counts[cid] || 0) + 1;
        }
        this.studentCounts = counts;
      },
      error: () => {
        this.studentCounts = {};
      }
    });
  }

  private buildFormOptions(): void {
    const set = new Set<string>();
    for (const c of this.classes) {
      const f = (c.form || c.gradeLevel || c.level || '').toString().trim();
      if (f) set.add(f);
    }
    this.formOptions = Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }

  applyFilters(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    const form = (this.selectedForm || '').trim().toLowerCase();
    let list = [...this.classes];

    if (form) {
      list = list.filter(
        (c) => (c.form || c.gradeLevel || c.level || '').toString().toLowerCase() === form
      );
    }
    if (q) {
      list = list.filter((c) => {
        const hay = [c.name, c.form, c.gradeLevel, c.code, c.description]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    }

    this.filteredClasses = list;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFormFilterChange(): void {
    this.applyFilters();
  }

  refresh(): void {
    this.loadClasses();
    this.loadStudentCounts();
  }

  countOf(c: any): number {
    return this.studentCounts[String(c?.id)] || 0;
  }

  openAddClass(): void {
    this.editingClassId = null;
    this.formData = { name: '', form: '', capacity: 40, isActive: true };
    this.formError = '';
    this.showFormModal = true;
  }

  openEditClass(c: any): void {
    if (!c?.id) return;
    this.editingClassId = c.id;
    this.formData = {
      name: c.name || '',
      form: c.form || c.gradeLevel || c.level || '',
      capacity: typeof c.capacity === 'number' ? c.capacity : 40,
      isActive: c.isActive !== false
    };
    this.formError = '';
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.editingClassId = null;
    this.formError = '';
    this.saving = false;
  }

  saveClass(): void {
    if (!this.formData.name?.trim()) {
      this.formError = 'Class name is required';
      return;
    }
    this.saving = true;
    this.formError = '';

    const payload: any = {
      name: this.formData.name.trim(),
      form: this.formData.form?.trim() || null,
      capacity: this.formData.capacity || null,
      isActive: this.formData.isActive
    };

    const obs = this.editingClassId
      ? this.classService.updateClass(this.editingClassId, payload)
      : this.classService.createClass(payload);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.success = this.editingClassId ? 'Class updated' : 'Class created';
        setTimeout(() => (this.success = ''), 3000);
        this.closeFormModal();
        this.loadClasses();
      },
      error: (err: any) => {
        this.saving = false;
        this.formError = err?.error?.message || 'Failed to save class';
      }
    });
  }

  deleteClass(c: any): void {
    if (!c?.id) return;
    if (!confirm(`Delete class "${c.name}"? This cannot be undone.`)) return;
    this.loading = true;
    this.classService.deleteClass(c.id).subscribe({
      next: () => {
        this.success = 'Class deleted';
        setTimeout(() => (this.success = ''), 3000);
        this.loadClasses();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to delete class';
        this.loading = false;
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }
}
