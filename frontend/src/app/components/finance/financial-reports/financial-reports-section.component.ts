import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { CurrencyService } from '../../../services/currency.service';

@Component({
  selector: 'app-financial-reports-section',
  templateUrl: './financial-reports-section.component.html',
  styleUrls: ['./financial-reports-section.component.css'],
})
export class FinancialReportsSectionComponent implements OnInit, OnDestroy {
  report = '';
  bundle: any = null;
  // Seed with whatever the service already knows (cached value from System Settings →
  // General tab). Avoids a flash of the placeholder "$" on first paint. The real
  // assignment happens in the constructor body since `currencyService` is injected.
  currencySymbol: string = CurrencyService.DEFAULT_SYMBOL;

  private currencySub?: Subscription;

  constructor(private route: ActivatedRoute, private currencyService: CurrencyService) {
    this.currencySymbol = this.currencyService.current;
  }

  ngOnInit(): void {
    // Always pull the latest value the user saved under /system-settings → General.
    // refresh() is idempotent: if no fetch is in flight it re-hits the API; otherwise
    // it just keeps emitting through the existing subscription.
    this.currencyService.refresh();
    this.currencySub = this.currencyService.symbol$.subscribe(s => (this.currencySymbol = s));

    this.route.data.subscribe(d => {
      this.report = d['report'] || '';
      if ('bundle' in d) {
        this.bundle = d['bundle'] || null;
      }
    });
    this.route.parent?.data.subscribe(pd => {
      if (pd && 'bundle' in pd) {
        this.bundle = pd['bundle'] || null;
      }
    });
  }

  ngOnDestroy(): void {
    this.currencySub?.unsubscribe();
  }

  money(n: number | undefined | null): string {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0.00';
    return x.toFixed(2);
  }

  /**
   * Render an amount with the configured currency symbol. Adds a thin separator
   * between the symbol and the value when the symbol is a multi-character code
   * (KES, KSh, ZAR, USD, …) so it doesn't appear glued to the number — e.g.
   * `KES 0.00` instead of `KES0.00`. Single-glyph symbols like `$`, `€`, `£`
   * stay tight: `$0.00`.
   */
  formatCurrency(n: number | undefined | null): string {
    const symbol = (this.currencySymbol || '').trim() || '$';
    const value = this.money(n);
    // If the symbol contains any letter or digit (e.g. "KES", "KSh", "GH₵"),
    // give it a non-breaking space so it never wraps onto its own line.
    const needsSpace = /[A-Za-z0-9]/.test(symbol) || symbol.length > 1;
    return needsSpace ? `${symbol}\u00A0${value}` : `${symbol}${value}`;
  }

  objectKeys(obj: Record<string, unknown> | null | undefined): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).sort();
  }

  bucketLabel(key: string): string {
    switch (key) {
      case 'current0to30':
        return 'Current – 30 days';
      case 'days31to60':
        return '31 – 60 days';
      case 'days61to90':
        return '61 – 90 days';
      case 'days90Plus':
        return '90+ days';
      default:
        return key;
    }
  }

  /**
   * Strip the literal word "Form " from the start of a class key.
   * The backend already strips it when building the key, but this acts
   * as a safety net for any legacy keys still in the bundle.
   * "Form 1 Blue" → "1 Blue", "1 Blue" → "1 Blue" (no-op).
   */
  className(raw: string): string {
    return raw.replace(/^form\s+/i, '').trim() || raw;
  }

  // ── Outstanding Fees local filters ───────────────────────────────────────
  ofSearch = '';
  ofTerm = '';
  ofClass = '';
  ofResidence = '';

  get ofRows(): any[] {
    const rows: any[] = this.bundle?.outstandingFees ?? [];
    return rows.filter(r => {
      if (this.ofSearch) {
        const q = this.ofSearch.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        if (!name.includes(q) && !String(r.studentNumber).toLowerCase().includes(q)) return false;
      }
      if (this.ofTerm && r.term !== this.ofTerm) return false;
      if (this.ofClass && r.className !== this.ofClass) return false;
      if (this.ofResidence && r.residence !== this.ofResidence) return false;
      return true;
    });
  }

  get ofTotalOutstanding(): number {
    return this.ofRows.reduce((s: number, r: any) => s + (r.balance ?? 0), 0);
  }

  get ofClassesAffected(): number {
    return new Set(this.ofRows.map((r: any) => r.className)).size;
  }

  get ofSummaryByClass(): { className: string; count: number; total: number }[] {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of this.ofRows) {
      const key = r.className || '—';
      const existing = map.get(key) ?? { count: 0, total: 0 };
      map.set(key, { count: existing.count + 1, total: existing.total + (r.balance ?? 0) });
    }
    return Array.from(map.entries())
      .map(([className, v]) => ({ className, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  ofUniqueTerms(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.term).filter(Boolean))].sort();
  }

  ofUniqueClasses(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.className).filter(Boolean))].sort();
  }

  ofUniqueResidences(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.residence).filter(Boolean))].sort();
  }

  clearOfFilters(): void {
    this.ofSearch = '';
    this.ofTerm = '';
    this.ofClass = '';
    this.ofResidence = '';
  }

  printPage(): void { window.print(); }

  downloadOfCsv(): void {
    const rows = this.ofRows;
    if (!rows.length) return;
    const headers = ['#', 'Name', 'Class', 'Residence', 'Term', 'Invoice', 'Due Date', 'Balance'];
    const lines = rows.map((r: any, i: number) =>
      [i + 1, `${r.firstName} ${r.lastName}`, r.className, r.residence, r.term, r.invoiceNumber, r.dueDate, r.balance].join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outstanding-fees.csv';
    a.click();
  }
}
