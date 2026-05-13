import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

export interface GradeBandRow {
  minPercent: number;
  label: string;
}

@Component({
  selector: 'app-academic-grading',
  templateUrl: './academic-grading.component.html',
  styleUrls: ['./academic-grading.component.css']
})
export class AcademicGradingComponent implements OnInit {
  loading = false;
  saving = false;
  error = '';
  success = '';

  /** Full settings row from API — merged on save so other fields stay intact */
  private allSettings: Record<string, unknown> = {};

  gradeBands: GradeBandRow[] = [];
  failLabel = 'UNCLASSIFIED';

  readonly bandAccents = ['#0d9488', '#2563eb', '#ca8a04', '#ea580c', '#64748b', '#8b5cf6', '#db2777'];

  constructor(
    private settingsService: SettingsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  isDemoUser(): boolean {
    return this.authService.getCurrentUser()?.isDemo === true;
  }

  canEditGrading(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  accentAt(index: number): string {
    return this.bandAccents[index % this.bandAccents.length];
  }

  sortBands(): void {
    this.gradeBands.sort((a, b) => b.minPercent - a.minPercent);
  }

  bandTitle(i: number): string {
    return i === 0 ? `Band ${i + 1} — highest` : `Band ${i + 1}`;
  }

  rangeHint(i: number): string {
    const v = Number(this.gradeBands[i]?.minPercent);
    if (!Number.isFinite(v)) return '';
    if (i === 0) return `${v}% – 100%`;
    const hi = Number(this.gradeBands[i - 1].minPercent);
    const top = Number.isFinite(hi) ? hi - 1 : '—';
    return `${v}% – ${top}%`;
  }

  addBand(): void {
    this.sortBands();
    const last = this.gradeBands[this.gradeBands.length - 1];
    if (last && last.minPercent <= 0) {
      this.error =
        'The lowest band is already at 0%. Lower another boundary or remove a band before adding one below.';
      setTimeout(() => (this.error = ''), 7000);
      return;
    }
    const nextMin = last ? Math.max(0, last.minPercent - 1) : 70;
    this.gradeBands.push({ minPercent: nextMin, label: 'New band' });
    this.sortBands();
  }

  removeBand(band: GradeBandRow): void {
    if (this.gradeBands.length <= 1) {
      this.error = 'At least one pass band is required.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const ix = this.gradeBands.indexOf(band);
    if (ix >= 0) {
      this.gradeBands.splice(ix, 1);
    }
    this.sortBands();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.allSettings = row && typeof row === 'object' ? { ...row } : {};

        const rawBands = row?.gradeBands;
        if (Array.isArray(rawBands) && rawBands.length > 0) {
          this.gradeBands = rawBands.map((r: any) => ({
            minPercent: Math.round(Number(r?.minPercent)),
            label: String(r?.label ?? '').trim() || '—',
          }));
        } else {
          const th = (row?.gradeThresholds || {}) as Partial<
            Record<
              'veryGood' | 'good' | 'satisfactory' | 'needsImprovement' | 'basic',
              number
            >
          >;
          const gl = (row?.gradeLabels || {}) as Partial<
            Record<
              'veryGood' | 'good' | 'satisfactory' | 'needsImprovement' | 'basic',
              string
            >
          >;
          this.gradeBands = [
            { minPercent: Number(th.veryGood ?? 80), label: gl.veryGood || 'VERY HIGH' },
            { minPercent: Number(th.good ?? 60), label: gl.good || 'HIGH' },
            {
              minPercent: Number(th.satisfactory ?? 40),
              label: gl.satisfactory || 'GOOD',
            },
            {
              minPercent: Number(th.needsImprovement ?? 20),
              label: gl.needsImprovement || 'ASPIRING',
            },
            { minPercent: Number(th.basic ?? 1), label: gl.basic || 'BASIC' },
          ];
        }

        this.failLabel = (row?.gradeLabels?.fail as string) || 'UNCLASSIFIED';
        this.sortBands();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load grading settings.';
        this.loading = false;
      },
    });
  }

  onBandFieldChange(): void {
    this.sortBands();
  }

  private validate(): string | null {
    const sorted = [...this.gradeBands].sort((a, b) => b.minPercent - a.minPercent);
    if (sorted.length === 0) {
      return 'Add at least one grade band.';
    }
    for (let i = 0; i < sorted.length; i++) {
      const min = Number(sorted[i].minPercent);
      if (!Number.isFinite(min) || min < 0 || min > 100) {
        return 'Each minimum % must be between 0 and 100.';
      }
      const lbl = (sorted[i].label || '').trim();
      if (!lbl) {
        return 'Each band needs a remark/label.';
      }
      if (lbl.length > 80) {
        return 'Each label must be at most 80 characters.';
      }
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].minPercent <= sorted[i + 1].minPercent) {
        return 'Minimum percentages must be strictly higher for each band above the next (no ties).';
      }
    }
    return null;
  }

  save(): void {
    if (this.isDemoUser()) {
      this.error = 'Demo accounts cannot change grading settings.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (!this.canEditGrading()) {
      this.error = 'Only administrators can save grading boundaries.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.sortBands();
    const err = this.validate();
    if (err) {
      this.error = err;
      setTimeout(() => (this.error = ''), 6000);
      return;
    }

    const prevGl = (this.allSettings['gradeLabels'] || {}) as Record<string, string>;

    const gradeBandsPayload = this.gradeBands.map((b) => ({
      minPercent: Math.round(Number(b.minPercent)),
      label: String(b.label).trim(),
    }));

    const gradeLabels = {
      ...prevGl,
      fail: this.failLabel.trim(),
    };

    // Only send the fields this screen owns. The backend merges field-by-field,
    // so we avoid sending unrelated nullable fields (feesSettings, moduleAccess,
    // etc.) that this screen never edits.
    const payload = {
      gradeBands: gradeBandsPayload,
      gradeLabels,
    };

    this.saving = true;
    this.error = '';
    this.success = '';
    this.settingsService.updateSettings(payload).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Grade boundaries and remarks saved.';
        this.allSettings = { ...this.allSettings, ...payload };
        setTimeout(() => (this.success = ''), 5000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (e: any) => {
        this.saving = false;
        this.error =
          e?.error?.message || 'Could not save grading settings. Try again.';
        setTimeout(() => (this.error = ''), 6000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }
}
