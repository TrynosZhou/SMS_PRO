import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserActivityService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  logMenuAccess(menu: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/activity/access`, { menu });
  }

  getUserActivityLogs(): Observable<any> {
    return this.http.get(`${this.apiUrl}/activity/user-logs`);
  }
}

