import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DepartmentsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/settings/departments`);
  }

  create(body: { name: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/departments`, body);
  }

  update(id: string, body: { name?: string; isActive?: boolean }): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings/departments/${id}`, body);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/settings/departments/${id}`);
  }

  /** Assign subjects to a department (each subject can belong to only one department). */
  setDepartmentSubjects(id: string, subjectIds: string[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings/departments/${id}/subjects`, { subjectIds });
  }
}

