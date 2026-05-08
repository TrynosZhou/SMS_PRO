import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaymentAuditService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getPaymentAuditLogs(params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    paymentMethod?: string;
    anomalyOnly?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: 'ASC' | 'DESC';
  }): Observable<any> {
    let httpParams = new HttpParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (key === 'anomalyOnly') {
        httpParams = httpParams.set(key, (value ? 'true' : 'false') as any);
        return;
      }
      httpParams = httpParams.set(key, String(value) as any);
    });

    return this.http.get(`${this.apiUrl}/payments/audit-logs`, { params: httpParams });
  }
}

