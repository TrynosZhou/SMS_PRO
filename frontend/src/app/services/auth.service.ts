import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  username?: string;
  role: string;
  mustChangePassword?: boolean;
  isTemporaryAccount?: boolean;
  isDemo?: boolean;
  student?: any;
  teacher?: any;
  parent?: any;
  classes?: any[]; // Classes assigned to teacher (for teacher role)
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private readonly inactivityTimeoutMs = (environment.sessionTimeoutMinutes || 30) * 60 * 1000;
  private inactivityTimer: any = null;
  private readonly activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  private activityListener = () => this.resetInactivityTimer();
  private activityListenersAttached = false;
  private readonly logoutMessageKey = 'sessionMessage';

  constructor(private http: HttpClient, private router: Router) {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      this.currentUserSubject.next(JSON.parse(user));
      this.startInactivityTracking();
    }

    this.router.events.subscribe(() => {
      if (this.isAuthenticated()) {
        this.resetInactivityTimer();
      }
    });
  }

  login(identifier: string, password: string, teacherId?: string): Observable<any> {
    // Use username for login (email is optional for non-teachers)
    // For teachers, only username is used
    const loginData: any = { username: identifier, password };
    
    // Only add email if it's actually an email (contains @) and not a teacher login
    // This maintains backward compatibility for non-teacher accounts
    if (identifier.includes('@')) {
      loginData.email = identifier;
    }
    
    // Note: teacherId is no longer required for teacher login
    // Only add it if explicitly provided (for optional verification)
    if (teacherId && teacherId.trim()) {
      loginData.teacherId = teacherId.trim();
    }
    
    return this.http.post(`${this.apiUrl}/auth/login`, loginData).pipe(
      tap((response: any) => {
        if (response && response.token && response.user) {
          // Store token and user synchronously
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          // Update BehaviorSubject immediately
          this.currentUserSubject.next(response.user);
          this.startInactivityTracking();
        } else {
          console.error('Invalid login response:', response);
          throw new Error('Invalid response from server');
        }
      })
    );
  }

  studentLogin(studentId: string, dateOfBirth: string): Observable<any> {
    const loginData = { studentId, dateOfBirth };
    
    console.log('[AuthService] Student login called:', { studentId, dateOfBirth });
    console.log('[AuthService] Calling endpoint:', `${this.apiUrl}/auth/student/login`);
    
    return this.http.post(`${this.apiUrl}/auth/student/login`, loginData).pipe(
      tap((response: any) => {
        if (response && response.token && response.user) {
          // Store token and user synchronously
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          // Update BehaviorSubject immediately
          this.currentUserSubject.next(response.user);
          this.startInactivityTracking();
        } else {
          console.error('Invalid login response:', response);
          throw new Error('Invalid response from server');
        }
      })
    );
  }

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, data);
  }

  logout(reason: 'manual' | 'timeout' | 'unauthorized' = 'manual'): void {
    const currentUser = this.getCurrentUser();
    const userId = currentUser?.id;

    this.stopInactivityTracking();
    
    // Update logout time in the backend (used by Activity Log).
    // This endpoint does not require auth, so we can call it even after clearing local storage.
    this.http.post(`${this.apiUrl}/auth/logout`, { userId, reason }).subscribe({
      next: () => {},
      error: () => {}
    });

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);

    if (reason === 'timeout') {
      sessionStorage.setItem(this.logoutMessageKey, 'Your session has expired due to inactivity. Please log in again.');
    } else if (reason === 'unauthorized') {
      sessionStorage.setItem(this.logoutMessageKey, 'Your session has expired. Please log in again.');
    }

    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();
    // Check both token and user to ensure authentication is complete
    return !!(token && user);
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password`, { email });
  }

  verifyStudentPasswordReset(studentNumber: string, dateOfBirth: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/student/verify`, {
      studentNumber,
      dateOfBirth,
    });
  }

  verifyTeacherPasswordReset(teacherId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/teacher/verify`, { teacherId });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/confirm`, { token, newPassword });
  }

  getParentStudents(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/students`);
  }

  linkStudent(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student`, { studentId });
  }

  unlinkStudent(studentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/unlink-student/${studentId}`);
  }

  private startInactivityTracking(): void {
    if (!this.isBrowser() || !this.isAuthenticated()) {
      return;
    }
    this.registerActivityListeners();
    this.resetInactivityTimer();
  }

  private stopInactivityTracking(): void {
    if (!this.isBrowser()) {
      return;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.activityListenersAttached) {
      this.activityEvents.forEach(event => window.removeEventListener(event, this.activityListener, true));
      this.activityListenersAttached = false;
    }
  }

  private registerActivityListeners(): void {
    if (!this.isBrowser() || this.activityListenersAttached) {
      return;
    }
    this.activityEvents.forEach(event => window.addEventListener(event, this.activityListener, true));
    this.activityListenersAttached = true;
  }

  private resetInactivityTimer(): void {
    if (!this.isBrowser()) return;
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = window.setTimeout(() => this.handleSessionTimeout(), this.inactivityTimeoutMs);
  }

  private handleSessionTimeout(): void {
    this.logout('timeout');
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }
}

