import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { TimetableService, TimetableConfig } from '../../../services/timetable.service';
import { SubjectService } from '../../../services/subject.service';

const DEFAULT_LESSONS = 3;
const MAX_LESSONS_CAP = 40;

@Component({
  selector: 'app-subject-periods',
  templateUrl: './subject-periods.component.html',
  styleUrls: ['./subject-periods.component.css'],
})
export class SubjectPeriodsComponent implements OnInit {
  /** Full config from API — merged back on save so other settings are preserved. */
  private configBase: TimetableConfig | null = null;
  /** subjectId -> periods per week (timetable generator uses this). */
  lessonsPerWeek: Record<string, number> = {};
  subjects: any[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  constructor(
    private timetableService: TimetableService,
    private subjectService: SubjectService
  ) {}

  ngOnInit(): void {
    this.loadTeachingLoad();
  }

  loadTeachingLoad(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      config: this.timetableService.getConfig(),
      subjects: this.subjectService.getSubjects({ limit: 500 }),
    }).subscribe({
      next: ({ config, subjects }) => {
        this.configBase = { ...config };
        const raw = config.lessonsPerWeek || {};
        this.lessonsPerWeek = { ...raw };
        const subjList = Array.isArray(subjects) ? subjects : subjects?.data || [];
        this.subjects = subjList
          .filter((s: any) => s.isActive !== false)
          .sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
          );
        for (const s of this.subjects) {
          const id = s.id;
          if (this.lessonsPerWeek[id] == null || this.lessonsPerWeek[id] < 0) {
            this.lessonsPerWeek[id] = DEFAULT_LESSONS;
          }
        }
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load teaching load data';
        this.loading = false;
      },
    });
  }

  maxLessonsForRow(): number {
    const days = this.configBase?.daysOfWeek?.length || 5;
    const periods = this.configBase?.periodsPerDay || 8;
    return Math.min(MAX_LESSONS_CAP, Math.max(periods, days * periods));
  }

  loadFor(subjectId: string): number {
    const v = this.lessonsPerWeek[subjectId];
    return typeof v === 'number' && !Number.isNaN(v) ? v : DEFAULT_LESSONS;
  }

  increment(subjectId: string): void {
    const max = this.maxLessonsForRow();
    const next = Math.min(max, this.loadFor(subjectId) + 1);
    this.lessonsPerWeek = { ...this.lessonsPerWeek, [subjectId]: next };
  }

  decrement(subjectId: string): void {
    const next = Math.max(0, this.loadFor(subjectId) - 1);
    this.lessonsPerWeek = { ...this.lessonsPerWeek, [subjectId]: next };
  }

  saveTeachingLoad(): void {
    if (!this.configBase) {
      this.error = 'Configuration not loaded.';
      return;
    }
    this.saving = true;
    this.error = null;
    this.success = null;
    const payload: TimetableConfig = {
      ...this.configBase,
      breakPeriods: this.configBase.breakPeriods || [],
      daysOfWeek: this.configBase.daysOfWeek || [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ],
      lessonsPerWeek: { ...this.lessonsPerWeek },
      additionalPreferences: this.configBase.additionalPreferences || {},
    };
    this.timetableService.saveConfig(payload).subscribe({
      next: (res) => {
        if (res?.config) {
          this.configBase = { ...res.config };
        }
        this.success = 'Teaching load saved. Regenerate the timetable for changes to apply to new schedules.';
        this.saving = false;
        setTimeout(() => (this.success = null), 5000);
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to save teaching load';
        this.saving = false;
      },
    });
  }

  trackBySubjectId(_i: number, s: any): string {
    return s.id;
  }
}
