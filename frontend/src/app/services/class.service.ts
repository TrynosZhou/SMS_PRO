import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ClassService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getClasses(options: { page?: number; limit?: number; search?: string } = {}): Observable<any> {
    const params: any = {};
    if (options.page) params.page = String(options.page);
    if (options.limit) params.limit = String(options.limit);
    if (options.search) params.search = options.search;
    return this.http.get(`${this.apiUrl}/classes`, { params });
  }

  getClassById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/classes/${id}`);
  }

  /** Teacher–subject lesson lines (timetable contract) for one class. */
  getClassContractLessons(classId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/classes/${classId}/contract-lessons`);
  }

  /** Weekly period availability: cells[day][period] — 0 available, 1 conditional, 2 time off. */
  getClassTimeOff(classId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/classes/${classId}/time-off`);
  }

  /** All classes at once — same shape as single-class time-off. */
  getAllClassesTimeOffBulk(): Observable<any> {
    return this.http.get(`${this.apiUrl}/classes/time-off/bulk`);
  }

  saveClassTimeOff(classId: string, cells: number[][]): Observable<any> {
    return this.http.put(`${this.apiUrl}/classes/${classId}/time-off`, { cells });
  }

  createClass(classData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/classes`, classData);
  }

  updateClass(id: string, classData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/classes/${id}`, classData);
  }

  deleteClass(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/classes/${id}`);
  }

  /**
   * Sort classes in ascending order by name
   * @param classes Array of class objects
   * @returns Sorted array of classes
   */
  sortClasses(classes: any[]): any[] {
    if (!Array.isArray(classes)) return [];
    return [...classes].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim();
      const nameB = (b.name || '').toLowerCase().trim();
      return nameA.localeCompare(nameB);
    });
  }
}

