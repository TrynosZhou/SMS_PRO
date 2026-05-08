import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ParentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLinkedStudents(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/students`);
  }

  searchStudents(query: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/search-students`, { params: { query } });
  }

  linkStudent(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student`, { studentId });
  }

  linkStudentByIdAndDob(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student-by-id-dob`, {
      studentId
    });
  }

  unlinkStudent(studentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/unlink-student/${studentId}`);
  }
}

