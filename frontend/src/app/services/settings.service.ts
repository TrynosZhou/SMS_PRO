import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings`);
  }

  getPublicSplashSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/public/splash`);
  }

  updateSettings(settings: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings`, settings);
  }

  getActiveTerm(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/active-term`);
  }

  getTerms(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/terms`);
  }

  getYearEndReminders(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/reminders`);
  }

  processOpeningDay(): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/opening-day`, {});
  }

  processClosingDay(): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/closing-day`, {});
  }

  resetCoreData(confirmationWord: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/reset-data`, { confirmationWord });
  }

  getUniformItems(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/uniform-items`);
  }

  createUniformItem(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/uniform-items`, data);
  }

  updateUniformItem(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings/uniform-items/${id}`, data);
  }

  deleteUniformItem(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/settings/uniform-items/${id}`);
  }
}

