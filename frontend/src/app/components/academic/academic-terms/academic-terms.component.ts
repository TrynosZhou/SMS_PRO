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
  editingTermId: string | null = null;
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

  statusOptions: AcademicTerm['status'][] = ['active', 'inactive', 'upcoming'];

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
        const list = Array.isArray(data) ? data : data?.data || [];
        this.terms = list.map((t: any) => this.normalizeTerm(t));
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

  private normalizeTerm(raw: any): AcademicTerm {
    const periodType = raw?.periodType || 'regular';
    const termNumber = raw?.termNumber ?? '';
    const year = raw?.year ?? '';
    const periodLabel =
      this.periodTypes.find((p) => p.value === periodType)?.label || periodType;
    return {
      ...raw,
      periodType,
      termNumber,
      year,
      type: raw?.type || periodLabel,
      label: raw?.label || `T${termNumber}`,
      term: raw?.term || `Term ${termNumber} ${year}`.trim(),
      startDate: raw?.startDate || '',
      endDate: raw?.endDate || '',
      status: raw?.status || 'upcoming',
    };
  }

  get isEditMode(): boolean {
    return !!this.editingTermId;
  }

  /** Year dropdown options, including the term being edited if outside the default range. */
  get modalYearOptions(): number[] {
    const years = [...this.academicYearOptions];
    const y = Number(this.newTerm.year);
    if (y && !years.includes(y)) {
      years.push(y);
    }
    return years.sort((a, b) => a - b);
  }

  openAddModal() {
    this.editingTermId = null;
    this.newTerm = {
      termNumber: '',
      periodType: 'regular',
      year: '',
      startDate: '',
      endDate: '',
      status: 'upcoming',
    };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  openEditTerm(term: AcademicTerm) {
    if (!term?.id) return;
    this.editingTermId = term.id;
    this.newTerm = {
      termNumber: term.termNumber ?? '',
      periodType: term.periodType || 'regular',
      year: term.year ?? '',
      startDate: term.startDate ? String(term.startDate).split('T')[0] : '',
      endDate: term.endDate ? String(term.endDate).split('T')[0] : '',
      status: term.status || 'upcoming',
    };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  closeModal() {
    this.showAddModal = false;
    this.editingTermId = null;
    this.errorMsg = '';
    this.submitted = false;
  }

  saveTerm() {
    this.submitted = true;
    if (!this.newTerm.termNumber || !this.newTerm.year || !this.newTerm.startDate || !this.newTerm.endDate) {
      this.errorMsg = 'Please fill in all required fields.';
      return;
    }
    this.submitting = true;
    this.errorMsg = '';

    const payload = {
      termNumber: this.newTerm.termNumber,
      periodType: this.newTerm.periodType || 'regular',
      year: this.newTerm.year,
      startDate: this.newTerm.startDate,
      endDate: this.newTerm.endDate,
      status: this.newTerm.status || 'upcoming',
    };

    const url = `${environment.apiUrl}/settings/terms${this.editingTermId ? `/${this.editingTermId}` : ''}`;
    const request = this.editingTermId
      ? this.http.put<any>(url, payload)
      : this.http.post<any>(url, payload);

    request.subscribe({
      next: () => {
        this.submitting = false;
        this.closeModal();
        this.loadTerms();
      },
      error: (err) => {
        this.submitting = false;
        this.errorMsg =
          err?.error?.message ||
          (this.editingTermId ? 'Failed to update term. Please try again.' : 'Failed to save term. Please try again.');
      },
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
