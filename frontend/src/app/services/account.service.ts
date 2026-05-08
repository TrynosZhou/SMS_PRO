import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getAccountInfo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/account`);
  }

  updateAccount(data: { newUsername?: string; newEmail?: string; currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/account`, data);
  }

  /**
   * Admin: reset a teacher user's password; API returns temporaryPassword and username.
   */
  adminResetTeacherPassword(userId: string): Observable<{
    message: string;
    temporaryPassword: string;
    username: string;
  }> {
    return this.http.post<{
      message: string;
      temporaryPassword: string;
      username: string;
    }>(`${this.apiUrl}/account/users/${userId}/reset-password`, {});
  }

  createUserAccount(data: {
    email?: string;
    username?: string;
    role: string;
    password?: string;
    generatePassword?: boolean;
    isDemo?: boolean;
    /** Required when role is `hod` (backend validates). */
    departmentId?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/account/users`, data);
  }
}

