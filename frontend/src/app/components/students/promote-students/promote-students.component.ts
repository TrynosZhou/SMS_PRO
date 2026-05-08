import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { PromotionRuleService } from '../../../services/promotion-rule.service';
import { SettingsService } from '../../../services/settings.service';

interface PreviewRow {
  ruleId: string;
  fromClassId: string;
  fromClassName: string;
  toClassId: string | null;
  toClassName: string | null;
  isFinalClass: boolean;
  studentCount: number;
}

interface PromoteResult {
  fromClass: string;
  toClass: string | null;
  promoted: number;
  skipped: boolean;
}

@Component({
  selector: 'app-promote-students',
  templateUrl: './promote-students.component.html',
  styleUrls: ['./promote-students.component.css'],
})
export class PromoteStudentsComponent implements OnInit {
  // Settings / context
  academicYear = '';
  currentTerm = '';

  // Preview
  preview: PreviewRow[] = [];
  loadingPreview = false;
  previewError = '';

  // Promote state
  promoting = false;
  confirmVisible = false;
  promoteSingle: PreviewRow | null = null; // null = promote all

  // Results
  results: PromoteResult[] | null = null;
  resultMessage = '';
  resultError = '';

  constructor(
    private studentService: StudentService,
    private promotionRuleService: PromotionRuleService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadPreview();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.academicYear = row?.academicYear || '';
        this.currentTerm = row?.currentTerm || row?.activeTerm || '';
      },
    });
  }

  loadPreview(): void {
    this.loadingPreview = true;
    this.previewError = '';
    this.studentService.getPromotePreview().subscribe({
      next: rows => {
        this.preview = rows;
        this.loadingPreview = false;
      },
      error: err => {
        this.previewError = err?.error?.message || 'Failed to load promotion preview.';
        this.loadingPreview = false;
      },
    });
  }

  get totalStudentsToMove(): number {
    return this.preview.filter(r => !r.isFinalClass && r.toClassId).reduce((s, r) => s + r.studentCount, 0);
  }

  get actionableRules(): PreviewRow[] {
    return this.preview.filter(r => !r.isFinalClass && r.toClassId && r.studentCount > 0);
  }

  requestPromoteAll(): void {
    this.promoteSingle = null;
    this.confirmVisible = true;
  }

  requestPromoteSingle(row: PreviewRow): void {
    this.promoteSingle = row;
    this.confirmVisible = true;
  }

  cancelConfirm(): void {
    this.confirmVisible = false;
    this.promoteSingle = null;
  }

  confirmPromote(): void {
    this.confirmVisible = false;
    this.results = null;
    this.resultError = '';
    this.promoting = true;

    if (this.promoteSingle) {
      const row = this.promoteSingle;
      this.studentService.promoteStudents(row.fromClassId, row.toClassId!).subscribe({
        next: res => {
          this.resultMessage = res.message;
          this.results = [{ fromClass: res.fromClass, toClass: res.toClass, promoted: res.promotedCount, skipped: false }];
          this.promoting = false;
          this.promoteSingle = null;
          this.loadPreview();
        },
        error: err => {
          this.resultError = err?.error?.message || 'Promotion failed.';
          this.promoting = false;
          this.promoteSingle = null;
        },
      });
    } else {
      this.studentService.promoteAllStudents().subscribe({
        next: res => {
          this.resultMessage = res.message;
          this.results = res.results;
          this.promoting = false;
          this.loadPreview();
        },
        error: err => {
          this.resultError = err?.error?.message || 'Promotion failed.';
          this.promoting = false;
        },
      });
    }
  }

  dismissResult(): void {
    this.results = null;
    this.resultMessage = '';
    this.resultError = '';
  }
}
