import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { Observable } from 'rxjs';
import { FinanceService } from '../services/finance.service';

@Injectable({ providedIn: 'root' })
export class FinancialReportsResolver implements Resolve<any> {
  constructor(private financeService: FinanceService) {}

  resolve(): Observable<any> {
    return this.financeService.getFinancialReports();
  }
}
