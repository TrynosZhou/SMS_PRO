import { Component, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  TimetableService,
  TimetableVersion,
  TimetableSlot,
  TimetableConfig,
} from '../../../services/timetable.service';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';
import { TimetablePreviewBuilderService } from '../timetable-preview-builder.service';
import {
  TimetablePreviewColumn,
  TimetableTeacherPreviewSheet,
  TimetableClassPreviewSheet,
  ClassPreviewDaySegment,
  TimetableConsolidatedPreviewSheet,
} from '../timetable-preview.models';

@Component({
  selector: 'app-timetable-view',
  templateUrl: './timetable-view.component.html',
  styleUrls: ['./timetable-view.component.css']
})
export class TimetableViewComponent implements OnInit, OnDestroy {
  versions: TimetableVersion[] = [];
  selectedVersion: TimetableVersion | null = null;
  slots: TimetableSlot[] = [];
  teachers: any[] = [];
  classes: any[] = [];
  subjects: any[] = [];

  viewMode: 'class' | 'teacher' | 'all' = 'all';
  selectedTeacherId: string = '';
  selectedClassId: string = '';

  daysOfWeek: string[] = [];
  periods: number[] = [];
  timetableGrid: Map<string, TimetableSlot[]> = new Map();

  loading = false;
  /** Version id currently being deleted (disables that row’s Delete control). */
  deletingVersionId: string | null = null;
  generating = false;
  generationProgress = 0;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  private generationProgressInterval: any = null;
  private generationStartedAt = 0;
  /** Minimum time (ms) the generation UI stays visible on success — easier to notice the progress bar. */
  private readonly generationMinVisibleMs = 4000;

  // Generation form
  newVersionName = '';
  newVersionDescription = '';

  // Edit mode
  editingSlot: TimetableSlot | null = null;
  editForm: any = {};

  /** Full-version preview (teachers / classes / summary) */
  previewModalOpen = false;
  previewLoading = false;
  previewError: string | null = null;
  previewVersionLabel = '';
  previewTab: 'teachers' | 'classes' | 'summary' = 'teachers';
  previewTeacherSheets: TimetableTeacherPreviewSheet[] = [];
  previewClassSheets: TimetableClassPreviewSheet[] = [];
  /** Version id used for preview + PDF downloads while the preview modal is open. */
  previewVersionId: string | null = null;
  previewConsolidatedSheet: TimetableConsolidatedPreviewSheet | null = null;

  constructor(
    private timetableService: TimetableService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService,
    private previewBuilder: TimetablePreviewBuilderService
  ) {}

  ngOnInit(): void {
    this.loadVersions();
    this.loadTeachers();
    this.loadClasses();
    this.loadSubjects();
  }

  /**
   * @param preferVersionId After generating, pass the new version id so the full school grid loads (not a filtered view).
   */
  loadVersions(preferVersionId?: string): void {
    this.loading = true;
    this.timetableService.getVersions().subscribe({
      next: (versions) => {
        this.versions = versions;
        if (versions.length > 0) {
          let pick =
            preferVersionId && versions.some((v) => v.id === preferVersionId)
              ? preferVersionId
              : this.selectedVersion && versions.some((v) => v.id === this.selectedVersion!.id)
                ? this.selectedVersion!.id
                : (versions.find((v) => v.isActive) || versions[0]).id;
          this.selectVersion(pick);
        } else {
          this.selectedVersion = null;
          this.slots = [];
          this.timetableGrid.clear();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading versions:', err);
        this.error = 'Failed to load timetable versions';
        this.loading = false;
      }
    });
  }

  loadTeachers(): void {
    this.teacherService.getTeachers().subscribe({
      next: (teachers) => {
        this.teachers = teachers;
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
      }
    });
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (classes) => {
        const classesList = Array.isArray(classes) ? classes : (classes?.data || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  loadSubjects(): void {
    this.subjectService.getSubjects().subscribe({
      next: (subjects) => {
        this.subjects = subjects;
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
      }
    });
  }

  selectVersion(versionId: string): void {
    this.selectedVersion = this.versions.find(v => v.id === versionId) || null;
    if (this.selectedVersion) {
      this.loadSlots();
    }
  }

  loadSlots(): void {
    if (!this.selectedVersion) return;

    this.loading = true;
    const teacherId: string | undefined = (this.viewMode === 'teacher' && this.selectedTeacherId && this.selectedTeacherId !== '') 
      ? this.selectedTeacherId 
      : undefined;
    const classId: string | undefined = (this.viewMode === 'class' && this.selectedClassId && this.selectedClassId !== '') 
      ? this.selectedClassId 
      : undefined;

    this.timetableService.getSlots(this.selectedVersion.id, teacherId, classId).subscribe({
      next: (slots) => {
        this.slots = slots;
        this.buildTimetableGrid();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading slots:', err);
        this.error = 'Failed to load timetable slots';
        this.loading = false;
      }
    });
  }

  buildTimetableGrid(): void {
    this.timetableGrid.clear();
    
    // Extract unique days and periods
    const daysSet = new Set<string>();
    const periodsSet = new Set<number>();
    
    this.slots.forEach(slot => {
      if (!slot.isBreak) {
        daysSet.add(slot.dayOfWeek);
        periodsSet.add(slot.periodNumber);
      }
    });

    const dayRank = (d: string) => {
      const order = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ];
      const i = order.indexOf(d);
      return i >= 0 ? i : 999;
    };
    this.daysOfWeek = Array.from(daysSet).sort((a, b) => dayRank(a) - dayRank(b));
    this.periods = Array.from(periodsSet).sort((a, b) => a - b);

    // Build grid map
    this.slots.forEach(slot => {
      if (!slot.isBreak) {
        const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
        if (!this.timetableGrid.has(key)) {
          this.timetableGrid.set(key, []);
        }
        this.timetableGrid.get(key)!.push(slot);
      }
    });
  }

  getSlot(day: string, period: number): TimetableSlot[] {
    const key = `${day}-${period}`;
    return this.timetableGrid.get(key) || [];
  }

  isSlotBeingEdited(slot: TimetableSlot): boolean {
    return this.editingSlot !== null && this.editingSlot.id === slot.id;
  }

  isCellBeingEdited(day: string, period: number): boolean {
    if (!this.editingSlot) return false;
    const slots = this.getSlot(day, period);
    return slots.some(s => s.id === this.editingSlot!.id);
  }

  isVersionSelected(versionId: string): boolean {
    return this.selectedVersion?.id === versionId;
  }

  ngOnDestroy(): void {
    this.clearGenerationProgressInterval();
  }

  generateTimetable(): void {
    if (!this.newVersionName.trim()) {
      this.error = 'Please enter a version name';
      return;
    }

    this.generating = true;
    this.generationStartedAt = Date.now();
    this.startGenerationProgress();
    this.error = null;
    this.success = null;

    this.timetableService.generateTimetable(this.newVersionName, this.newVersionDescription).subscribe({
      next: (response) => {
        this.success = `Timetable generated successfully! ${response.stats.totalSlots} slots for ${response.stats.teachers} teachers and ${response.stats.classes} classes.`;
        this.newVersionName = '';
        this.newVersionDescription = '';
        this.viewMode = 'all';
        this.selectedTeacherId = '';
        this.selectedClassId = '';
        const newVersionId = response.version?.id;
        this.loadVersions(newVersionId);
        this.finishGenerationProgress(true);
        const elapsed = Date.now() - this.generationStartedAt;
        const waitMore = Math.max(0, this.generationMinVisibleMs - elapsed);
        setTimeout(() => {
          this.generating = false;
          this.generationProgress = 0;
        }, waitMore);
        setTimeout(() => {
          this.success = null;
        }, 5000);
      },
      error: (err) => {
        console.error('Error generating timetable:', err);
        
        // Build detailed error message with diagnostics
        let errorMessage = err.error?.message || 'Failed to generate timetable';
        
        if (err.error?.diagnostics) {
          const diagnostics = err.error.diagnostics;
          errorMessage += '\n\n';
          
          if (diagnostics.issues && diagnostics.issues.length > 0) {
            errorMessage += 'Issues found:\n';
            diagnostics.issues.forEach((issue: string) => {
              errorMessage += `• ${issue}\n`;
            });
            errorMessage += '\n';
          }
          
          if (err.error?.help && err.error.help.length > 0) {
            errorMessage += 'How to fix:\n';
            err.error.help.forEach((help: string) => {
              errorMessage += `${help}\n`;
            });
          }
          
          // Add summary
          if (diagnostics.teachers) {
            const teachersWithoutClasses = diagnostics.teachers.filter((t: any) => t.classesCount === 0).length;
            const teachersWithoutSubjects = diagnostics.teachers.filter((t: any) => t.subjectsCount === 0).length;
            const classesWithoutSubjects = diagnostics.classes.filter((c: any) => c.subjectsCount === 0).length;
            
            errorMessage += '\nSummary:\n';
            if (teachersWithoutClasses > 0) {
              errorMessage += `• ${teachersWithoutClasses} teacher(s) need classes assigned\n`;
            }
            if (teachersWithoutSubjects > 0) {
              errorMessage += `• ${teachersWithoutSubjects} teacher(s) need subjects assigned\n`;
            }
            if (classesWithoutSubjects > 0) {
              errorMessage += `• ${classesWithoutSubjects} class(es) need subjects assigned\n`;
            }
          }
        }
        
        this.error = errorMessage;
        this.finishGenerationProgress(false);
        setTimeout(() => {
          this.generating = false;
          this.generationProgress = 0;
        }, 900);
      }
    });
  }

  private clearGenerationProgressInterval(): void {
    if (this.generationProgressInterval) {
      clearInterval(this.generationProgressInterval);
      this.generationProgressInterval = null;
    }
  }

  private startGenerationProgress(): void {
    // Backend does not stream progress; animate the bar so users see activity for the full request.
    this.clearGenerationProgressInterval();
    let p = 12;
    this.generationProgress = p;

    this.generationProgressInterval = setInterval(() => {
      const step = 2 + Math.floor(Math.random() * 5);
      p = Math.min(88, p + step);
      this.generationProgress = p;
    }, 550);
  }

  private finishGenerationProgress(markComplete: boolean): void {
    this.clearGenerationProgressInterval();

    if (markComplete) {
      this.generationProgress = 100;
    } else {
      this.generationProgress = Math.max(0, this.generationProgress - 25);
    }

    if (!markComplete) {
      setTimeout(() => {
        if (!this.generating) {
          this.generationProgress = 0;
        }
      }, 400);
    }
  }

  activateVersion(versionId: string): void {
    this.timetableService.activateVersion(versionId).subscribe({
      next: () => {
        this.success = 'Timetable version activated successfully';
        this.loadVersions(versionId);
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error activating version:', err);
        this.error = err.error?.message || 'Failed to activate timetable version';
      }
    });
  }

  deleteVersion(version: TimetableVersion): void {
    const label = version.name?.trim() || 'this version';
    if (
      !confirm(
        `Delete timetable version "${label}"? All lessons in this version will be removed. This cannot be undone.`
      )
    ) {
      return;
    }

    this.deletingVersionId = version.id;
    this.timetableService.deleteVersion(version.id).subscribe({
      next: () => {
        this.deletingVersionId = null;
        if (this.previewVersionId === version.id) {
          this.closeTimetablePreview();
        }
        this.success = 'Timetable version deleted';
        this.loadVersions();
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        this.deletingVersionId = null;
        console.error('Error deleting version:', err);
        this.error = err.error?.message || 'Failed to delete timetable version';
      }
    });
  }

  editSlot(slot: TimetableSlot): void {
    this.editingSlot = { ...slot };
    this.editForm = {
      teacherId: slot.teacherId,
      classId: slot.classId,
      subjectId: slot.subjectId,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
      room: slot.room || ''
    };
  }

  cancelEdit(): void {
    this.editingSlot = null;
    this.editForm = {};
  }

  saveSlot(): void {
    if (!this.editingSlot) return;

    this.saving = true;
    this.timetableService.updateSlot(this.editingSlot.id, this.editForm).subscribe({
      next: () => {
        this.success = 'Timetable slot updated successfully';
        this.cancelEdit();
        this.loadSlots();
        this.saving = false;
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error updating slot:', err);
        this.error = err.error?.message || 'Failed to update timetable slot';
        if (err.error?.conflicts) {
          this.error += ' Conflicts detected.';
        }
        this.saving = false;
      }
    });
  }

  deleteSlot(slotId: string): void {
    if (!confirm('Are you sure you want to delete this timetable slot?')) {
      return;
    }

    this.timetableService.deleteSlot(slotId).subscribe({
      next: () => {
        this.success = 'Timetable slot deleted successfully';
        this.loadSlots();
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error deleting slot:', err);
        this.error = 'Failed to delete timetable slot';
      }
    });
  }

  /** Resolves which timetable version to use for PDFs (explicit arg, preview context, or main selection). */
  private resolvePdfVersionId(explicit?: string): string | null {
    return explicit ?? this.previewVersionId ?? this.selectedVersion?.id ?? null;
  }

  downloadTeacherPDF(teacherId: string, versionId?: string): void {
    const vid = this.resolvePdfVersionId(versionId);
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadTeacherTimetablePDF(vid, teacherId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teacher-timetable-${teacherId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = 'Failed to download teacher timetable PDF';
      }
    });
  }

  downloadClassPDF(classId: string, versionId?: string): void {
    const vid = this.resolvePdfVersionId(versionId);
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadClassTimetablePDF(vid, classId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `class-timetable-${classId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = 'Failed to download class timetable PDF';
      }
    });
  }

  downloadConsolidatedPDF(versionId?: string): void {
    const targetVersionId = this.resolvePdfVersionId(versionId);
    if (!targetVersionId) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadConsolidatedTimetablePDF(targetVersionId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `consolidated-timetable-${targetVersionId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.success = 'PDF downloaded successfully';
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = err.error?.message || 'Failed to download consolidated timetable PDF';
      }
    });
  }

  onViewModeChange(): void {
    this.loadSlots();
  }

  clearError(): void {
    this.error = null;
  }

  clearSuccess(): void {
    this.success = null;
  }

  openTimetablePreview(versionId?: string): void {
    const vid = versionId ?? this.selectedVersion?.id;
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    const version = this.versions.find((v) => v.id === vid);
    this.previewVersionLabel = version?.name ?? 'Timetable';
    this.previewModalOpen = true;
    this.previewLoading = true;
    this.previewError = null;
    this.previewTab = 'teachers';
    this.previewVersionId = vid;
    this.previewTeacherSheets = [];
    this.previewClassSheets = [];
    this.previewConsolidatedSheet = null;

    forkJoin({
      slots: this.timetableService.getSlots(vid),
      config: this.timetableService
        .getConfig()
        .pipe(catchError(() => of(null as TimetableConfig | null))),
      settings: this.settingsService.getSettings().pipe(catchError(() => of({}))),
    }).subscribe({
      next: ({ slots, config, settings }) => {
        const teaching = slots.filter((s) => !s.isBreak);
        const result = this.previewBuilder.preparePreview(
          slots,
          teaching,
          config,
          this.classes,
          settings,
          this.previewVersionLabel
        );
        if ('error' in result) {
          this.previewError = result.error;
          this.previewLoading = false;
          return;
        }
        this.previewTeacherSheets = result.teacherSheets;
        this.previewClassSheets = result.classSheets;
        this.previewConsolidatedSheet = result.consolidatedSheet;
        this.previewLoading = false;
      },
      error: (err) => {
        console.error('Error loading preview slots:', err);
        this.previewError =
          err.error?.message || 'Failed to load timetable data for preview';
        this.previewLoading = false;
      },
    });
  }

  closeTimetablePreview(): void {
    this.previewModalOpen = false;
    this.previewError = null;
    this.previewVersionId = null;
    this.previewTeacherSheets = [];
    this.previewClassSheets = [];
    this.previewConsolidatedSheet = null;
  }

  setPreviewTab(tab: 'teachers' | 'classes' | 'summary'): void {
    this.previewTab = tab;
  }

  /** Cell lookup for teacher sheet (day + period only; break columns have no lesson cells). */
  getTeacherSheetCell(
    sheet: TimetableTeacherPreviewSheet,
    day: string,
    period: number
  ): TimetableSlot[] {
    return this.previewBuilder.getTeacherSheetCell(sheet, day, period);
  }

  getClassSheetCell(
    sheet: TimetableClassPreviewSheet,
    day: string,
    period: number
  ): TimetableSlot[] {
    return this.previewBuilder.getClassSheetCell(sheet, day, period);
  }

  getClassDaySegments(sheet: TimetableClassPreviewSheet, day: string): ClassPreviewDaySegment[] {
    return this.previewBuilder.getClassDaySegments(sheet, day);
  }

  teacherDisplayName(slot: TimetableSlot): string {
    return this.previewBuilder.teacherDisplayName(slot);
  }

  getConsolidatedCellLabel(
    sheet: TimetableConsolidatedPreviewSheet,
    teacherId: string,
    day: string,
    col: TimetablePreviewColumn
  ): string {
    return this.previewBuilder.getConsolidatedCellLabel(sheet, teacherId, day, col);
  }

  classFormCornerLabel(slot: TimetableSlot): string | null {
    return this.previewBuilder.classFormCornerLabel(slot);
  }

  dayShortLabel(fullDay: string): string {
    return this.previewBuilder.dayShortLabel(fullDay);
  }

  subjectAbbrev(slot: TimetableSlot): string {
    return this.previewBuilder.subjectAbbrev(slot);
  }

  subjectLabelClassTimetable(slot: TimetableSlot): string {
    return this.previewBuilder.subjectLabelClassTimetable(slot);
  }

  isPeriodColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'period' }> {
    return this.previewBuilder.isPeriodColumn(col);
  }

  isBreakColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'break' }> {
    return this.previewBuilder.isBreakColumn(col);
  }

  breakBannerLabel(rawName: string): string {
    return this.previewBuilder.standardBreakBannerLabel(rawName);
  }
}

