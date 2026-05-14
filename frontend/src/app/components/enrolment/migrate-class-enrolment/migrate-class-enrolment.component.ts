import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ClassService } from '../../../services/class.service';
import { EnrollmentService } from '../../../services/enrollment.service';

interface Term {
  id: string;
  termNumber?: number | string;
  year: number | string;
  label?: string;
  status?: string;
}

interface ClassRow {
  id: string;
  name: string;
}

@Component({
  selector: 'app-migrate-class-enrolment',
  templateUrl: './migrate-class-enrolment.component.html',
  styleUrls: ['./migrate-class-enrolment.component.css'],
})
export class MigrateClassEnrolmentComponent implements OnInit {
  terms: Term[] = [];
  classes: ClassRow[] = [];

  sourceClassId = '';
  sourceTermId = '';
  destClassId = '';
  destTermId = '';

  previewCount: number | null = null;
  previewLoading = false;
  migrating = false;
  error = '';
  success = '';

  constructor(
    private http: HttpClient,
    private classService: ClassService,
    private enrollmentService: EnrollmentService
  ) {}

  ngOnInit(): void {
    this.loadTerms();
    this.loadClasses();
  }

  loadTerms(): void {
    this.http.get<any>(`${environment.apiUrl}/settings/terms`).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.terms = list;
        const active = list.find((t: any) => t.status === 'active');
        if (active) {
          this.sourceTermId = active.id;
          this.destTermId = active.id;
        }
      },
      error: () => (this.terms = []),
    });
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const active = list.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(active);
      },
      error: () => (this.classes = []),
    });
  }

  termLabel(t: Term): string {
    const n = t.termNumber ?? (t as any).term;
    if (n != null && n !== '' && t.year != null) return `Term ${n} (${t.year})`;
    return t.label || `Term (${t.year})`;
  }

  get canMigrate(): boolean {
    return (
      !!String(this.sourceClassId || '').trim() &&
      !!String(this.sourceTermId || '').trim() &&
      !!String(this.destClassId || '').trim() &&
      !!String(this.destTermId || '').trim() &&
      this.sourceClassId !== this.destClassId
    );
  }

  get disableMigrateBtn(): boolean {
    if (!this.canMigrate || this.migrating || this.previewLoading) return true;
    if (this.previewCount === null) return false;
    return this.previewCount === 0;
  }

  refreshPreview(): void {
    const id = String(this.sourceClassId || '').trim();
    if (!id) {
      this.previewCount = null;
      return;
    }
    this.previewLoading = true;
    this.enrollmentService.getMigrateClassPreview(id).subscribe({
      next: (r) => {
        this.previewCount = typeof r?.count === 'number' ? r.count : 0;
        this.previewLoading = false;
      },
      error: () => {
        this.previewCount = null;
        this.previewLoading = false;
      },
    });
  }

  reset(): void {
    this.sourceClassId = '';
    this.destClassId = '';
    this.previewCount = null;
    this.error = '';
    this.success = '';
    const active = this.terms.find((t: any) => t.status === 'active');
    if (active) {
      this.sourceTermId = active.id;
      this.destTermId = active.id;
    } else {
      this.sourceTermId = '';
      this.destTermId = '';
    }
  }

  migrate(): void {
    if (!this.canMigrate || this.migrating) return;
    if (this.previewCount !== null && this.previewCount === 0) {
      this.error = 'There are no students on the source class to migrate.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const n = this.previewCount;
    const msg =
      n === null || n === undefined
        ? 'Move all students from the source class to the destination class? This updates enrolments and cannot be undone automatically.'
        : `Move ${n} student(s) from the source class to the destination class? This updates enrolments and cannot be undone automatically.`;
    if (!confirm(msg)) {
      return;
    }
    this.migrating = true;
    this.error = '';
    this.success = '';
    this.enrollmentService
      .migrateClassEnrolments({
        fromClassId: this.sourceClassId,
        toClassId: this.destClassId,
        fromTermId: this.sourceTermId,
        toTermId: this.destTermId,
      })
      .subscribe({
        next: (res: any) => {
          this.migrating = false;
          this.success = res?.message || 'Migration completed.';
          if (Array.isArray(res?.errors) && res.errors.length) {
            this.error = res.errors.slice(0, 5).join(' ');
          }
          this.refreshPreview();
          setTimeout(() => (this.success = ''), 8000);
        },
        error: (err: any) => {
          this.migrating = false;
          this.error = err?.error?.message || 'Migration failed.';
          setTimeout(() => (this.error = ''), 8000);
        },
      });
  }
}
