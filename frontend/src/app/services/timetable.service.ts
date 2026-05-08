import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TimetableConfig {
  id?: string;
  periodsPerDay: number;
  schoolStartTime: string;
  schoolEndTime: string;
  periodDurationMinutes: number;
  breakPeriods?: Array<{
    name: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }>;
  lessonsPerWeek?: { [subjectId: string]: number };
  daysOfWeek: string[];
  additionalPreferences?: { [key: string]: any };
  isActive?: boolean;
}

export interface TimetableVersion {
  id: string;
  name: string;
  description?: string;
  configId?: string;
  isActive: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  slots?: TimetableSlot[];
}

export interface TimetableSlot {
  id: string;
  versionId: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  dayOfWeek: string;
  periodNumber: number;
  startTime?: string;
  endTime?: string;
  room?: string;
  isBreak: boolean;
  isManuallyEdited: boolean;
  /** When true, the lesson cannot be moved until unlocked (manual adjustments). */
  isLocked?: boolean;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
    teacherId: string;
    gender?: string | null;
    maritalStatus?: string | null;
  };
  class?: { id: string; name: string; form?: string };
  subject?: { id: string; name: string; code: string; shortTitle?: string | null };
}

@Injectable({
  providedIn: 'root'
})
export class TimetableService {
  private apiUrl = `${environment.apiUrl}/timetable`;

  constructor(private http: HttpClient) {}

  getConfig(): Observable<TimetableConfig> {
    return this.http.get<TimetableConfig>(`${this.apiUrl}/config`);
  }

  saveConfig(config: TimetableConfig): Observable<{ message: string; config: TimetableConfig }> {
    return this.http.post<{ message: string; config: TimetableConfig }>(`${this.apiUrl}/config`, config);
  }

  /** Updates active config lessonsPerWeek[subjectId] (keeps other subjects; same store as Timetable → Configuration). */
  mergeSubjectLessonsInActiveConfig(
    subjectId: string,
    lessonsPerWeek: number
  ): Observable<{ message: string; config: TimetableConfig }> {
    return this.http.post<{ message: string; config: TimetableConfig }>(
      `${this.apiUrl}/config/merge-subject-lessons`,
      { subjectId, lessonsPerWeek }
    );
  }

  generateTimetable(versionName?: string, description?: string): Observable<{
    message: string;
    version: TimetableVersion;
    stats: { totalSlots: number; teachers: number; classes: number; subjects: number };
  }> {
    return this.http.post<{
      message: string;
      version: TimetableVersion;
      stats: { totalSlots: number; teachers: number; classes: number; subjects: number };
    }>(`${this.apiUrl}/generate`, { versionName, description });
  }

  getVersions(): Observable<TimetableVersion[]> {
    return this.http.get<TimetableVersion[]>(`${this.apiUrl}/versions`);
  }

  activateVersion(versionId: string): Observable<{ message: string; version: TimetableVersion }> {
    return this.http.post<{ message: string; version: TimetableVersion }>(
      `${this.apiUrl}/versions/${versionId}/activate`,
      {}
    );
  }

  deleteVersion(versionId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/versions/${versionId}`);
  }

  getSlots(versionId: string, teacherId?: string, classId?: string): Observable<TimetableSlot[]> {
    let url = `${this.apiUrl}/versions/${versionId}/slots`;
    const params: string[] = [];
    if (teacherId) params.push(`teacherId=${teacherId}`);
    if (classId) params.push(`classId=${classId}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get<TimetableSlot[]>(url);
  }

  updateSlot(
    slotId: string,
    updates: Partial<TimetableSlot> & { ignoreCollisions?: boolean }
  ): Observable<{ message: string; slot: TimetableSlot }> {
    return this.http.put<{ message: string; slot: TimetableSlot }>(`${this.apiUrl}/slots/${slotId}`, updates);
  }

  deleteSlot(slotId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/slots/${slotId}`);
  }

  downloadTeacherTimetablePDF(versionId: string, teacherId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/versions/${versionId}/teachers/${teacherId}/pdf`, {
      responseType: 'blob'
    });
  }

  downloadClassTimetablePDF(versionId: string, classId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/versions/${versionId}/classes/${classId}/pdf`, {
      responseType: 'blob'
    });
  }

  downloadConsolidatedTimetablePDF(versionId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/versions/${versionId}/consolidated/pdf`, {
      responseType: 'blob'
    });
  }

  /** Admin only: wipes all teaching loads and class–teacher assignments. */
  clearAllTeachingData(): Observable<{ message: string; cleared: string[] }> {
    return this.http.delete<{ message: string; cleared: string[] }>(`${this.apiUrl}/teaching-data`);
  }
}

