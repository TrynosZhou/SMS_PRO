import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RecordBookService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getRecordBookByClass(classId: string, subjectId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/record-book/class/${classId}?subjectId=${subjectId}`);
  }

  saveMarks(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/record-book/marks`, data);
  }

  batchSaveMarks(classId: string, subjectId: string, records: any[], topics: any, testDates?: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/record-book/marks/batch`, {
      classId,
      subjectId,
      records,
      topics,
      testDates
    });
  }
}

