import { TimetableSlot } from '../../services/timetable.service';

/** One column in the teacher preview grid (period or break), matching PDF layout. */
export type TimetablePreviewColumn =
  | { kind: 'period'; period: number; timeStart: string; timeEnd: string }
  | { kind: 'break'; label: string; timeStart: string; timeEnd: string };

/** Landscape-style teacher sheet (days = rows, periods = columns). */
export interface TimetableTeacherPreviewSheet {
  teacherId: string;
  teacherName: string;
  schoolName: string;
  versionTitle: string;
  schoolLogo: string | null;
  daysOfWeek: string[];
  columns: TimetablePreviewColumn[];
  cells: Record<string, TimetableSlot[]>;
  generatedAtLabel: string;
}

/** Same grid layout as teacher preview, one sheet per class. */
export interface TimetableClassPreviewSheet {
  classId: string;
  className: string;
  classTeacherLabel: string | null;
  schoolName: string;
  versionTitle: string;
  schoolLogo: string | null;
  daysOfWeek: string[];
  columns: TimetablePreviewColumn[];
  cells: Record<string, TimetableSlot[]>;
  generatedAtLabel: string;
}

/** One row segment for class preview body (break column, empty period, or merged lesson). */
export type ClassPreviewDaySegment =
  | { kind: 'break'; label: string; timeStart: string; timeEnd: string }
  | { kind: 'empty'; colspan: number }
  | { kind: 'lesson'; colspan: number; slots: TimetableSlot[] };

/** Matches consolidated PDF: each teacher row × (per day: same period/break strip). */
export interface TimetableConsolidatedPreviewSheet {
  versionTitle: string;
  schoolLogo: string | null;
  generatedAtLabel: string;
  daysOfWeek: string[];
  dayStripColumns: TimetablePreviewColumn[];
  teachers: { teacherId: string; teacherName: string }[];
  cellMap: Record<string, TimetableSlot>;
}
