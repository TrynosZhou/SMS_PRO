import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TransferRequest {
  studentId: string;
  transferType: 'internal' | 'external';
  newClassId?: string;
  destinationSchool?: string;
  reason?: string;
  effectiveDate?: string;
  notes?: string;
}

export interface StudentTransfer {
  id: string;
  studentId: string;
  student?: any;
  transferType: 'internal' | 'external';
  previousClassId?: string;
  previousClass?: any;
  newClassId?: string;
  newClass?: any;
  destinationSchool?: string;
  fromSchoolName?: string;
  toSchoolName?: string;
  reason?: string;
  transferDate: string;
  effectiveDate?: string;
  processedByUserId: string;
  processedBy?: any;
  createdAt: string;
  notes?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root'
})
export class TransferService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  initiateTransfer(transfer: TransferRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/transfers`, transfer);
  }

  getStudentTransferHistory(studentId: string): Observable<StudentTransfer[]> {
    return this.http.get<StudentTransfer[]>(`${this.apiUrl}/transfers/student/${studentId}`);
  }

  getAllTransfers(filters?: {
    transferType?: 'internal' | 'external';
    classId?: string;
    studentId?: string;
    studentName?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Observable<PaginatedResponse<StudentTransfer> | StudentTransfer[]> {
    let params = new HttpParams();
    if (filters) {
      if (filters.transferType) params = params.set('transferType', filters.transferType);
      if (filters.classId) params = params.set('classId', filters.classId);
      if (filters.studentId) params = params.set('studentId', filters.studentId);
      if (filters.studentName) params = params.set('studentName', filters.studentName);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
    }
    return this.http.get<PaginatedResponse<StudentTransfer> | StudentTransfer[]>(`${this.apiUrl}/transfers`, { params });
  }

  getTransferById(id: string): Observable<StudentTransfer> {
    return this.http.get<StudentTransfer>(`${this.apiUrl}/transfers/${id}`);
  }
}

