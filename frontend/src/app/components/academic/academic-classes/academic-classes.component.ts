import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-academic-classes',
  templateUrl: './academic-classes.component.html',
  styleUrls: ['./academic-classes.component.css']
})
export class AcademicClassesComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  pagedClasses: any[] = [];

  searchQuery = '';
  selectedForm = 'all';
  availableForms: string[] = [];
  loading = false;

  // Pagination
  pageSize = 5;
  currentPage = 1;
  pageSizeOptions = [5, 10, 20, 50];

  // Modal
  showAddModal = false;
  submitting = false;
  submitted = false;
  errorMsg = '';

  newClass = { name: '', form: '', description: '' };

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadClasses(); }

  loadClasses() {
    this.loading = true;
    this.http.get<any>(`${environment.apiUrl}/classes`).subscribe({
      next: (data) => {
        this.classes = Array.isArray(data) ? data : data?.data || [];
        this.availableForms = [...new Set(this.classes.map((c: any) => c.form).filter(Boolean))].sort();
        this.applyFilters();
        this.loading = false;
      },
      error: () => { this.classes = []; this.filteredClasses = []; this.pagedClasses = []; this.loading = false; }
    });
  }

  applyFilters() {
    let list = [...this.classes];
    if (this.selectedForm !== 'all') {
      list = list.filter(c => c.form === this.selectedForm);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.form?.toLowerCase().includes(q));
    }
    this.filteredClasses = list;
    this.currentPage = 1;
    this.updatePage();
  }

  updatePage() {
    const start = (this.currentPage - 1) * this.pageSize;
    this.pagedClasses = this.filteredClasses.slice(start, start + this.pageSize);
  }

  get totalPages(): number { return Math.ceil(this.filteredClasses.length / this.pageSize) || 1; }
  get pageLabel(): string { return `${this.filteredClasses.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1}–${Math.min(this.currentPage * this.pageSize, this.filteredClasses.length)} of ${this.filteredClasses.length}`; }

  goFirst()  { this.currentPage = 1; this.updatePage(); }
  goPrev()   { if (this.currentPage > 1) { this.currentPage--; this.updatePage(); } }
  goNext()   { if (this.currentPage < this.totalPages) { this.currentPage++; this.updatePage(); } }
  goLast()   { this.currentPage = this.totalPages; this.updatePage(); }
  onPageSizeChange() { this.currentPage = 1; this.updatePage(); }

  openAddModal() {
    this.newClass = { name: '', form: '', description: '' };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  closeModal() { this.showAddModal = false; this.errorMsg = ''; }

  saveClass() {
    this.submitted = true;
    if (!this.newClass.name || !this.newClass.form) {
      this.errorMsg = 'Class Name and Form are required.';
      return;
    }
    this.submitting = true;
    this.errorMsg = '';
    this.http.post<any>(`${environment.apiUrl}/classes`, this.newClass).subscribe({
      next: () => { this.submitting = false; this.closeModal(); this.loadClasses(); },
      error: (err) => { this.submitting = false; this.errorMsg = err?.error?.message || 'Failed to save class.'; }
    });
  }

  deleteClass(id: string, name: string) {
    if (!confirm(`Delete class "${name}"? This cannot be undone.`)) return;
    this.http.delete(`${environment.apiUrl}/classes/${id}`).subscribe({
      next: () => this.loadClasses(),
      error: (err) => alert(err?.error?.message || 'Failed to delete class.')
    });
  }

  studentCount(cls: any): number {
    return Array.isArray(cls.students) ? cls.students.length : 0;
  }
}
