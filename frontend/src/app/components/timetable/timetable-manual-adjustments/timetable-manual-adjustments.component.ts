import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import {
  TimetableService,
  TimetableVersion,
  TimetableSlot,
  TimetableConfig,
} from '../../../services/timetable.service';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { TimetablePreviewBuilderService } from '../timetable-preview-builder.service';
import { formatClassTimetableTeacherLabel } from '../../../utils/teacher-timetable-label.util';
import { AuthService } from '../../../services/auth.service';

/** Class-based colors (dense timetable style — same class keeps the same color). */
const CLASS_COLOR_PALETTE = [
  '#0f766e',
  '#65a30d',
  '#ca8a04',
  '#db2777',
  '#2563eb',
  '#7c3aed',
  '#ea580c',
  '#059669',
  '#4f46e5',
  '#be123c',
  '#0e7490',
  '#a16207',
  '#4338ca',
  '#9f1239',
  '#047857',
  '#1d4ed8',
  '#15803d',
  '#c2410c',
  '#7e22ce',
];

/** Teacher-row colors in "By teacher" view (separate palette from classes). */
const TEACHER_COLOR_PALETTE = [
  '#22c55e',
  '#15803d',
  '#ca8a04',
  '#64748b',
  '#eab308',
  '#0f766e',
  '#7c3aed',
  '#ea580c',
  '#db2777',
  '#2563eb',
  '#65a30d',
  '#b45309',
  '#0e7490',
  '#4338ca',
  '#be123c',
  '#047857',
  '#92400e',
  '#4f46e5',
  '#0d9488',
  '#a21caf',
];

function hashToPaletteIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = id.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h);
}

function classColorForId(classId: string): string {
  const key = classId || '—';
  return CLASS_COLOR_PALETTE[hashToPaletteIndex(key) % CLASS_COLOR_PALETTE.length];
}

function teacherColorForId(teacherId: string): string {
  const key = teacherId || '—';
  return TEACHER_COLOR_PALETTE[hashToPaletteIndex(key) % TEACHER_COLOR_PALETTE.length];
}

function abbrevTeacherRowLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '—';
  }
  if (parts.length === 1) {
    const w = parts[0];
    return w.length <= 2 ? w.toUpperCase() : (w[0] + w[1]).toUpperCase();
  }
  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return (first + last).toUpperCase();
}

/** Map short / alternate day labels to the same names stored in timetable config and slots. */
const DAY_ALIAS_TO_CANONICAL: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  wed: 'Wednesday',
  weds: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function abbrevClassRowLabel(className: string): string {
  const t = className.trim();
  if (!t) {
    return '—';
  }
  if (t.length <= 4) {
    return t.toUpperCase();
  }
  return t.slice(0, 4).toUpperCase();
}

@Component({
  selector: 'app-timetable-manual-adjustments',
  templateUrl: './timetable-manual-adjustments.component.html',
  styleUrls: ['./timetable-manual-adjustments.component.css'],
})
export class TimetableManualAdjustmentsComponent implements OnInit {
  versions: TimetableVersion[] = [];
  selectedVersionId = '';
  config: TimetableConfig | null = null;
  /** All teaching slots for the selected version (for drag + collision checks). */
  allSlots: TimetableSlot[] = [];

  /** Row axis: teachers or classes. */
  viewKind: 'teacher' | 'class' = 'teacher';
  /** Filter to one teacher/class id, or '' for all. */
  filterEntityId = '';

  teachers: any[] = [];
  classes: any[] = [];

  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  conflictMessage: string | null = null;

  /** When set, user must confirm "Ignore collisions" before save (admin only). */
  collisionPrompt: {
    slot: TimetableSlot;
    teacherId: string;
    classId: string;
    day: string;
    period: number;
    lines: string[];
  } | null = null;

  readonly dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  periods: number[] = [];
  dragSlot: TimetableSlot | null = null;
  dragOverKey: string | null = null;
  /** Lesson picked (raised card); normalized string id from API. */
  liftedSlotId: string | null = null;
  /** Cached grid — avoids *ngFor destroying rows every CD (breaks pick / lift). */
  gridRows: { id: string; name: string; rowLabel: string }[] = [];
  gridDays: string[] = [];
  /**
   * Class time-off grids from `/classes/time-off/bulk` — rows follow school `dayKeys`,
   * columns are period indices 0..n-1 (aligned with period numbers 1..n on this page).
   */
  timeOffDayKeys: string[] = [];
  private timeOffByClassId = new Map<string, number[][]>();
  /** True after mousedown on card so the following click does not double-toggle. */
  private liftHandledByMouseDown = false;
  /** Right-click menu for Lock / Unlock */
  contextMenu: { x: number; y: number; slot: TimetableSlot } | null = null;


  /** Pre-built lookup maps for O(1) cell slot access — rebuilt in buildSlotIndex(). */
  private slotTeacherIdx = new Map<string, Map<string, Map<number, TimetableSlot[]>>>();
  private slotClassIdx   = new Map<string, Map<string, Map<number, TimetableSlot[]>>>();

  constructor(
    private timetableService: TimetableService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private cdr: ChangeDetectorRef,
    private previewBuilder: TimetablePreviewBuilderService,
    private authService: AuthService
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement;
    if (el?.closest?.('.tta-ctx')) {
      return;
    }
    if (el?.closest?.('.tta-card')) {
      return;
    }
    /* Clicks on the grid (empty cells, headers) are handled there; don't clear lift from a stray document phase. */
    if (el?.closest?.('.tta-grid')) {
      this.contextMenu = null;
      return;
    }
    this.contextMenu = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') {
      return;
    }
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.contextMenu = null;
  }

  /** Slot currently being positioned (drag takes precedence over click-lift). */
  activeMoveSlot(): TimetableSlot | null {
    if (this.dragSlot) {
      return this.dragSlot;
    }
    if (!this.liftedSlotId) {
      return null;
    }
    return (
      this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId)) ?? null
    );
  }

  ngOnInit(): void {
    this.loadVersions();
  }

  loadVersions(): void {
    this.loading = true;
    this.timetableService.getVersions().subscribe({
      next: (versions) => {
        this.versions = versions;
        const active = versions.find((v) => v.isActive) || versions[0];
        if (active) {
          this.selectedVersionId = active.id;
          this.refreshData();
        } else {
          this.loading = false;
          this.loadSupportData();
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load timetable versions';
        this.loading = false;
      },
    });
  }

  onVersionChange(): void {
    this.conflictMessage = null;
    this.collisionPrompt = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.refreshData();
  }

  onViewKindChange(): void {
    this.filterEntityId = '';
    this.conflictMessage = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.refreshGridLayout();
  }

  onFilterEntityChange(): void {
    this.refreshGridLayout();
  }

  /** Load teachers + classes for filter dropdowns (non-blocking). */
  private loadSupportData(): void {
    this.teacherService
      .getTeachers()
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : ((res as any)?.data || []);
        this.teachers = list;
        if (!this.loading) {
          this.refreshGridLayout();
          this.cdr.detectChanges();
        }
      });
    this.classService
      .getClasses()
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        const list = Array.isArray(res) ? res : ((res as any)?.data || []);
        this.classes = this.classService.sortClasses(list);
        if (!this.loading) {
          this.refreshGridLayout();
          this.cdr.detectChanges();
        }
      });
    this.classService
      .getAllClassesTimeOffBulk()
      .pipe(catchError(() => of(null)))
      .subscribe((bulk) => {
        this.applyTimeOffBulk(bulk);
        this.cdr.detectChanges();
      });
  }

  refreshData(): void {
    if (!this.selectedVersionId) {
      return;
    }
    this.loading = true;
    this.error = null;

    /* Load slots and config — the only things needed to draw the grid. */
    forkJoin({
      slots: this.timetableService.getSlots(this.selectedVersionId),
      config: this.timetableService.getConfig().pipe(catchError(() => of(null as TimetableConfig | null))),
    }).subscribe({
      next: ({ slots, config }) => {
        this.config = config;

        /* Normalize raw slots: always an array, IDs trimmed, numbers coerced. */
        const raw: any[] = Array.isArray(slots) ? slots : ((slots as any)?.data || []);
        this.allSlots = raw
          .filter((s) => {
            const isBreak = s?.isBreak;
            return !(isBreak === true || isBreak === 1 || isBreak === 'true' || isBreak === '1');
          })
          .map((s) => ({
            ...s,
            teacherId: String(s.teacherId || s.teacher?.id || '').trim(),
            classId:   String(s.classId   || s.class?.id   || '').trim(),
            dayOfWeek:    this.canonicalDay(String(s.dayOfWeek    || '').trim()),
            periodNumber: Number(s.periodNumber) || 0,
          }));

        console.log('[ManualAdj] slots loaded:', this.allSlots.length,
          'sample:', this.allSlots[0]?.teacherId, this.allSlots[0]?.dayOfWeek, this.allSlots[0]?.periodNumber);

        this.buildSlotIndex();
        this.buildPeriods();
        this.refreshGridLayout();
        this.loading = false;
        this.cdr.detectChanges();
        this.loadSupportData();
      },
      error: (err) => {
        console.error('[ManualAdj] forkJoin error:', err);
        this.error = 'Failed to load timetable data — ' + (err?.message || err?.status || 'network error');
        this.loading = false;
        this.cdr.detectChanges();
        this.loadSupportData();
      },
    });
  }

  /** Pre-build teacher-keyed and class-keyed lookup maps for O(1) cell access. */
  private buildSlotIndex(): void {
    this.slotTeacherIdx.clear();
    this.slotClassIdx.clear();
    for (const s of this.allSlots) {
      const tid = s.teacherId;
      const cid = s.classId;
      const day = s.dayOfWeek;        /* already canonicalized in refreshData */
      const p   = s.periodNumber;     /* already coerced to Number */

      if (tid) {
        if (!this.slotTeacherIdx.has(tid)) { this.slotTeacherIdx.set(tid, new Map()); }
        const dm = this.slotTeacherIdx.get(tid)!;
        if (!dm.has(day)) { dm.set(day, new Map()); }
        const pm = dm.get(day)!;
        if (!pm.has(p)) { pm.set(p, []); }
        pm.get(p)!.push(s);
      }
      if (cid) {
        if (!this.slotClassIdx.has(cid)) { this.slotClassIdx.set(cid, new Map()); }
        const dm = this.slotClassIdx.get(cid)!;
        if (!dm.has(day)) { dm.set(day, new Map()); }
        const pm = dm.get(day)!;
        if (!pm.has(p)) { pm.set(p, []); }
        pm.get(p)!.push(s);
      }
    }
  }

  /**
   * Wall-chart columns: at least 12 periods (reference UI), and at least config/slots max (capped at 16).
   */
  private buildPeriods(): void {
    const fromConfig =
      this.config?.periodsPerDay && this.config.periodsPerDay > 0 ? this.config.periodsPerDay : 8;
    let maxFromSlots = 0;
    this.allSlots.forEach((s) => {
      const n = Number(s.periodNumber);
      if (Number.isFinite(n)) {
        maxFromSlots = Math.max(maxFromSlots, n);
      }
    });
    const n = Math.min(16, Math.max(fromConfig, maxFromSlots, 12));
    this.periods = Array.from({ length: n }, (_, i) => i + 1);
  }

  private computeSortedDays(): string[] {
    const fromConfig = (this.config?.daysOfWeek || []).map((x) => this.canonicalDay(String(x))).filter(Boolean);
    const fromSlots = this.allSlots.map((s) => this.canonicalDay(s.dayOfWeek)).filter(Boolean);
    const union = [...new Set([...fromConfig, ...fromSlots])];
    const fallback = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const days = union.length > 0 ? union : fallback;
    const rank = (d: string) => {
      const i = this.dayOrder.indexOf(d);
      return i >= 0 ? i : 999;
    };
    return [...days].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  /** Rebuild cached row/day lists when data or view changes (keeps table DOM stable). */
  refreshGridLayout(): void {
    this.gridDays = this.computeSortedDays();
    this.gridRows = this.viewKind === 'teacher' ? this.teacherRows() : this.classRows();
  }

  /** Wall-chart day labels: MON, TUE, … */
  dayHeadingShort(day: string): string {
    if (!day) {
      return '';
    }
    const idx = this.dayOrder.indexOf(day);
    const abbrevs = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    if (idx >= 0 && idx < abbrevs.length) {
      return abbrevs[idx];
    }
    return day.length <= 4 ? day.toUpperCase() : day.slice(0, 3).toUpperCase();
  }

  trackRowById(_: number, row: { id: string }): string {
    return row.id;
  }

  /** Arrow function so `this` context is preserved when Angular stores it as _trackByFn. */
  trackSlotById = (_: number, slot: TimetableSlot): string => {
    const id = slot?.id;
    return id != null && id !== '' ? String(id) : '';
  };

  normId(id: string | undefined | null): string {
    return id != null && id !== '' ? String(id) : '';
  }

  /** API may return a bare array or a wrapped payload. */
  private normalizeSlotsPayload(slots: unknown): TimetableSlot[] {
    if (Array.isArray(slots)) {
      return slots as TimetableSlot[];
    }
    if (slots && typeof slots === 'object') {
      const o = slots as Record<string, unknown>;
      if (Array.isArray(o['data'])) {
        return o['data'] as TimetableSlot[];
      }
      if (Array.isArray(o['slots'])) {
        return o['slots'] as TimetableSlot[];
      }
    }
    return [];
  }

  /** Treat only explicit “break” markers as non-teaching; avoid dropping lessons if isBreak is a string, etc. */
  private slotCountsAsBreak(s: TimetableSlot): boolean {
    const v = (s as any).isBreak;
    return v === true || v === 1 || v === 'true' || v === '1';
  }

  /** Ensure flat ids match joined relations (some API shapes omit top-level teacherId/classId). */
  private hydrateSlotIds(slots: TimetableSlot[]): TimetableSlot[] {
    return slots.map((s) => {
      const teacherId = this.normId(s.teacherId) || this.normId(s.teacher?.id);
      const classId = this.normId(s.classId) || this.normId(s.class?.id);
      return { ...s, teacherId, classId };
    });
  }

  /** Trim day labels so slots match grid headers (avoids empty cells when API has stray spaces). */
  private normDay(d: string | null | undefined): string {
    if (d == null) {
      return '';
    }
    return String(d).trim();
  }

  /** Map any casing (e.g. "monday", "MON", "Tue") to the canonical `dayOrder` string ("Monday"). */
  private canonicalDay(d: string | null | undefined): string {
    const t = this.normDay(d);
    if (!t) {
      return '';
    }
    const lower = t.toLowerCase();
    const found = this.dayOrder.find((x) => x.toLowerCase() === lower);
    if (found) {
      return found;
    }
    const fromAlias = DAY_ALIAS_TO_CANONICAL[lower];
    return fromAlias || t;
  }

  private sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
    return this.canonicalDay(a) === this.canonicalDay(b);
  }

  private slotPeriodNum(s: TimetableSlot): number {
    const n = Number((s as any).periodNumber);
    return Number.isFinite(n) ? n : 0;
  }

  private samePeriod(slot: TimetableSlot, period: number): boolean {
    return this.slotPeriodNum(slot) === Number(period);
  }

  isSlotLifted(slot: TimetableSlot): boolean {
    if (this.slotIsLocked(slot)) {
      return false;
    }
    const sid = this.normId(slot.id);
    if (this.dragSlot && this.normId(this.dragSlot.id) === sid) {
      return true;
    }
    if (!this.liftedSlotId) {
      return false;
    }
    return this.normId(this.liftedSlotId) === sid;
  }

  pickedSlotLabel(): string {
    if (!this.liftedSlotId) {
      return '';
    }
    const slot = this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId));
    if (!slot) {
      return this.liftedSlotId;
    }
    return `${this.cardPrimaryLabel(slot)} · ${this.cardSecondaryLabel(slot)}`;
  }

  clearPickedLesson(): void {
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.cdr.detectChanges();
  }

  private teacherRows(): { id: string; name: string; rowLabel: string }[] {
    const map = new Map<string, string>();
    this.allSlots.forEach((s) => {
      const tid = this.normId(s.teacherId);
      if (!tid) {
        return;
      }
      const nm = s.teacher
        ? `${s.teacher.firstName || ''} ${s.teacher.lastName || ''}`.trim()
        : 'Teacher';
      map.set(tid, nm || 'Teacher');
    });
    const teacherList = Array.isArray(this.teachers) ? this.teachers : [];
    teacherList.forEach((t: any) => {
      const tid = this.normId(t?.id);
      if (!tid || map.has(tid)) {
        return;
      }
      const nm = `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Teacher';
      map.set(tid, nm);
    });
    let rows = [...map.entries()].map(([id, name]) => ({
      id,
      name,
      rowLabel: abbrevTeacherRowLabel(name),
    }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    if (this.filterEntityId) {
      rows = rows.filter((r) => r.id === this.filterEntityId);
    }
    return rows;
  }

  private classRows(): { id: string; name: string; rowLabel: string }[] {
    const map = new Map<string, string>();
    this.allSlots.forEach((s) => {
      const cid = this.normId(s.classId);
      if (!cid) {
        return;
      }
      map.set(cid, s.class?.name || 'Class');
    });
    const classList = Array.isArray(this.classes) ? this.classes : [];
    classList.forEach((c: any) => {
      const cid = this.normId(c?.id);
      if (!cid || map.has(cid)) {
        return;
      }
      map.set(cid, c.name || c.form || 'Class');
    });
    let rows = [...map.entries()].map(([id, name]) => ({
      id,
      name,
      rowLabel: abbrevClassRowLabel(name),
    }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    if (this.filterEntityId) {
      rows = rows.filter((r) => r.id === this.filterEntityId);
    }
    return rows;
  }

  teacherFilterOptions(): { id: string; name: string }[] {
    return this.teachers
      .map((t) => ({
        id: t.id,
        name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherId || t.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  classFilterOptions(): { id: string; name: string }[] {
    return this.classes.map((c) => ({ id: c.id, name: c.name || c.form || c.id }));
  }

  cellKey(rowId: string, day: string, period: number): string {
    return `${rowId}|${day}|${period}`;
  }

  private applyTimeOffBulk(res: any): void {
    this.timeOffDayKeys = Array.isArray(res?.dayKeys)
      ? res.dayKeys.map((x: any) => this.canonicalDay(String(x))).filter(Boolean)
      : [];
    this.timeOffByClassId.clear();
    const raw = res?.byClassId;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const k of Object.keys(raw)) {
        const grid = raw[k];
        if (Array.isArray(grid)) {
          this.timeOffByClassId.set(
            k,
            grid.map((row: any) => (Array.isArray(row) ? row.map((v: any) => Math.round(Number(v)) || 0) : []))
          );
        }
      }
    }
  }

  /** 0 = available, 1 = conditional, 2 = time off (per class assign grid). */
  classTimeOffAt(classId: string, day: string, period: number): number {
    const grid = this.timeOffByClassId.get(this.normId(classId));
    if (!grid?.length || !this.timeOffDayKeys.length) {
      return 0;
    }
    const d = this.timeOffDayKeys.findIndex((k) => this.sameDay(k, day));
    if (d < 0 || d >= grid.length) {
      return 0;
    }
    const row = grid[d];
    const p = period - 1;
    if (!row || p < 0 || p >= row.length) {
      return 0;
    }
    const v = Math.round(Number(row[p]));
    return v === 1 || v === 2 ? v : 0;
  }

  slotClassTimeOff(slot: TimetableSlot, day: string, period: number): number {
    return this.classTimeOffAt(slot.classId, day, period);
  }

  /** Two overlapping lessons use a diagonal split (wall-chart style). */
  useDiagonalSplit(slots: TimetableSlot[]): boolean {
    return slots.length === 2;
  }

  /** All lessons in this cell — O(1) lookup via pre-built index. */
  cellSlots(rowId: string, day: string, period: number): TimetableSlot[] {
    const rid = this.normId(rowId);
    const canonDay = this.canonicalDay(day);
    const p = Number(period);
    if (this.viewKind === 'teacher') {
      return this.slotTeacherIdx.get(rid)?.get(canonDay)?.get(p) ?? [];
    }
    return this.slotClassIdx.get(rid)?.get(canonDay)?.get(p) ?? [];
  }

  /** By teacher: color encodes the teacher (row). By class: color encodes the class (row). */
  cardColor(slot: TimetableSlot): string {
    if (this.viewKind === 'teacher') {
      return teacherColorForId(slot.teacherId);
    }
    return classColorForId(slot.classId);
  }

  /** Sticky row label accent — same identity as card colors for that row. */
  rowRibbonColor(row: { id: string }): string {
    const id = row?.id || '';
    if (this.viewKind === 'teacher') {
      return teacherColorForId(id);
    }
    return classColorForId(id);
  }

  subjectAbbrev(slot: TimetableSlot): string {
    const code = slot.subject?.code?.trim();
    if (code) {
      return code.length > 6 ? code.slice(0, 6) : code;
    }
    const name = slot.subject?.name?.trim() || '—';
    return name.length > 5 ? name.slice(0, 5) : name;
  }

  /** Primary line: class (by teacher) or subject (by class), wall-chart style. */
  cardPrimaryLabel(slot: TimetableSlot): string {
    if (this.viewKind === 'class') {
      const a = this.previewBuilder.subjectLabelClassTimetable(slot);
      return a.length > 8 ? a.slice(0, 8) : a;
    }
    const raw = (slot.class?.name || slot.class?.form || '').trim();
    if (!raw) {
      return '—';
    }
    return raw.length > 10 ? raw.slice(0, 10) : raw;
  }

  /** Second line: subject (by teacher) or teacher initials (by class). */
  cardSecondaryLabel(slot: TimetableSlot): string {
    if (this.viewKind === 'class') {
      const t = slot.teacher;
      if (!t) {
        return '—';
      }
      return formatClassTimetableTeacherLabel(t.firstName, t.lastName, t.gender, t.maritalStatus);
    }
    return this.subjectAbbrev(slot);
  }

  onDragStart(slot: TimetableSlot, ev: DragEvent): void {
    if (this.slotIsLocked(slot)) {
      ev.preventDefault();
      this.dragSlot = null;
      this.conflictMessage = 'This lesson is locked. Right-click the card and choose Unlock to move it.';
      return;
    }
    this.dragSlot = slot;
    this.liftedSlotId = this.normId(slot.id);
    this.conflictMessage = null;
    ev.dataTransfer?.setData('text/plain', this.normId(slot.id));
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
    }
  }

  onCardContextMenu(slot: TimetableSlot, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = { x: ev.clientX, y: ev.clientY, slot };
  }

  /**
   * Select lesson on mousedown. If already selected, do nothing so HTML5 drag can start.
   * Do not toggle off here — that would cancel drag on the same gesture.
   */
  onCardMouseDown(slot: TimetableSlot, ev: MouseEvent): void {
    if (ev.button !== 0) {
      return;
    }
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      this.conflictMessage = 'This slot has no id — refresh the timetable.';
      this.cdr.detectChanges();
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      return;
    }
    this.liftedSlotId = sid;
    this.dragOverKey = null;
    this.conflictMessage = null;
    this.liftHandledByMouseDown = true;
    this.cdr.detectChanges();
  }

  /**
   * Second click on the same card deselects. Click after mousedown-select is ignored once.
   */
  onCardClick(slot: TimetableSlot, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.liftHandledByMouseDown) {
      this.liftHandledByMouseDown = false;
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      this.liftedSlotId = null;
      this.dragOverKey = null;
      this.conflictMessage = null;
    } else {
      this.liftedSlotId = sid;
      this.dragOverKey = null;
      this.conflictMessage = null;
    }
    this.cdr.detectChanges();
  }

  onCardKeyActivate(slot: TimetableSlot, ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      this.liftedSlotId = null;
      this.dragOverKey = null;
    } else {
      this.liftedSlotId = sid;
      this.dragOverKey = null;
    }
    this.conflictMessage = null;
    this.cdr.detectChanges();
  }

  slotIsLocked(slot: TimetableSlot): boolean {
    return slot.isLocked === true || (slot as any).isLocked === 'true' || (slot as any).isLocked === 1;
  }

  onGridCellClick(rowId: string, day: string, period: number, ev: MouseEvent): void {
    if (!this.liftedSlotId || this.dragSlot) {
      return;
    }
    const target = ev.target as HTMLElement;
    if (target.closest('.tta-card')) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const slot = this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId));
    if (!slot) {
      return;
    }
    this.applyMoveToCell(slot, rowId, day, period);
  }

  onCellHoverEnter(rowId: string, day: string, period: number): void {
    if (this.activeMoveSlot()) {
      this.dragOverKey = this.cellKey(rowId, day, period);
    }
  }

  onCellHoverLeave(ev: MouseEvent): void {
    if (!this.activeMoveSlot()) {
      return;
    }
    const related = ev.relatedTarget as Node | null;
    if (related && (ev.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    this.dragOverKey = null;
  }

  applyContextLockToggle(): void {
    const cm = this.contextMenu;
    this.contextMenu = null;
    if (!cm) {
      return;
    }
    const nextLocked = !cm.slot.isLocked;
    this.saving = true;
    this.conflictMessage = null;
    this.error = null;
    this.timetableService.updateSlot(cm.slot.id, { isLocked: nextLocked }).subscribe({
      next: () => {
        this.saving = false;
        this.success = nextLocked ? 'Lesson locked — it can no longer be dragged.' : 'Lesson unlocked — you can move it again.';
        this.refreshData();
        setTimeout(() => (this.success = null), 3500);
      },
      error: (err) => {
        this.saving = false;
        this.conflictMessage = err.error?.message || err.message || 'Could not update lock.';
      },
    });
  }

  onDragEnd(): void {
    /** Defer clearing so `drop` always runs first in browsers where `dragend` can race. */
    setTimeout(() => {
      this.dragSlot = null;
      this.dragOverKey = null;
      this.cdr.detectChanges();
    }, 0);
  }

  onDragLeaveCell(ev: DragEvent): void {
    const related = ev.relatedTarget as Node | null;
    if (related && (ev.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    this.dragOverKey = null;
  }

  /** True while dragging if dropping here would be blocked (same as onDrop pre-checks). */
  isInvalidDropTarget(rowId: string, day: string, period: number): boolean {
    const slot = this.activeMoveSlot();
    if (!slot) {
      return false;
    }
    if (this.slotIsLocked(slot)) {
      return true;
    }
    if (this.viewKind === 'teacher' && this.normId(rowId) !== this.normId(slot.teacherId)) {
      return true;
    }
    if (this.viewKind === 'class' && this.normId(rowId) !== this.normId(slot.classId)) {
      return true;
    }
    return false;
  }

  onDragOver(ev: DragEvent, rowId: string, day: string, period: number): void {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    this.dragOverKey = this.cellKey(rowId, day, period);
  }

  onDrop(rowId: string, day: string, period: number, ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOverKey = null;
    const rawId = ev.dataTransfer?.getData('text/plain') || this.dragSlot?.id;
    const id = this.normId(rawId as string);
    if (!id) {
      this.conflictMessage =
        'Could not read the dragged lesson (try again or use click-to-move).';
      this.cdr.detectChanges();
      return;
    }
    const slot = this.allSlots.find((s) => this.normId(s.id) === id);
    if (!slot) {
      this.conflictMessage =
        'That lesson is no longer on the grid — refresh the page or reload the timetable.';
      this.cdr.detectChanges();
      return;
    }
    this.applyMoveToCell(slot, rowId, day, period);
  }

  /** Validates and starts save; no-op if same cell or invalid. */
  private applyMoveToCell(slot: TimetableSlot, rowId: string, day: string, period: number): void {
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Unlock it before moving.';
      return;
    }

    if (this.viewKind === 'teacher' && this.normId(rowId) !== this.normId(slot.teacherId)) {
      this.conflictMessage =
        'Keep this lesson on the same teacher row — only change day or period (wall-chart style).';
      return;
    }
    if (this.viewKind === 'class' && this.normId(rowId) !== this.normId(slot.classId)) {
      this.conflictMessage =
        'Keep this lesson on the same class row — only change day or period.';
      return;
    }

    const nextTeacherId = this.viewKind === 'teacher' ? rowId : slot.teacherId;
    const nextClassId = this.viewKind === 'class' ? rowId : slot.classId;

    if (
      this.normId(slot.teacherId) === this.normId(nextTeacherId) &&
      this.normId(slot.classId) === this.normId(nextClassId) &&
      this.sameDay(slot.dayOfWeek, day) &&
      this.samePeriod(slot, period)
    ) {
      return;
    }

    const otherTeacherSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.teacherId) === this.normId(nextTeacherId) &&
        this.sameDay(s.dayOfWeek, day) &&
        this.samePeriod(s, period)
    );

    const otherClassSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.classId) === this.normId(nextClassId) &&
        this.sameDay(s.dayOfWeek, day) &&
        this.samePeriod(s, period)
    );

    if (otherTeacherSlot || otherClassSlot) {
      const lines: string[] = [
        'Policy: one teacher must teach only one lesson in a given period (one room / one class at a time).',
        'Policy: one class must have only one subject in a given period.',
      ];
      if (otherTeacherSlot) {
        lines.push(
          'Conflict: this teacher is already assigned in this day and period. Ignoring collisions allows two classes (e.g. joint set) in the same slot.'
        );
      }
      if (otherClassSlot) {
        lines.push('Conflict: this class already has a lesson in this day and period.');
      }
      lines.push('Only click “Ignore collisions” when this overlap is deliberate.');
      if (this.authService.hasRole('admin') || this.authService.hasRole('superadmin') || this.authService.hasRole('demo_user')) {
        this.collisionPrompt = { slot, teacherId: nextTeacherId, classId: nextClassId, day, period, lines };
        this.conflictMessage = null;
        return;
      }
      this.conflictMessage =
        otherTeacherSlot && otherClassSlot
          ? 'Teacher and class are both already busy in that period. An administrator can use “Ignore collisions” only when that double booking is intentional.'
          : otherTeacherSlot
            ? 'This teacher is already teaching in that period. An administrator may use “Ignore collisions” for joint / shared slots (e.g. two classes, one teacher).'
            : 'This class already has a subject in that period. An administrator may use “Ignore collisions” only if that is intentional.';
      return;
    }

    this.persistMove(slot, nextTeacherId, nextClassId, day, period, false);
  }

  cancelCollisionPrompt(): void {
    this.collisionPrompt = null;
    this.cdr.detectChanges();
  }

  confirmIgnoreCollisions(): void {
    const p = this.collisionPrompt;
    if (!p) {
      return;
    }
    this.collisionPrompt = null;
    this.persistMove(p.slot, p.teacherId, p.classId, p.day, p.period, true);
  }

  /**
   * Slots that have no day or period yet — shown in the unplaced tray below the grid.
   * After a slot is placed the API is saved and refreshData() removes it from this list.
   */
  unplacedSlots(): TimetableSlot[] {
    let slots = this.allSlots.filter(
      (s) => !s.dayOfWeek || !s.periodNumber || s.periodNumber <= 0
    );
    if (this.filterEntityId) {
      if (this.viewKind === 'teacher') {
        slots = slots.filter((s) => this.normId(s.teacherId) === this.filterEntityId);
      } else {
        slots = slots.filter((s) => this.normId(s.classId) === this.filterEntityId);
      }
    }
    return slots;
  }

  /**
   * Short identifier shown on a tray card so the user can tell which row the lesson belongs to.
   * In teacher view → teacher initials; in class view → class abbreviation.
   */
  trayRowLabel(slot: TimetableSlot): string {
    if (this.viewKind === 'teacher') {
      const t = slot.teacher;
      if (!t) { return ''; }
      return abbrevTeacherRowLabel(`${t.firstName || ''} ${t.lastName || ''}`.trim());
    }
    const name = slot.class?.name || (slot.class as any)?.form || '';
    return abbrevClassRowLabel(name);
  }

  /** Autosave to API after every valid manual move (click-to-place or drag-drop). */
  private persistMove(
    slot: TimetableSlot,
    teacherId: string,
    classId: string,
    day: string,
    period: number,
    ignoreCollisions: boolean
  ): void {
    if (this.saving) {
      return;
    }
    this.saving = true;
    this.conflictMessage = null;
    this.error = null;

    const prev = {
      teacherId: slot.teacherId,
      classId: slot.classId,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
    };

    slot.teacherId = teacherId;
    slot.classId = classId;
    slot.dayOfWeek = day;
    slot.periodNumber = period;
    this.refreshGridLayout();
    this.cdr.detectChanges();

    const body = {
      teacherId,
      classId,
      subjectId: slot.subjectId,
      dayOfWeek: day,
      periodNumber: period,
      room: slot.room,
      ...(ignoreCollisions ? { ignoreCollisions: true as const } : {}),
    };

    this.timetableService.updateSlot(slot.id, body).subscribe({
      next: () => {
        this.saving = false;
        this.liftedSlotId = null;
        this.dragOverKey = null;
        this.collisionPrompt = null;
        this.success = ignoreCollisions
          ? 'Lesson saved (collisions ignored).'
          : 'Lesson saved in new slot.';
        this.refreshData();
        setTimeout(() => (this.success = null), 3500);
      },
      error: (err) => {
        this.saving = false;
        slot.teacherId = prev.teacherId;
        slot.classId = prev.classId;
        slot.dayOfWeek = prev.dayOfWeek;
        slot.periodNumber = prev.periodNumber;
        this.refreshGridLayout();
        const msg = err.error?.message || err.message || 'Could not save the move.';
        const code = err.error?.code;
        const isConflict =
          code === 'TIMETABLE_CONFLICT' ||
          code === 'TIMETABLE_TEACHER_CLASS_DAY' ||
          /conflict/i.test(msg);
        if (
          isConflict &&
          !ignoreCollisions &&
          (this.authService.hasRole('admin') ||
            this.authService.hasRole('superadmin') ||
            this.authService.hasRole('demo_user'))
        ) {
          this.collisionPrompt = {
            slot,
            teacherId,
            classId,
            day,
            period,
            lines: [msg],
          };
          this.conflictMessage = null;
        } else {
          this.conflictMessage = msg;
          if (err.error?.conflicts?.length) {
            this.conflictMessage += ' (Server detected a timetable conflict.)';
          }
        }
        this.cdr.detectChanges();
      },
    });
  }
}
