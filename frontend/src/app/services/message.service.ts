import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  sendBulkMessage(messageData: { subject: string; message: string; recipients: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/bulk`, messageData);
  }

  getParentMessages(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent`);
  }

  markParentMessageRead(messageId: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/messages/parent/${messageId}/read`, {});
  }

  getParentOutbox(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent/outbox`);
  }

  sendParentMessageToSchool(payload: { subject: string; message: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/parent/send`, payload);
  }

  /** Multipart: scope all|one, subject, message, optional parentId, optional attachment */
  sendAdminToParents(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/admin/to-parents`, formData);
  }

  getAdminMessagesFromParents(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/admin/from-parents`);
  }
}

