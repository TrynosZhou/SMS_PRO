import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ParentManagementService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getParents(search?: string): Observable<any> {
    const options = search?.trim() ? { params: { search: search.trim() } } : {};
    return this.http.get(`${this.apiUrl}/admin/parents`, options);
  }

  createParentAccount(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    address?: string;
    gender?: string;
    password?: string;
    generatePassword?: boolean;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/parents`, data);
  }

  resetParentPassword(parentId: string, data: { newPassword?: string; generatePassword?: boolean }): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/parents/${parentId}/reset-password`, data);
  }

  getParentById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/parents/${id}`);
  }

  updateParent(id: string, data: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string; address?: string; gender?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/parents/${id}`, data);
  }

  deleteParent(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/parents/${id}`);
  }

  linkStudent(parentId: string, studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/parents/${parentId}/link-student`, { studentId });
  }

  bulkLinkStudents(parentId: string, studentIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/parents/${parentId}/link-students`, { studentIds });
  }

  unlinkStudent(parentId: string, studentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/parents/${parentId}/students/${studentId}`);
  }

  searchStudents(query: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/search-students`, { params: { query } });
  }
}
