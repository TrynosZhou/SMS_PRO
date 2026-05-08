import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export type ReleaseStatus = 'released' | 'scheduled' | 'pending' | 'draft';

export interface ReportRelease {
  id: string;
  term: string;
  year: number;
  examType: string;
  status: ReleaseStatus;
  releasedDate: string | null;
  scheduledRelease: string | null;
  releasedBy: string | null;
}

@Component({
  selector: 'app-academic-report-releases',
  templateUrl: './academic-report-releases.component.html',
  styleUrls: ['./academic-report-releases.component.css']
})
export class AcademicReportReleasesComponent implements OnInit {
  releases: ReportRelease[] = [];
  filteredReleases: ReportRelease[] = [];
  loading = false;
  actionMsg = '';
  actionError = '';

  // ── Filter ────────────────────────────────────────
  filterStatus = '';
  filterExamType = '';
  filterYear = '';
  availableYears: number[] = [];

  // ── Selection (bulk) ──────────────────────────────
  selectedIds: Set<string> = new Set();

  // ── Manual Generate modal ─────────────────────────
  showManualModal = false;
  manualSubmitting = false;
  manualSubmitted = false;
  manualError = '';
  manualForm = { term: '', year: '', examType: 'end_term', status: 'pending', scheduledRelease: '' };

  // ── Edit modal ────────────────────────────────────
  showEditModal = false;
  editSubmitting = false;
  editSubmitted = false;
  editError = '';
  editForm: ReportRelease & { scheduledReleaseInput: string } = {
    id: '', term: '', year: 0, examType: '', status: 'pending',
    releasedDate: null, scheduledRelease: null, releasedBy: null, scheduledReleaseInput: ''
  };

  // ── Bulk Update modal ─────────────────────────────
  showBulkModal = false;
  bulkSubmitting = false;
  bulkError = '';
  bulkForm = { status: '', scheduledRelease: '' };

  readonly statusOptions: ReleaseStatus[] = ['pending', 'draft', 'scheduled', 'released'];
  readonly examTypeOptions = ['mid_term', 'end_term', 'assignment', 'quiz'];
  readonly termOptions = ['Term 1', 'Term 2', 'Term 3', 'Term 4'];

  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadReleases(); }

  // ── Load ──────────────────────────────────────────
  loadReleases() {
    this.loading = true;
    this.clearFeedback();
    this.http.get<ReportRelease[]>(`${this.api}/report-releases`).subscribe({
      next: (data) => {
        this.releases = Array.isArray(data) ? data : (data as any)?.data || [];
        this.buildYears();
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.releases = []; this.filteredReleases = []; this.loading = false; }
    });
  }

  buildYears() {
    this.availableYears = [...new Set(this.releases.map(r => r.year))].sort((a, b) => b - a);
  }

  applyFilter() {
    this.filteredReleases = this.releases.filter(r => {
      if (this.filterStatus && r.status !== this.filterStatus) return false;
      if (this.filterExamType && r.examType !== this.filterExamType) return false;
      if (this.filterYear && String(r.year) !== this.filterYear) return false;
      return true;
    });
    // Remove stale selections
    this.selectedIds.forEach(id => { if (!this.filteredReleases.find(r => r.id === id)) this.selectedIds.delete(id); });
  }

  clearFilters() { this.filterStatus = ''; this.filterExamType = ''; this.filterYear = ''; this.applyFilter(); }

  // ── Toolbar actions ───────────────────────────────
  generateFromTerms() {
    this.clearFeedback();
    this.http.post<any>(`${this.api}/report-releases/generate-from-terms`, {}).subscribe({
      next: (res) => { this.actionMsg = res?.message || 'Sessions generated.'; this.loadReleases(); },
      error: (err) => { this.actionError = err?.error?.message || 'Failed to generate from terms.'; }
    });
  }

  processScheduled() {
    this.clearFeedback();
    this.http.post<any>(`${this.api}/report-releases/process-scheduled`, {}).subscribe({
      next: (res) => { this.actionMsg = res?.message || 'Scheduled releases processed.'; this.loadReleases(); },
      error: (err) => { this.actionError = err?.error?.message || 'Failed to process scheduled releases.'; }
    });
  }

  exportCsv() {
    if (!this.filteredReleases.length) { this.actionMsg = 'No data to export.'; return; }
    const headers = ['Term', 'Year', 'Exam Type', 'Status', 'Released Date', 'Scheduled Release', 'Released By'];
    const rows = this.filteredReleases.map(r => [
      r.term, r.year, r.examType, r.status,
      r.releasedDate || '', r.scheduledRelease || '', r.releasedBy || ''
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'report-releases.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Manual Generate modal ─────────────────────────
  openManualModal() {
    this.manualForm = { term: 'Term 1', year: String(new Date().getFullYear()), examType: 'end_term', status: 'pending', scheduledRelease: '' };
    this.manualSubmitted = false;
    this.manualError = '';
    this.showManualModal = true;
  }
  closeManualModal() { this.showManualModal = false; }

  saveManual() {
    this.manualSubmitted = true;
    if (!this.manualForm.term || !this.manualForm.year || !this.manualForm.examType) {
      this.manualError = 'Term, Year and Exam Type are required.'; return;
    }
    this.manualSubmitting = true; this.manualError = '';
    const payload: any = {
      term: this.manualForm.term,
      year: Number(this.manualForm.year),
      examType: this.manualForm.examType,
      status: this.manualForm.status,
    };
    if (this.manualForm.scheduledRelease) payload.scheduledRelease = this.manualForm.scheduledRelease;
    this.http.post<any>(`${this.api}/report-releases`, payload).subscribe({
      next: () => { this.manualSubmitting = false; this.closeManualModal(); this.loadReleases(); this.actionMsg = 'Session created successfully.'; },
      error: (err) => { this.manualSubmitting = false; this.manualError = err?.error?.message || 'Failed to create session.'; }
    });
  }

  // ── Edit modal ────────────────────────────────────
  openEdit(r: ReportRelease) {
    this.editForm = {
      ...r,
      scheduledReleaseInput: r.scheduledRelease ? r.scheduledRelease.substring(0, 16) : ''
    };
    this.editSubmitted = false; this.editError = ''; this.showEditModal = true;
  }
  closeEdit() { this.showEditModal = false; }

  saveEdit() {
    this.editSubmitted = true;
    if (!this.editForm.term || !this.editForm.year || !this.editForm.examType) {
      this.editError = 'Term, Year and Exam Type are required.'; return;
    }
    this.editSubmitting = true; this.editError = '';
    const { id, scheduledReleaseInput, ...rest } = this.editForm;
    const payload = { ...rest, scheduledRelease: scheduledReleaseInput || null };
    this.http.put<any>(`${this.api}/report-releases/${id}`, payload).subscribe({
      next: () => { this.editSubmitting = false; this.closeEdit(); this.loadReleases(); this.actionMsg = 'Release updated successfully.'; },
      error: (err) => { this.editSubmitting = false; this.editError = err?.error?.message || 'Failed to update.'; }
    });
  }

  // ── Delete ────────────────────────────────────────
  deleteRelease(r: ReportRelease) {
    if (!confirm(`Delete release "${r.term} ${r.year} – ${r.examType}"?`)) return;
    this.http.delete(`${this.api}/report-releases/${r.id}`).subscribe({
      next: () => { this.loadReleases(); this.actionMsg = 'Release deleted.'; },
      error: (err: any) => { this.actionError = err?.error?.message || 'Failed to delete.'; }
    });
  }

  // ── Bulk Update modal ─────────────────────────────
  openBulkModal() {
    if (!this.selectedIds.size) { this.actionMsg = 'Select at least one row to bulk-update.'; return; }
    this.bulkForm = { status: '', scheduledRelease: '' };
    this.bulkError = '';
    this.showBulkModal = true;
  }
  closeBulkModal() { this.showBulkModal = false; }

  saveBulk() {
    if (!this.bulkForm.status && !this.bulkForm.scheduledRelease) {
      this.bulkError = 'Set at least one field to update.'; return;
    }
    this.bulkSubmitting = true; this.bulkError = '';
    const payload: any = { ids: [...this.selectedIds] };
    if (this.bulkForm.status) payload.status = this.bulkForm.status;
    if (this.bulkForm.scheduledRelease) payload.scheduledRelease = this.bulkForm.scheduledRelease;
    this.http.post<any>(`${this.api}/report-releases/bulk-update`, payload).subscribe({
      next: (res) => { this.bulkSubmitting = false; this.closeBulkModal(); this.selectedIds.clear(); this.loadReleases(); this.actionMsg = res?.message || 'Bulk update applied.'; },
      error: (err) => { this.bulkSubmitting = false; this.bulkError = err?.error?.message || 'Bulk update failed.'; }
    });
  }

  // ── Selection helpers ─────────────────────────────
  toggleSelect(id: string) {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
  }
  toggleAll(checked: boolean) {
    if (checked) this.filteredReleases.forEach(r => this.selectedIds.add(r.id));
    else this.selectedIds.clear();
  }
  get allSelected(): boolean {
    return this.filteredReleases.length > 0 && this.filteredReleases.every(r => this.selectedIds.has(r.id));
  }

  // ── Helpers ───────────────────────────────────────
  clearFeedback() { this.actionMsg = ''; this.actionError = ''; }

  statusClass(s: ReleaseStatus): string {
    return ({ released: 'badge-released', scheduled: 'badge-scheduled', pending: 'badge-pending', draft: 'badge-draft' } as any)[s] || '';
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fmtExamType(t: string): string {
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
