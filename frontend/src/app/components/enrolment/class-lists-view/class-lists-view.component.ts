import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';

interface Term {
  id: string;
  term?: string;
  label?: string;
  termNumber?: number | string;
  year: number | string;
  status?: string;
}

interface ClassRow {
  id: string;
  name: string;
}

@Component({
  selector: 'app-class-lists-view',
  templateUrl: './class-lists-view.component.html',
  styleUrls: ['./class-lists-view.component.css']
})
export class ClassListsViewComponent implements OnInit {
  terms: Term[] = [];
  classes: ClassRow[] = [];
  selectedTermId = '';
  selectedClassId = '';

  loadingTerms = false;
  loadingClasses = false;
  loadingList = false;
  downloadingPdf = false;
  error = '';
  success = '';

  students: any[] = [];
  hasFetched = false;

  constructor(
    private http: HttpClient,
    private classService: ClassService,
    private studentService: StudentService
  ) {}

  ngOnInit(): void {
    this.loadTerms();
    this.loadClasses();
  }

  loadTerms(): void {
    this.loadingTerms = true;
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.terms = list;
        this.loadingTerms = false;
        const active = list.find((t: any) => t.status === 'active');
        if (active) this.selectedTermId = active.id;
      },
      error: () => {
        this.terms = [];
        this.loadingTerms = false;
      }
    });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const active = list.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(active);
        this.loadingClasses = false;
      },
      error: () => {
        this.classes = [];
        this.loadingClasses = false;
      }
    });
  }

  termLabel(t: Term): string {
    const n = t.termNumber ?? t.term;
    if (n && t.year) return `Term ${n} (${t.year})`;
    return t.label || t.term || 'Term';
  }

  canSubmit(): boolean {
    return !!this.selectedClassId && !this.loadingList;
  }

  canDownload(): boolean {
    return !!this.selectedClassId && this.hasFetched && this.students.length > 0 && !this.downloadingPdf;
  }

  fetchList(): void {
    if (!this.selectedClassId) {
      this.error = 'Please select a class.';
      setTimeout(() => (this.error = ''), 3500);
      return;
    }
    this.loadingList = true;
    this.error = '';
    this.hasFetched = true;
    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.students = list;
        this.loadingList = false;
      },
      error: (err: any) => {
        this.students = [];
        this.loadingList = false;
        this.error = err?.error?.message || 'Failed to fetch class list';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  downloadPdf(): void {
    if (!this.selectedClassId) return;
    const selectedTerm = this.terms.find((t) => t.id === this.selectedTermId);
    const termLabel = selectedTerm
      ? `Term ${selectedTerm.termNumber ?? selectedTerm.term ?? ''}`.trim()
      : '';
    this.downloadingPdf = true;
    this.studentService.downloadClassListPDF(this.selectedClassId, termLabel).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const className =
          this.classes.find((c) => c.id === this.selectedClassId)?.name || 'class';
        a.href = url;
        a.download = `class-list-${className}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        this.downloadingPdf = false;
      },
      error: (err: any) => {
        this.downloadingPdf = false;
        this.error = err?.error?.message || 'Failed to download class list PDF';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  selectedClassName(): string {
    const c = this.classes.find((x) => x.id === this.selectedClassId);
    return c?.name || '';
  }

  selectedTermName(): string {
    const t = this.terms.find((x) => x.id === this.selectedTermId);
    return t ? this.termLabel(t) : '';
  }
}
