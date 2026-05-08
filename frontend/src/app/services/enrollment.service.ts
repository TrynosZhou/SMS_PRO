import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EnrollmentRequest {
  studentId: string;
  classId: string;
  enrollmentDate?: string;
  notes?: string;
}

export interface WithdrawalRequest {
  studentId: string;
  withdrawalDate?: string;
  notes?: string;
}

export interface StudentEnrollment {
  id: string;
  studentId: string;
  student?: any;
  classId: string;
  classEntity?: any;
  enrollmentDate: string;
  withdrawalDate?: string | null;
  isActive: boolean;
  enrolledByUserId: string;
  enrolledBy?: any;
  withdrawnByUserId?: string | null;
  withdrawnBy?: any;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class EnrollmentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  enrollStudent(enrollment: EnrollmentRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/enrollments`, enrollment);
  }

  withdrawStudent(withdrawal: WithdrawalRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/enrollments/withdraw`, withdrawal);
  }

  getUnenrolledStudents(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/enrollments/unenrolled`);
  }

  getStudentEnrollmentHistory(studentId: string): Observable<StudentEnrollment[]> {
    return this.http.get<StudentEnrollment[]>(`${this.apiUrl}/enrollments/student/${studentId}`);
  }

  getAllEnrollments(filters?: {
    classId?: string;
    studentId?: string;
    isActive?: boolean;
    startDate?: string;
    endDate?: string;
  }): Observable<StudentEnrollment[]> {
    let params = new HttpParams();
    if (filters) {
      if (filters.classId) params = params.set('classId', filters.classId);
      if (filters.studentId) params = params.set('studentId', filters.studentId);
      if (filters.isActive !== undefined) params = params.set('isActive', filters.isActive.toString());
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
    }
    return this.http.get<StudentEnrollment[]>(`${this.apiUrl}/enrollments`, { params });
  }
}

