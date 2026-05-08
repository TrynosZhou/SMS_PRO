import { Injectable } from '@angular/core';
import { TimetableSlot, TimetableConfig } from '../../services/timetable.service';
import {
  TimetablePreviewColumn,
  TimetableTeacherPreviewSheet,
  TimetableClassPreviewSheet,
  ClassPreviewDaySegment,
  TimetableConsolidatedPreviewSheet,
} from './timetable-preview.models';
import {
  formatClassTimetableTeacherLabel,
  formatTeacherTimetableHeaderLabel,
} from '../../utils/teacher-timetable-label.util';
import { calculateTeachingPeriodTimesFromConfig } from '../../utils/timetable-period-times.util';

export interface TimetablePreviewPrepared {
  teacherSheets: TimetableTeacherPreviewSheet[];
  classSheets: TimetableClassPreviewSheet[];
  consolidatedSheet: TimetableConsolidatedPreviewSheet;
  versionTitleWithSchool: string;
}

@Injectable({
  providedIn: 'root',
})
export class TimetablePreviewBuilderService {
  private readonly dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  preparePreview(
    allSlots: TimetableSlot[],
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    classes: any[],
    settings: any,
    versionNameOnly: string
  ): { error: string } | TimetablePreviewPrepared {
    if (teachingSlots.length === 0) {
      return {
        error:
          allSlots.length === 0
            ? 'This version has no lesson slots in the database. It may have been saved when scheduling produced zero lessons. Generate a new timetable after fixing Configuration (periods per day, weekly lessons) and teacher–class–subject assignments, or select a different version that already has lessons.'
            : 'There are only break rows for this version—nothing to show in the teaching grid.',
      };
    }

    const { schoolName, schoolLogo } = this.extractSchoolBranding(settings);
    const versionTitleWithSchool = `${schoolName}: ${versionNameOnly}`;

    return {
      teacherSheets: this.buildTeacherPreviewSheets(
        teachingSlots,
        config,
        schoolName,
        versionTitleWithSchool,
        schoolLogo
      ),
      classSheets: this.buildClassPreviewSheets(
        teachingSlots,
        config,
        classes,
        schoolName,
        versionTitleWithSchool,
        schoolLogo
      ),
      consolidatedSheet: this.buildConsolidatedPreviewSheet(
        teachingSlots,
        config,
        versionTitleWithSchool,
        schoolLogo
      ),
      versionTitleWithSchool,
    };
  }

  /** Tea break → BREAK TIME; lunch → LUNCH TIME (aligned with timetable PDFs). */
  standardBreakBannerLabel(rawName: string): string {
    const n = (rawName || '').toLowerCase();
    if (n.includes('lunch')) return 'LUNCH TIME';
    if (n.includes('tea')) return 'BREAK TIME';
    return (rawName || 'Break').trim().toUpperCase();
  }

  getTeacherSheetCell(sheet: TimetableTeacherPreviewSheet, day: string, period: number): TimetableSlot[] {
    return this.getPreviewSheetCells(sheet, day, period);
  }

  getClassSheetCell(sheet: TimetableClassPreviewSheet, day: string, period: number): TimetableSlot[] {
    return this.getPreviewSheetCells(sheet, day, period);
  }

  getClassDaySegments(sheet: TimetableClassPreviewSheet, day: string): ClassPreviewDaySegment[] {
    const out: ClassPreviewDaySegment[] = [];
    const cols = sheet.columns;
    let i = 0;
    while (i < cols.length) {
      const col = cols[i];
      if (col.kind === 'break') {
        out.push({
          kind: 'break',
          label: col.label,
          timeStart: col.timeStart,
          timeEnd: col.timeEnd,
        });
        i++;
        continue;
      }
      const period = col.period;
      const slots = this.getClassSheetCell(sheet, day, period);
      if (!slots.length) {
        out.push({ kind: 'empty', colspan: 1 });
        i++;
        continue;
      }
      const first = slots[0];
      let colspan = 1;
      let j = i + 1;
      while (j < cols.length) {
        const nextCol = cols[j];
        if (nextCol.kind !== 'period') {
          break;
        }
        const nextSlots = this.getClassSheetCell(sheet, day, nextCol.period);
        if (!nextSlots.length || !this.isSameTimetableLesson(first, nextSlots[0])) {
          break;
        }
        colspan++;
        j++;
      }
      out.push({ kind: 'lesson', colspan, slots });
      i = j;
    }
    return out;
  }

  /** Formal title for class-timetable cells (Mr/Mrs/Miss/Ms + last name + first initial). */
  teacherDisplayName(slot: TimetableSlot): string {
    const t = slot.teacher;
    if (!t) {
      return '—';
    }
    const label = formatClassTimetableTeacherLabel(t.firstName, t.lastName, t.gender, t.maritalStatus);
    return label && label !== 'Teacher' ? label : '—';
  }

  /** Class name from any slot that has the class relation loaded. */
  private classNameFromSlots(slots: TimetableSlot[], classId: string): string {
    const hit = slots.find((s) => s.classId === classId && s.class);
    const nm = hit?.class?.name?.trim();
    if (nm) return nm;
    return `Class ${classId}`;
  }

  /** Titled full name for preview header / consolidated rows (Mr / Mrs / Miss / Ms + first + last). */
  private teacherFullNameFromSlots(slots: TimetableSlot[], teacherId: string): string {
    const hit = slots.find((s) => s.teacherId === teacherId && s.teacher);
    const t = hit?.teacher;
    if (t) {
      const titled = formatTeacherTimetableHeaderLabel(
        t.firstName,
        t.lastName,
        t.gender,
        t.maritalStatus
      );
      if (titled && titled !== 'Teacher') {
        return titled;
      }
    }
    return `Teacher ${teacherId}`;
  }

  getConsolidatedCellLabel(
    sheet: TimetableConsolidatedPreviewSheet,
    teacherId: string,
    day: string,
    col: TimetablePreviewColumn
  ): string {
    if (col.kind !== 'period') {
      return '';
    }
    const k = `${teacherId}|${day}|${col.period}`;
    const slot = sheet.cellMap[k];
    const name = slot?.class?.name?.trim();
    return name || '';
  }

  classFormCornerLabel(slot: TimetableSlot): string | null {
    const form = slot.class?.form;
    if (form != null && String(form).trim() !== '') {
      return String(form).trim();
    }
    return null;
  }

  dayShortLabel(fullDay: string): string {
    const map: Record<string, string> = {
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
      Sunday: 'Sun',
    };
    return map[fullDay] || fullDay.slice(0, 3);
  }

  subjectAbbrev(slot: TimetableSlot): string {
    const code = slot.subject?.code?.trim();
    if (code) return code.length > 6 ? code.slice(0, 6) : code;
    const name = slot.subject?.name?.trim() || '—';
    return name.length > 4 ? name.slice(0, 4) : name;
  }

  /** Class timetables: show Short title when set; otherwise same as subjectAbbrev (code / name). */
  subjectLabelClassTimetable(slot: TimetableSlot): string {
    const short = slot.subject?.shortTitle?.trim();
    if (short) return short.length > 12 ? short.slice(0, 12) : short;
    return this.subjectAbbrev(slot);
  }

  isPeriodColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'period' }> {
    return col.kind === 'period';
  }

  isBreakColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'break' }> {
    return col.kind === 'break';
  }

  private getPreviewSheetCells(
    sheet: { cells: Record<string, TimetableSlot[]> },
    day: string,
    period: number
  ): TimetableSlot[] {
    return sheet.cells[`${day}-${period}`] || [];
  }

  private isSameTimetableLesson(a: TimetableSlot, b: TimetableSlot): boolean {
    return a.subjectId === b.subjectId && a.teacherId === b.teacherId && a.classId === b.classId;
  }

  private sortDays(days: string[]): string[] {
    return [...new Set(days)].sort(
      (a, b) =>
        this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b) || a.localeCompare(b)
    );
  }

  private extractSchoolBranding(settings: any): { schoolName: string; schoolLogo: string | null } {
    let data = settings;
    if (Array.isArray(settings) && settings.length > 0) {
      data = settings[0];
    }
    const schoolName = (data?.schoolName || 'School').trim();
    let schoolLogo: string | null = null;
    const logo = data?.schoolLogo || data?.schoolLogo2;
    if (typeof logo === 'string' && logo.length > 0) {
      if (logo.startsWith('data:image')) {
        schoolLogo = logo;
      } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
        schoolLogo = logo;
      } else if (logo.length > 100) {
        schoolLogo = `data:image/png;base64,${logo}`;
      }
    }
    return { schoolName, schoolLogo };
  }

  private parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  private formatMinutesAsTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /** Contiguous periods (no break skip) — matches backend naive grid; used only to position break columns. */
  private naiveContiguousPeriodSlots(config: TimetableConfig): Array<{ startTime: string; endTime: string }> {
    const out: Array<{ startTime: string; endTime: string }> = [];
    const startM = this.parseTimeToMinutes(config.schoolStartTime);
    const dur = config.periodDurationMinutes || 40;
    for (let i = 0; i < config.periodsPerDay; i++) {
      const a = startM + i * dur;
      const b = a + dur;
      out.push({
        startTime: this.formatMinutesAsTime(a),
        endTime: this.formatMinutesAsTime(b),
      });
    }
    return out;
  }

  private buildBreakPeriodsForPreview(
    config: TimetableConfig | null,
    timeSlots: Array<{ startTime: string; endTime: string }>
  ): Array<{ period: number; name: string; startTime: string; endTime: string }> {
    const breakPeriods: Array<{
      period: number;
      name: string;
      startTime: string;
      endTime: string;
    }> = [];
    if (!config?.breakPeriods?.length) return breakPeriods;

    config.breakPeriods.forEach((breakPeriod) => {
      const breakStart = this.parseTimeToMinutes(breakPeriod.startTime);
      const breakEnd = this.parseTimeToMinutes(breakPeriod.endTime);
      for (let i = 0; i < timeSlots.length; i++) {
        const periodStart = this.parseTimeToMinutes(timeSlots[i].startTime);
        const periodEnd = this.parseTimeToMinutes(timeSlots[i].endTime);
        if (
          (breakStart >= periodStart && breakStart < periodEnd) ||
          (breakEnd > periodStart && breakEnd <= periodEnd) ||
          (breakStart <= periodStart && breakEnd >= periodEnd)
        ) {
          breakPeriods.push({
            period: i + 1,
            name: breakPeriod.name,
            startTime: breakPeriod.startTime,
            endTime: breakPeriod.endTime,
          });
          break;
        }
      }
    });
    return breakPeriods;
  }

  private buildTeacherPreviewColumns(
    allPeriods: number[],
    periodTimeSlots: Map<number, { startTime: string; endTime: string }>,
    breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }>
  ): TimetablePreviewColumn[] {
    const cols: TimetablePreviewColumn[] = [];
    for (let i = 0; i < allPeriods.length; i++) {
      const period = allPeriods[i];
      const breakBefore = breakPeriods.find((bp) => bp.period === period);
      if (breakBefore && i === 0) {
        cols.push({
          kind: 'break',
          label: breakBefore.name,
          timeStart: breakBefore.startTime,
          timeEnd: breakBefore.endTime,
        });
      }
      const ts = periodTimeSlots.get(period);
      cols.push({
        kind: 'period',
        period,
        timeStart: ts?.startTime || '',
        timeEnd: ts?.endTime || '',
      });
      const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
      if (breakAfter && i < allPeriods.length - 1) {
        cols.push({
          kind: 'break',
          label: breakAfter.name,
          timeStart: breakAfter.startTime,
          timeEnd: breakAfter.endTime,
        });
      }
    }
    return cols;
  }

  private buildPreviewSheetGridFromSlots(
    arr: TimetableSlot[],
    config: TimetableConfig | null,
    globalPeriodTimeSlots: Map<number, { startTime: string; endTime: string }>,
    breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }>
  ): {
    cells: Record<string, TimetableSlot[]>;
    daysOfWeek: string[];
    columns: TimetablePreviewColumn[];
  } {
    const cells: Record<string, TimetableSlot[]> = {};
    arr.forEach((slot) => {
      const k = `${slot.dayOfWeek}-${slot.periodNumber}`;
      if (!cells[k]) cells[k] = [];
      cells[k].push(slot);
    });

    let allPeriods: number[];
    let daysOfWeek: string[];
    let sheetPeriodMap: Map<number, { startTime: string; endTime: string }>;

    if (config) {
      allPeriods = Array.from({ length: config.periodsPerDay }, (_, idx) => idx + 1);
      daysOfWeek = this.sortDays([...config.daysOfWeek]);
      sheetPeriodMap = globalPeriodTimeSlots;
    } else {
      const pSet = new Set<number>();
      const dSet = new Set<string>();
      arr.forEach((s) => {
        pSet.add(s.periodNumber);
        dSet.add(s.dayOfWeek);
      });
      allPeriods = Array.from(pSet).sort((a, b) => a - b);
      daysOfWeek = this.sortDays(Array.from(dSet));
      sheetPeriodMap = new Map();
      allPeriods.forEach((p) => {
        const sample = arr.find((s) => s.periodNumber === p);
        if (sample?.startTime && sample?.endTime) {
          sheetPeriodMap.set(p, {
            startTime: sample.startTime,
            endTime: sample.endTime,
          });
        }
      });
    }

    const columns = this.buildTeacherPreviewColumns(
      allPeriods,
      sheetPeriodMap,
      config ? breakPeriods : []
    );

    return { cells, daysOfWeek, columns };
  }

  private resolveClassTeacherLabel(classId: string, classes: any[]): string | null {
    const c = classes.find((x) => String(x.id) === String(classId));
    if (c?.classTeacher) {
      const t = c.classTeacher;
      const fn = t.firstName ?? t.user?.firstName ?? '';
      const ln = t.lastName ?? t.user?.lastName ?? '';
      const name = `${fn} ${ln}`.trim();
      return name || null;
    }
    if (!c?.teachers?.length) {
      return null;
    }
    const t = c.teachers[0];
    const fn = t.firstName ?? t.user?.firstName ?? '';
    const ln = t.lastName ?? t.user?.lastName ?? '';
    const name = `${fn} ${ln}`.trim();
    return name || null;
  }

  private buildTeacherPreviewSheets(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    schoolName: string,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableTeacherPreviewSheet[] {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    const byTeacher = new Map<string, TimetableSlot[]>();
    teachingSlots.forEach((s) => {
      if (!byTeacher.has(s.teacherId)) byTeacher.set(s.teacherId, []);
      byTeacher.get(s.teacherId)!.push(s);
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = calculateTeachingPeriodTimesFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const naiveForBreakDetection = config
      ? this.naiveContiguousPeriodSlots(config)
      : timeSlots.length
        ? timeSlots
        : [{ startTime: '08:00', endTime: '08:40' }];

    const breakPeriods = this.buildBreakPeriodsForPreview(config, naiveForBreakDetection);

    return Array.from(byTeacher.entries())
      .map(([teacherId, arr]) => {
        const teacherName = this.teacherFullNameFromSlots(arr, teacherId);

        const { cells, daysOfWeek, columns } = this.buildPreviewSheetGridFromSlots(
          arr,
          config,
          periodTimeSlots,
          breakPeriods
        );

        return {
          teacherId,
          teacherName,
          schoolName,
          versionTitle,
          schoolLogo,
          daysOfWeek,
          columns,
          cells,
          generatedAtLabel,
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }

  private buildClassPreviewSheets(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    classes: any[],
    schoolName: string,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableClassPreviewSheet[] {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    const byClass = new Map<string, TimetableSlot[]>();
    teachingSlots.forEach((s) => {
      if (!byClass.has(s.classId)) byClass.set(s.classId, []);
      byClass.get(s.classId)!.push(s);
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = calculateTeachingPeriodTimesFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const naiveForBreakDetection = config
      ? this.naiveContiguousPeriodSlots(config)
      : timeSlots.length
        ? timeSlots
        : [{ startTime: '08:00', endTime: '08:40' }];

    const breakPeriods = this.buildBreakPeriodsForPreview(config, naiveForBreakDetection);

    return Array.from(byClass.entries())
      .map(([classId, arr]) => {
        const className = this.classNameFromSlots(arr, classId);
        const classTeacherLabel = this.resolveClassTeacherLabel(classId, classes);

        const { cells, daysOfWeek, columns } = this.buildPreviewSheetGridFromSlots(
          arr,
          config,
          periodTimeSlots,
          breakPeriods
        );

        return {
          classId,
          className,
          classTeacherLabel,
          schoolName,
          versionTitle,
          schoolLogo,
          daysOfWeek,
          columns,
          cells,
          generatedAtLabel,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }

  private buildConsolidatedPreviewSheet(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableConsolidatedPreviewSheet {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = calculateTeachingPeriodTimesFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const naiveForBreakDetection = config
      ? this.naiveContiguousPeriodSlots(config)
      : timeSlots.length
        ? timeSlots
        : [{ startTime: '08:00', endTime: '08:40' }];

    const breakPeriods = this.buildBreakPeriodsForPreview(config, naiveForBreakDetection);

    let allPeriods: number[];
    let daysOfWeek: string[];
    let sheetPeriodMap: Map<number, { startTime: string; endTime: string }>;

    if (config) {
      allPeriods = Array.from({ length: config.periodsPerDay }, (_, idx) => idx + 1);
      daysOfWeek = this.sortDays([...config.daysOfWeek]);
      sheetPeriodMap = periodTimeSlots;
    } else {
      const pSet = new Set<number>();
      const dSet = new Set<string>();
      teachingSlots.forEach((s) => {
        pSet.add(s.periodNumber);
        dSet.add(s.dayOfWeek);
      });
      allPeriods = Array.from(pSet).sort((a, b) => a - b);
      daysOfWeek = this.sortDays(Array.from(dSet));
      sheetPeriodMap = new Map();
      allPeriods.forEach((p) => {
        const sample = teachingSlots.find((s) => s.periodNumber === p);
        if (sample?.startTime && sample?.endTime) {
          sheetPeriodMap.set(p, {
            startTime: sample.startTime,
            endTime: sample.endTime,
          });
        }
      });
    }

    const dayStripColumns = this.buildTeacherPreviewColumns(
      allPeriods,
      sheetPeriodMap,
      config ? breakPeriods : []
    );

    const cellMap: Record<string, TimetableSlot> = {};
    teachingSlots.forEach((s) => {
      const k = `${s.teacherId}|${s.dayOfWeek}|${s.periodNumber}`;
      if (!cellMap[k]) {
        cellMap[k] = s;
      }
    });

    const teacherIds = [...new Set(teachingSlots.map((x) => x.teacherId))];
    const teachers = teacherIds
      .map((teacherId) => ({
        teacherId,
        teacherName: this.teacherFullNameFromSlots(teachingSlots, teacherId),
      }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    return {
      versionTitle,
      schoolLogo,
      generatedAtLabel,
      daysOfWeek,
      dayStripColumns,
      teachers,
      cellMap,
    };
  }
}
