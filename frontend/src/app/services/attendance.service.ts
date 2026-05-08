import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  markAttendance(classId: string, date: string, attendanceData: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/attendance`, {
      classId,
      date,
      attendanceData
    });
  }

  getAttendance(params?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/attendance`, { params });
  }

  getAttendanceReport(params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/attendance/report`, { params });
  }

  getStudentTotalAttendance(studentId: string, term?: string): Observable<any> {
    const params: any = { studentId };
    if (term) {
      params.term = term;
    }
    return this.http.get(`${this.apiUrl}/attendance/student/total`, { params });
  }
}

