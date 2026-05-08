import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface AcademicTerm {
  id: string;
  type: string;
  label: string;
  term: string;
  year: number | string;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive' | 'upcoming';
  termNumber?: number | string;
  periodType?: string;
}

@Component({
  selector: 'app-academic-terms',
  templateUrl: './academic-terms.component.html',
  styleUrls: ['./academic-terms.component.css']
})
export class AcademicTermsComponent implements OnInit {
  terms: AcademicTerm[] = [];
  filteredTerms: AcademicTerm[] = [];
  searchQuery = '';
  selectedYear = 'all';
  availableYears: (number | string)[] = [];
  loading = false;
  showAddModal = false;
  submitting = false;
  errorMsg = '';

  submitted = false;

  newTerm: Partial<AcademicTerm> = {
    termNumber: '',
    periodType: 'regular',
    year: '',
    startDate: '',
    endDate: '',
    status: 'upcoming'
  };

  termNumbers = [1, 2, 3, 4];

  periodTypes = [
    { value: 'regular', label: 'Regular' },
    { value: 'vacation', label: 'Vacation School' },
    { value: 'short', label: 'Short Course' },
  ];

  academicYearOptions: number[] = (() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1];
  })();

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadTerms();
  }

  loadTerms() {
    this.loading = true;
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        this.terms = Array.isArray(data) ? data : data?.data || [];
        this.buildYears();
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.terms = [];
        this.filteredTerms = [];
        this.loading = false;
      }
    });
  }

  buildYears() {
    const years = [...new Set(this.terms.map(t => t.year))].sort((a, b) => Number(b) - Number(a));
    this.availableYears = years;
  }

  applyFilters() {
    let list = [...this.terms];
    if (this.selectedYear !== 'all') {
      list = list.filter(t => String(t.year) === this.selectedYear);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(t =>
        t.label?.toLowerCase().includes(q) ||
        t.term?.toLowerCase().includes(q) ||
        t.type?.toLowerCase().includes(q)
      );
    }
    this.filteredTerms = list;
  }

  getDuration(start: string, end: string): string {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return '—';
    const weeks = Math.floor(days / 7);
    return weeks > 0 ? `${weeks}w ${days % 7}d` : `${days}d`;
  }

  openAddModal() {
    this.newTerm = {
      termNumber: '',
      periodType: 'regular',
      year: '',
      startDate: '',
      endDate: '',
      status: 'upcoming'
    };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  closeModal() {
    this.showAddModal = false;
    this.errorMsg = '';
  }

  saveTerm() {
    this.submitted = true;
    if (!this.newTerm.termNumber || !this.newTerm.year || !this.newTerm.startDate || !this.newTerm.endDate) {
      this.errorMsg = 'Please fill in all required fields.';
      return;
    }
    this.submitting = true;
    this.errorMsg = '';
    this.http.post<any>(`${environment.apiUrl}/settings/terms`, this.newTerm).subscribe({
      next: () => {
        this.submitting = false;
        this.closeModal();
        this.loadTerms();
      },
      error: (err) => {
        this.submitting = false;
        this.errorMsg = err?.error?.message || 'Failed to save term. Please try again.';
      }
    });
  }

  deleteTerm(id: string) {
    if (!confirm('Delete this term?')) return;
    this.http.delete(`${environment.apiUrl}/settings/terms/${id}`).subscribe({
      next: () => this.loadTerms(),
      error: () => alert('Failed to delete term.')
    });
  }
}
