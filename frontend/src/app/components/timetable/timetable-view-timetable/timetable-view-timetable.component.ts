import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  TimetableService,
  TimetableVersion,
  TimetableConfig,
} from '../../../services/timetable.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { TimetablePreviewBuilderService } from '../timetable-preview-builder.service';
import { TimetablePreviewPdfExportService } from '../../../services/timetable-preview-pdf-export.service';
import {
  TimetableTeacherPreviewSheet,
  TimetableClassPreviewSheet,
  TimetableConsolidatedPreviewSheet,
} from '../timetable-preview.models';
import JSZip from 'jszip';

/**
 * Dedicated admin page: print-style preview by teacher, by class, or teacher summary (no generation UI).
 * Route: /timetable/manage/view_timetable
 */
@Component({
  selector: 'app-timetable-view-timetable',
  templateUrl: './timetable-view-timetable.component.html',
  styleUrls: ['./timetable-view-timetable.component.css', '../timetable-view/timetable-view.component.css'],
})
export class TimetableViewTimetableComponent implements OnInit {
  versions: TimetableVersion[] = [];
  selectedVersionId = '';
  classes: any[] = [];

  previewLoading = false;
  previewError: string | null = null;
  previewTab: 'teachers' | 'classes' | 'summary' = 'teachers';
  previewVersionLabel = '';
  previewTeacherSheets: TimetableTeacherPreviewSheet[] = [];
  previewClassSheets: TimetableClassPreviewSheet[] = [];
  previewConsolidatedSheet: TimetableConsolidatedPreviewSheet | null = null;

  loadingVersions = true;
  error: string | null = null;
  downloadAllBusy = false;

  constructor(
    private timetableService: TimetableService,
    private classService: ClassService,
    private settingsService: SettingsService,
    readonly previewBuilder: TimetablePreviewBuilderService,
    private previewPdfExport: TimetablePreviewPdfExportService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadClasses();
    this.loadVersions();
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (classes) => {
        const list = Array.isArray(classes) ? classes : classes?.data || [];
        this.classes = this.classService.sortClasses(list);
      },
      error: () => (this.classes = []),
    });
  }

  loadVersions(): void {
    this.loadingVersions = true;
    this.error = null;
    this.timetableService.getVersions().subscribe({
      next: (versions) => {
        this.versions = versions;
        const active = versions.find((v) => v.isActive) || versions[0];
        this.selectedVersionId = active?.id || '';
        this.loadingVersions = false;
        if (this.selectedVersionId) {
          this.reloadPreview();
        }
      },
      error: () => {
        this.error = 'Failed to load timetable versions';
        this.loadingVersions = false;
      },
    });
  }

  onVersionChange(): void {
    this.reloadPreview();
  }

  setPreviewTab(tab: 'teachers' | 'classes' | 'summary'): void {
    this.previewTab = tab;
  }

  reloadPreview(): void {
    const vid = this.selectedVersionId;
    if (!vid) {
      this.previewError = 'Select a timetable version';
      this.previewTeacherSheets = [];
      this.previewClassSheets = [];
      this.previewConsolidatedSheet = null;
      return;
    }

    const version = this.versions.find((v) => v.id === vid);
    this.previewVersionLabel = version?.name ?? 'Timetable';
    this.previewLoading = true;
    this.previewError = null;
    this.previewTeacherSheets = [];
    this.previewClassSheets = [];
    this.previewConsolidatedSheet = null;

    forkJoin({
      slots: this.timetableService.getSlots(vid),
      config: this.timetableService.getConfig().pipe(catchError(() => of(null as TimetableConfig | null))),
      settings: this.settingsService.getSettings().pipe(catchError(() => of({}))),
    }).subscribe({
      next: ({ slots, config, settings }) => {
        const teaching = (slots || []).filter((s) => !s.isBreak);
        const result = this.previewBuilder.preparePreview(
          slots || [],
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
        console.error(err);
        this.previewError = err.error?.message || 'Failed to load timetable data for preview';
        this.previewLoading = false;
      },
    });
  }

  private safeSlug(s: string): string {
    return (s || 'timetable').replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-').slice(0, 80);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private triggerBrowserDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'download.bin';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private async withExportChromeHidden<T>(el: HTMLElement, exportFn: () => Promise<T>): Promise<T> {
    el.classList.add('tt-exporting-pdf');
    try {
      return await exportFn();
    } finally {
      el.classList.remove('tt-exporting-pdf');
    }
  }

  async downloadTeacherPreviewPdf(sheet: TimetableTeacherPreviewSheet): Promise<void> {
    this.previewError = null;
    const el = document.querySelector(
      `[data-tt-sheet-root="teacher-${sheet.teacherId}"]`
    ) as HTMLElement | null;
    if (!el) {
      this.previewError = 'Could not find this teacher sheet. Refresh the preview and try again.';
      return;
    }
    const ver = this.safeSlug(this.previewVersionLabel);
    const name = this.safeSlug(sheet.teacherName || sheet.teacherId);
    try {
      await this.withExportChromeHidden(el, () =>
        this.previewPdfExport.exportElementToLandscapePdf(el, `${ver}-teacher-${name}.pdf`)
      );
    } catch (e) {
      console.error(e);
      this.previewError = 'Failed to create PDF from the preview.';
    }
  }

  async downloadClassPreviewPdf(sheet: TimetableClassPreviewSheet): Promise<void> {
    this.previewError = null;
    const el = document.querySelector(`[data-tt-sheet-root="class-${sheet.classId}"]`) as HTMLElement | null;
    if (!el) {
      this.previewError = 'Could not find this class sheet. Refresh the preview and try again.';
      return;
    }
    const ver = this.safeSlug(this.previewVersionLabel);
    const cn = this.safeSlug(sheet.className || sheet.classId);
    try {
      await this.withExportChromeHidden(el, () =>
        this.previewPdfExport.exportElementToLandscapePdf(el, `${ver}-class-${cn}.pdf`)
      );
    } catch (e) {
      console.error(e);
      this.previewError = 'Failed to create PDF from the preview.';
    }
  }

  async downloadSummaryPreviewPdf(): Promise<void> {
    this.previewError = null;
    const el = document.querySelector('[data-tt-sheet-root="summary"]') as HTMLElement | null;
    if (!el) {
      this.previewError = 'Summary sheet is not available.';
      return;
    }
    const ver = this.safeSlug(this.previewVersionLabel);
    try {
      await this.withExportChromeHidden(el, () =>
        this.previewPdfExport.exportElementToLandscapePdf(el, `${ver}-teachers-summary.pdf`)
      );
    } catch (e) {
      console.error(e);
      this.previewError = 'Failed to create PDF from the preview.';
    }
  }

  downloadAllForActiveTabDisabled(): boolean {
    if (!this.selectedVersionId || this.previewLoading || this.downloadAllBusy) {
      return true;
    }
    if (this.previewTab === 'teachers') {
      return this.previewTeacherSheets.length === 0;
    }
    if (this.previewTab === 'classes') {
      return this.previewClassSheets.length === 0;
    }
    if (this.previewTab === 'summary') {
      return !this.previewConsolidatedSheet;
    }
    return true;
  }

  downloadAllTooltip(): string {
    if (this.previewTab === 'teachers') {
      return 'Download one ZIP containing a PDF for each teacher timetable';
    }
    if (this.previewTab === 'classes') {
      return 'Download one ZIP containing a PDF for each class timetable';
    }
    if (this.previewTab === 'summary') {
      return 'Download the summary of teachers timetable (single PDF)';
    }
    return '';
  }

  async downloadAllPreviewPdfs(): Promise<void> {
    if (this.downloadAllForActiveTabDisabled()) {
      return;
    }
    this.downloadAllBusy = true;
    this.previewError = null;
    this.cdr.markForCheck();

    const ver = this.safeSlug(this.previewVersionLabel);
    let ok = true;

    try {
      if (this.previewTab === 'teachers') {
        const zip = new JSZip();
        let index = 0;
        for (const sheet of this.previewTeacherSheets) {
          const el = document.querySelector(
            `[data-tt-sheet-root="teacher-${sheet.teacherId}"]`
          ) as HTMLElement | null;
          if (!el) {
            continue;
          }
          const label = this.safeSlug(sheet.teacherName || sheet.teacherId);
          const entryName = `${String(++index).padStart(3, '0')}-${label}.pdf`;
          try {
            const blob = await this.withExportChromeHidden(el, () =>
              this.previewPdfExport.exportElementToLandscapePdfBlob(el)
            );
            zip.file(entryName, blob);
          } catch (e) {
            console.error(e);
            ok = false;
          }
          await this.delay(250);
        }
        if (index === 0) {
          ok = false;
        } else if (ok) {
          try {
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            this.triggerBrowserDownload(zipBlob, `${ver}-all-teacher-timetables.zip`);
          } catch (e) {
            console.error(e);
            ok = false;
          }
        }
      } else if (this.previewTab === 'classes') {
        const zip = new JSZip();
        let index = 0;
        for (const sheet of this.previewClassSheets) {
          const el = document.querySelector(`[data-tt-sheet-root="class-${sheet.classId}"]`) as HTMLElement | null;
          if (!el) {
            continue;
          }
          const label = this.safeSlug(sheet.className || sheet.classId);
          const entryName = `${String(++index).padStart(3, '0')}-${label}.pdf`;
          try {
            const blob = await this.withExportChromeHidden(el, () =>
              this.previewPdfExport.exportElementToLandscapePdfBlob(el)
            );
            zip.file(entryName, blob);
          } catch (e) {
            console.error(e);
            ok = false;
          }
          await this.delay(250);
        }
        if (index === 0) {
          ok = false;
        } else if (ok) {
          try {
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            this.triggerBrowserDownload(zipBlob, `${ver}-all-class-timetables.zip`);
          } catch (e) {
            console.error(e);
            ok = false;
          }
        }
      } else if (this.previewTab === 'summary' && this.previewConsolidatedSheet) {
        const el = document.querySelector('[data-tt-sheet-root="summary"]') as HTMLElement | null;
        if (el) {
          try {
            await this.withExportChromeHidden(el, () =>
              this.previewPdfExport.exportElementToLandscapePdf(el, `${ver}-teachers-summary.pdf`)
            );
          } catch (e) {
            console.error(e);
            ok = false;
          }
        } else {
          ok = false;
        }
      }

      if (!ok) {
        this.previewError = 'One or more PDFs could not be created. Check the browser console.';
      }
    } finally {
      this.downloadAllBusy = false;
      this.cdr.markForCheck();
    }
  }
}
