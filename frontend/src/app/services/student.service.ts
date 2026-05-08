import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Observer } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getStudents(options: {
    classId?: string;
    enrollmentStatus?: string;
    page?: number;
    limit?: number;
    search?: string;
    gender?: string;
    studentType?: string;
  } = {}): Observable<any> {
    const params: any = {};
    if (options.classId) params.classId = options.classId;
    if (options.enrollmentStatus) params.enrollmentStatus = options.enrollmentStatus;
    if (options.page) params.page = String(options.page);
    if (options.limit) params.limit = String(options.limit);
    if (options.search) params.search = options.search;
    if (options.gender) params.gender = options.gender;
    if (options.studentType) params.studentType = options.studentType;

    return this.http.get(`${this.apiUrl}/students`, { params });
  }

  getStudentById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/${id}`);
  }

  /** Logged-in student's profile (includes fullName). */
  getCurrentStudent(): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/me`);
  }

  createStudent(student: any, photo?: File): Observable<any> {
    if (photo) {
      const formData = new FormData();
      Object.keys(student).forEach(key => {
        if (student[key] !== null && student[key] !== undefined) {
          formData.append(key, student[key]);
        }
      });
      formData.append('photo', photo);
      return this.http.post(`${this.apiUrl}/students`, formData);
    }
    return this.http.post(`${this.apiUrl}/students`, student);
  }

  updateStudent(id: string, student: any, photo?: File): Observable<any> {
    if (photo) {
      const formData = new FormData();
      Object.keys(student).forEach(key => {
        if (student[key] !== null && student[key] !== undefined) {
          formData.append(key, student[key]);
        }
      });
      formData.append('photo', photo);
      return this.http.put(`${this.apiUrl}/students/${id}`, formData);
    }
    return this.http.put(`${this.apiUrl}/students/${id}`, student);
  }

  enrollStudent(studentId: string, classId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/enroll`, { studentId, classId });
  }

  deleteStudent(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/students/${id}`);
  }

  promoteStudents(fromClassId: string, toClassId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/promote`, { fromClassId, toClassId });
  }

  getPromotePreview(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/students/promote/preview`);
  }

  promoteAllStudents(): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/promote-all`, {});
  }

  getStudentIdCard(id: string): Observable<Blob> {
    // Cache-bust so a new passport photo shows immediately after upload (avoid stale PDF).
    const url = `${this.apiUrl}/students/${encodeURIComponent(id)}/id-card?_=${Date.now()}`;
    return this.http.get(url, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map((response: any) => {
        const blob = response.body;
        const contentType = response.headers.get('content-type') || '';
        const status = response.status;
        
        // Check if response is PDF
        if (status === 200 && contentType.includes('application/pdf')) {
          return blob;
        }
        
        // If status is not 200 or not PDF, it's an error
        // The body might be a JSON error message as text/blob
        throw { status, blob, contentType };
      }),
      catchError((error: any) => {
        // Handle different error scenarios
        if (error.status && error.blob) {
          // Error response with blob body (JSON error as blob)
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                const httpError = new HttpErrorResponse({
                  error: { message: 'Failed to parse error response' },
                  status: error.status || 500,
                  statusText: 'Error'
                });
                observer.error(httpError);
              }
            };
            reader.onerror = () => {
              const httpError = new HttpErrorResponse({
                error: { message: 'Failed to read error response' },
                status: error.status || 500,
                statusText: 'Error'
              });
              observer.error(httpError);
            };
            reader.readAsText(error.blob);
          });
        } else if (error.error instanceof Blob) {
          // Standard HttpErrorResponse with blob error
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status || 500,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                observer.error(error);
              }
            };
            reader.onerror = () => observer.error(error);
            reader.readAsText(error.error);
          });
        }
        // For non-blob errors, return as-is
        return throwError(() => error);
      })
    );
  }

  /**
   * Multi-page PDF: ID cards for all active students in a class.
   * download=true → attachment; false/omit → inline (open in browser for print preview).
   */
  getClassStudentIdCardsPdf(classId: string, options?: { download?: boolean }): Observable<Blob> {
    const params: Record<string, string> = {};
    if (options?.download) {
      params['download'] = '1';
    }
    return this.http.get(`${this.apiUrl}/students/class/${encodeURIComponent(classId)}/id-cards-pdf`, {
      responseType: 'blob',
      observe: 'response',
      params
    }).pipe(
      map((response: any) => {
        const blob = response.body;
        const contentType = response.headers.get('content-type') || '';
        const status = response.status;

        if (status === 200 && contentType.includes('application/pdf')) {
          return blob;
        }

        throw { status, blob, contentType };
      }),
      catchError((error: any) => {
        if (error.status && error.blob) {
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                const httpError = new HttpErrorResponse({
                  error: { message: 'Failed to parse error response' },
                  status: error.status || 500,
                  statusText: 'Error'
                });
                observer.error(httpError);
              }
            };
            reader.onerror = () => {
              const httpError = new HttpErrorResponse({
                error: { message: 'Failed to read error response' },
                status: error.status || 500,
                statusText: 'Error'
              });
              observer.error(httpError);
            };
            reader.readAsText(error.blob);
          });
        } else if (error.error instanceof Blob) {
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status || 500,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                observer.error(error);
              }
            };
            reader.onerror = () => observer.error(error);
            reader.readAsText(error.error);
          });
        }
        return throwError(() => error);
      })
    );
  }

  getDHServicesReport(): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/reports/dh-services`);
  }

  getTransportServicesReport(): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/reports/transport-services`);
  }

  downloadClassListPDF(classId: string, term: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/students/class-list/pdf`, {
      params: { classId, term },
      responseType: 'blob'
    });
  }

  getStudentReportCard(): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/dashboard/report-card`);
  }

  downloadStudentReportCardPDF(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/students/dashboard/report-card/pdf`, {
      responseType: 'blob'
    });
  }

  getStudentInvoiceBalance(): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/dashboard/invoice-balance`);
  }
}

