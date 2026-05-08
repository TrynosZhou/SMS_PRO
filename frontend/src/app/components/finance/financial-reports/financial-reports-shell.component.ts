import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-financial-reports-shell',
  templateUrl: './financial-reports-shell.component.html',
  styleUrls: ['./financial-reports-shell.component.css'],
})
export class FinancialReportsShellComponent implements OnInit {
  generatedAt: string | null = null;
  loadError = '';

  readonly subMenus: { path: string; label: string }[] = [
    { path: 'student-ledgers', label: 'Student Ledgers' },
    { path: 'fees-collection', label: 'Fees Collection' },
    { path: 'outstanding-fees', label: 'Outstanding Fees' },
    { path: 'exemptions', label: 'Exemptions' },
    { path: 'aged-debtors', label: 'Aged Debtors' },
    { path: 'enrolment-vs-billing', label: 'Enrolment Vs Billing' },
    { path: 'revenue-recognition', label: 'Revenue Recognition' },
    { path: 'student-reconciliation', label: 'Student Reconciliation' },
    { path: 'analytics-forecasts', label: 'Analytics & Forecasts' },
    { path: 'class-reconciliation', label: 'Class Reconciliation' },
  ];

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.subscribe(data => {
      const b = data['bundle'];
      this.generatedAt = b?.generatedAt ?? null;
      this.loadError = '';
    });
  }
}
