import { Component, OnInit } from '@angular/core';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-academic-subjects',
  templateUrl: './academic-subjects.component.html',
  styleUrls: ['./academic-subjects.component.css']
})
export class AcademicSubjectsComponent implements OnInit {
  subjects: any[] = [];
  filteredSubjects: any[] = [];
  searchQuery = '';
  loading = false;

  // Add modal
  showAddModal = false;
  submitting = false;
  submitted = false;
  errorMsg = '';
  newSubject = { name: '', code: '', description: '' };

  // Edit modal
  showEditModal = false;
  editSubmitting = false;
  editSubmitted = false;
  editErrorMsg = '';
  editSubject = { id: '', name: '', code: '', description: '' };

  constructor(private subjectService: SubjectService) {}

  ngOnInit() { this.loadSubjects(); }

  loadSubjects() {
    this.loading = true;
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = Array.isArray(data) ? data : data?.data || [];
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.subjects = []; this.filteredSubjects = []; this.loading = false; }
    });
  }

  applyFilter() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredSubjects = q
      ? this.subjects.filter(s => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q))
      : [...this.subjects];
  }

  // ── Add ──────────────────────────────────────────
  openAddModal() {
    this.newSubject = { name: '', code: '', description: '' };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  closeAddModal() { this.showAddModal = false; this.errorMsg = ''; }

  saveSubject() {
    this.submitted = true;
    if (!this.newSubject.name) { this.errorMsg = 'Subject name is required.'; return; }
    this.submitting = true;
    this.errorMsg = '';
    this.subjectService.createSubject(this.newSubject).subscribe({
      next: () => { this.submitting = false; this.closeAddModal(); this.loadSubjects(); },
      error: (err: any) => { this.submitting = false; this.errorMsg = err?.error?.message || 'Failed to save subject.'; }
    });
  }

  // ── Edit ─────────────────────────────────────────
  openEditModal(subject: any) {
    this.editSubject = {
      id:          subject.id,
      name:        subject.name        || '',
      code:        subject.code        || '',
      description: subject.description || ''
    };
    this.editSubmitted = false;
    this.editErrorMsg  = '';
    this.showEditModal  = true;
  }

  closeEditModal() { this.showEditModal = false; this.editErrorMsg = ''; }

  updateSubject() {
    this.editSubmitted = true;
    if (!this.editSubject.name) { this.editErrorMsg = 'Subject name is required.'; return; }
    this.editSubmitting = true;
    this.editErrorMsg   = '';
    const { id, ...payload } = this.editSubject;
    this.subjectService.updateSubject(id, payload).subscribe({
      next: () => { this.editSubmitting = false; this.closeEditModal(); this.loadSubjects(); },
      error: (err: any) => { this.editSubmitting = false; this.editErrorMsg = err?.error?.message || 'Failed to update subject.'; }
    });
  }

  // ── Delete ───────────────────────────────────────
  deleteSubject(id: string, name: string) {
    if (!confirm(`Delete subject "${name}"?`)) return;
    this.subjectService.deleteSubject(id).subscribe({
      next: () => this.loadSubjects(),
      error: (err: any) => alert(err?.error?.message || 'Failed to delete subject.')
    });
  }
}
