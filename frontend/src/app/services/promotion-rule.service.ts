import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PromotionRuleService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getPromotionRules(): Observable<any> {
    return this.http.get(`${this.apiUrl}/promotion-rules`);
  }

  getActivePromotionRules(): Observable<any> {
    return this.http.get(`${this.apiUrl}/promotion-rules/active`);
  }

  getPromotionRule(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/promotion-rules/${id}`);
  }

  createPromotionRule(ruleData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/promotion-rules`, ruleData);
  }

  updatePromotionRule(id: string, ruleData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/promotion-rules/${id}`, ruleData);
  }

  deletePromotionRule(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/promotion-rules/${id}`);
  }
}

