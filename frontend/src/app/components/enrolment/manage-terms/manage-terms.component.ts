import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface TermRow {
  id: string;
  type?: string;
  label?: string;
  term?: string;
  termNumber?: number | string;
  periodType?: string;
  year: number | string;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive' | 'upcoming';
}

@Component({
  selector: 'app-manage-terms',
  templateUrl: './manage-terms.component.html',
  styleUrls: ['./manage-terms.component.css']
})
export class ManageTermsComponent implements OnInit {
  terms: TermRow[] = [];
  filteredTerms: TermRow[] = [];
  loading = false;
  error = '';
  success = '';

  selectedYear: string = 'all';
  availableYears: (number | string)[] = [];

  // Add/edit modal
  showFormModal = false;
  editingTermId: string | null = null;
  saving = false;
  formError = '';
  formData: any = {
    termNumber: 1,
    periodType: 'regular',
    year: new Date().getFullYear(),
    startDate: '',
    endDate: '',
    status: 'upcoming'
  };

  readonly termNumbers = [1, 2, 3, 4];
  readonly periodTypes = [
    { value: 'regular', label: 'Regular' },
    { value: 'vacation', label: 'Vacation School' },
    { value: 'short', label: 'Short Course' }
  ];
  readonly statusOptions: TermRow['status'][] = ['active', 'inactive', 'upcoming'];
  readonly yearOptions = (() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1, cur + 2];
  })();

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadTerms();
  }

  loadTerms(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        const list: TermRow[] = Array.isArray(data) ? data : data?.data || [];
        this.terms = list;
        const years: (string | number)[] = Array.from(
          new Set(list.map((t) => t.year))
        ) as (string | number)[];
        this.availableYears = years.sort((a, b) => Number(b) - Number(a));
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.terms = [];
        this.filteredTerms = [];
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load terms';
      }
    });
  }

  applyFilters(): void {
    let list = [...this.terms];
    if (this.selectedYear !== 'all') {
      list = list.filter((t) => String(t.year) === this.selectedYear);
    }
    this.filteredTerms = list;
  }

  onYearChange(): void {
    this.applyFilters();
  }

  refresh(): void {
    this.loadTerms();
  }

  getDuration(start: string, end: string): string {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isNaN(days) || days < 0) return '—';
    const weeks = Math.floor(days / 7);
    const remain = days % 7;
    return weeks > 0 ? `${weeks}w ${remain}d` : `${days}d`;
  }

  typeShort(t: TermRow): string {
    const v = (t.periodType || t.type || 'regular').toString();
    if (v.toLowerCase() === 'regular') return 'Reg';
    if (v.toLowerCase() === 'vacation') return 'Vac';
    if (v.toLowerCase() === 'short') return 'Sho';
    return v.slice(0, 3);
  }

  labelShort(t: TermRow): string {
    const v = (t.label || t.term || '').toString();
    return v ? (v.length > 4 ? `${v.substring(0, 4)}.` : v) : '—';
  }

  termName(t: TermRow): string {
    const n = t.termNumber ?? t.term;
    if (!n) return '—';
    return /^\d/.test(String(n)) ? `Term ${n}` : String(n);
  }

  openAddTerm(): void {
    this.editingTermId = null;
    this.formData = {
      termNumber: 1,
      periodType: 'regular',
      year: new Date().getFullYear(),
      startDate: '',
      endDate: '',
      status: 'upcoming'
    };
    this.formError = '';
    this.showFormModal = true;
  }

  openEditTerm(t: TermRow): void {
    if (!t?.id) return;
    this.editingTermId = t.id;
    this.formData = {
      termNumber: t.termNumber || 1,
      periodType: t.periodType || t.type || 'regular',
      year: t.year || new Date().getFullYear(),
      startDate: t.startDate ? t.startDate.split('T')[0] : '',
      endDate: t.endDate ? t.endDate.split('T')[0] : '',
      status: t.status || 'upcoming'
    };
    this.formError = '';
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.editingTermId = null;
    this.formError = '';
    this.saving = false;
  }

  saveTerm(): void {
    if (
      !this.formData.termNumber ||
      !this.formData.year ||
      !this.formData.startDate ||
      !this.formData.endDate
    ) {
      this.formError = 'Please fill in all required fields.';
      return;
    }
    this.saving = true;
    this.formError = '';

    const payload = { ...this.formData };
    const url = `${environment.apiUrl}/settings/terms${this.editingTermId ? '/' + this.editingTermId : ''}`;
    const req = this.editingTermId
      ? this.http.put<any>(url, payload)
      : this.http.post<any>(url, payload);

    req.subscribe({
      next: () => {
        this.saving = false;
        this.success = this.editingTermId ? 'Term updated' : 'Term created';
        setTimeout(() => (this.success = ''), 3000);
        this.closeFormModal();
        this.loadTerms();
      },
      error: (err) => {
        this.saving = false;
        this.formError = err?.error?.message || 'Failed to save term.';
      }
    });
  }

  deleteTerm(t: TermRow): void {
    if (!t?.id) return;
    if (!confirm(`Delete this term?`)) return;
    this.http.delete(`${environment.apiUrl}/settings/terms/${t.id}`).subscribe({
      next: () => {
        this.success = 'Term deleted';
        setTimeout(() => (this.success = ''), 3000);
        this.loadTerms();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to delete term';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }
}
