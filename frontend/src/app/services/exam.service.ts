import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, Observer, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getExams(classId?: string): Observable<any> {
    const options: any = {};
    if (classId) {
      options.params = { classId };
    }
    return this.http.get(`${this.apiUrl}/exams`, options);
  }

  getExamById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/${id}`);
  }

  createExam(exam: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams`, exam);
  }

  captureMarks(examId: string, marksData: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/marks`, { examId, marksData });
  }

  getMarks(examId?: string, studentId?: string, classId?: string): Observable<any> {
    const params: any = {};
    if (examId) params.examId = examId;
    if (studentId) params.studentId = studentId;
    if (classId) params.classId = classId;
    return this.http.get(`${this.apiUrl}/exams/marks`, { params });
  }

  getClassRankings(examId: string, classId?: string): Observable<any> {
    const params: any = { examId };
    if (classId) params.classId = classId;
    return this.http.get(`${this.apiUrl}/exams/rankings/class`, { params });
  }

  getClassRankingsByType(examType: string, classId: string): Observable<any> {
    const params: any = { examType, classId };
    return this.http.get(`${this.apiUrl}/exams/rankings/class-by-type`, { params });
  }

  getSubjectRankings(examId: string, subjectId: string, classId?: string): Observable<any> {
    const params: any = { examId, subjectId };
    if (classId) params.classId = classId;
    return this.http.get(`${this.apiUrl}/exams/rankings/subject`, { params });
  }

  getSubjectRankingsByType(examType: string, subjectId: string): Observable<any> {
    const params: any = { examType, subjectId };
    return this.http.get(`${this.apiUrl}/exams/rankings/subject-by-type`, { params });
  }

  getFormRankings(examId: string, form: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/rankings/form`, { params: { examId, form } });
  }

  getOverallPerformanceRankings(form: string, examType: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/rankings/overall-performance`, { params: { form, examType } });
  }

  /**
   * Server-generated rankings PDF (same data as the on-screen table). Opens inline in browser for preview/print.
   */
  getRankingsPdf(body: {
    rankingType: string;
    examTypeLabel: string;
    filterSubtitle: string;
    rankings: any[];
  }): Observable<Blob> {
    return this.http
      .post(`${this.apiUrl}/exams/rankings/pdf`, body, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
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
                  observer.error(
                    new HttpErrorResponse({
                      error: errorJson,
                      status: error.status,
                      statusText: error.statusText || 'Error'
                    })
                  );
                } catch (e) {
                  observer.error(
                    new HttpErrorResponse({
                      error: { message: 'Failed to parse error response' },
                      status: error.status || 500,
                      statusText: 'Error'
                    })
                  );
                }
              };
              reader.onerror = () => {
                observer.error(
                  new HttpErrorResponse({
                    error: { message: 'Failed to read error response' },
                    status: error.status || 500,
                    statusText: 'Error'
                  })
                );
              };
              reader.readAsText(error.blob);
            });
          }
          if (error.error instanceof Blob) {
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
                  observer.error(
                    new HttpErrorResponse({
                      error: errorJson,
                      status: error.status || 500,
                      statusText: error.statusText || 'Error'
                    })
                  );
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

  getReportCard(classId: string, examType: string, term: string, studentId?: string, subjectId?: string): Observable<any> {
    const url = `${this.apiUrl}/exams/report-card`;
    const params: any = {};
    
    // Only add defined and non-empty parameters
    if (classId) params.classId = String(classId).trim();
    if (examType) params.examType = String(examType).trim();
    if (term) params.term = String(term).trim();
    if (studentId && studentId.trim() !== '') {
      params.studentId = String(studentId).trim();
    }
    if (subjectId && subjectId.trim() !== '') {
      params.subjectId = String(subjectId).trim();
    }
    
    console.log('Requesting report card:', url, params);
    return this.http.get(url, { params });
  }

  getResultsAnalysis(classId: string, examType: string, term: string): Observable<any> {
    const params: any = { classId, examType, term };
    return this.http.get(`${this.apiUrl}/exams/results-analysis`, { params });
  }

  getResultsAnalysisForSubject(classId: string, examType: string, term: string, subjectId: string): Observable<any> {
    const params: any = { classId, examType, term, subjectId };
    return this.http.get(`${this.apiUrl}/exams/results-analysis/subject`, { params });
  }

  downloadReportCardPDF(studentId: string, examId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, {
      params: { studentId, examId },
      responseType: 'blob'
    });
  }

  downloadAllReportCardsPDF(classId: string, examType: string, term: string, studentId: string): Observable<Blob> {
    // For individual student PDF download from the generated report cards
    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, {
      params: { classId, examType, term, studentId },
      responseType: 'blob'
    });
  }

  saveReportCardRemarks(studentId: string, classId: string, examType: string, classTeacherRemarks: string, headmasterRemarks: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/report-card/remarks`, {
      studentId,
      classId,
      examType,
      classTeacherRemarks,
      headmasterRemarks
    });
  }

  deleteExam(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/exams/${id}`);
  }

  deleteAllExams(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/exams/all`);
  }

  generateMarkSheet(classId: string, examType: string, term?: string): Observable<any> {
    const params: any = { classId, examType };
    if (term) params.term = term;
    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, { params });
  }

  /**
   * Server-generated mark sheet PDF (same content as the on-screen mark sheet).
   * download=true → Content-Disposition attachment; false/omit → inline (browser viewer / print preview).
   */
  getMarkSheetPdf(
    classId: string,
    examType: string,
    term?: string,
    subjectId?: string,
    options?: { download?: boolean }
  ): Observable<Blob> {
    const params: Record<string, string> = {
      classId,
      examType
    };
    if (term) params['term'] = term;
    if (subjectId) params['subjectId'] = subjectId;
    if (options?.download) {
      params['download'] = '1';
    }
    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, {
      params,
      responseType: 'blob',
      observe: 'response'
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
                observer.error(
                  new HttpErrorResponse({
                    error: errorJson,
                    status: error.status,
                    statusText: error.statusText || 'Error'
                  })
                );
              } catch (e) {
                observer.error(
                  new HttpErrorResponse({
                    error: { message: 'Failed to parse error response' },
                    status: error.status || 500,
                    statusText: 'Error'
                  })
                );
              }
            };
            reader.onerror = () => {
              observer.error(
                new HttpErrorResponse({
                  error: { message: 'Failed to read error response' },
                  status: error.status || 500,
                  statusText: 'Error'
                })
              );
            };
            reader.readAsText(error.blob);
          });
        }
        if (error.error instanceof Blob) {
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
                observer.error(
                  new HttpErrorResponse({
                    error: errorJson,
                    status: error.status || 500,
                    statusText: error.statusText || 'Error'
                  })
                );
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

  /** @deprecated Use getMarkSheetPdf(..., { download: true }) */
  downloadMarkSheetPDF(classId: string, examType: string, term?: string, subjectId?: string): Observable<Blob> {
    return this.getMarkSheetPdf(classId, examType, term, subjectId, { download: true });
  }

  publishExam(examId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish`, { examId });
  }

  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, { examType, term });
  }

  unpublishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/unpublish-by-type`, { examType, term });
  }

  moderateMarks(classId: string, subjectId: string, examType: string, targetMin?: number, targetMax?: number): Observable<any> {
    const body: any = { classId, subjectId, examType };
    if (targetMin !== undefined) body.targetMin = targetMin;
    if (targetMax !== undefined) body.targetMax = targetMax;
    return this.http.post(`${this.apiUrl}/exams/moderate-marks`, body);
  }

  saveModeratedMarks(classId: string, subjectId: string, examType: string, moderatedResults: any[]): Observable<any> {
    const body = { classId, subjectId, examType, moderatedResults };
    return this.http.post(`${this.apiUrl}/exams/save-moderated-marks`, body);
  }

  getMarkInputProgress(examId?: string, subjectId?: string, term?: string, examType?: string): Observable<any> {
    const params: any = {};
    if (examId) params.examId = examId;
    if (subjectId) params.subjectId = subjectId;
    if (term) params.term = term;
    if (examType) params.examType = examType;
    return this.http.get(`${this.apiUrl}/exams/mark-input-progress`, { params });
  }

  getMarkInputProgressByClassSubjects(classId: string, term?: string, examType?: string): Observable<any> {
    const params: any = { classId };
    if (term) params.term = term;
    if (examType) params.examType = examType;
    return this.http.get(`${this.apiUrl}/exams/mark-input-progress/class-subjects`, { params });
  }

  getMarkInputProgressAllClassesSubjects(term?: string, examType?: string): Observable<any> {
    const params: any = {};
    if (term) params.term = term;
    if (examType) params.examType = examType;
    return this.http.get(`${this.apiUrl}/exams/mark-input-progress/all-classes-subjects`, { params });
  }

  generateAIRemark(studentId: string, subjectId: string, score: number, maxScore: number = 100): Observable<any> {
    console.log('Calling AI remark generation API:', {
      url: `${this.apiUrl}/exams/generate-ai-remark`,
      studentId,
      subjectId,
      score,
      maxScore
    });
    return this.http.post(`${this.apiUrl}/exams/generate-ai-remark`, {
      studentId,
      subjectId,
      score,
      maxScore
    });
  }

  /** AI suggestion for class teacher or headmaster report card remarks (context built on client). */
  generateAIReportRemark(
    studentId: string,
    remarkType: 'class_teacher' | 'headmaster',
    context: Record<string, unknown>,
    classId?: string,
    examType?: string
  ): Observable<{ remark: string; generatedAt?: string }> {
    const body: Record<string, unknown> = { studentId, remarkType, context };
    if (classId) body['classId'] = classId;
    if (examType) body['examType'] = examType;
    return this.http.post<{ remark: string; generatedAt?: string }>(
      `${this.apiUrl}/exams/generate-ai-report-remark`,
      body
    );
  }
}

