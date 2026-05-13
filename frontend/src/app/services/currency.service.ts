import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SettingsService } from './settings.service';

/**
 * Single source of truth for the school's currency symbol.
 *
 * Components should subscribe to `symbol$` instead of fetching `/api/settings`
 * themselves — this ensures every screen shares one HTTP call and that a save
 * from System Settings instantly propagates to anything else on screen.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  /** Default placeholder used until the API responds (or if it fails). */
  static readonly DEFAULT_SYMBOL = '$';

  private readonly symbolSubject = new BehaviorSubject<string>(CurrencyService.DEFAULT_SYMBOL);

  /** Hot observable; emits the latest currency symbol. Always emits an initial value. */
  readonly symbol$: Observable<string> = this.symbolSubject.asObservable();

  private fetching = false;
  private fetched = false;

  constructor(private settingsService: SettingsService) {
    // Kick off the first fetch as soon as the service is created so screens that
    // open shortly after login already have the correct symbol.
    this.ensureLoaded();
  }

  /** Synchronous accessor for templates/legacy code that needs the value immediately. */
  get current(): string {
    return this.symbolSubject.value || CurrencyService.DEFAULT_SYMBOL;
  }

  /** Lazy first-load (idempotent). */
  ensureLoaded(): void {
    if (this.fetched || this.fetching) return;
    this.fetching = true;
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.fetching = false;
        this.fetched = true;
        const next = CurrencyService.extractSymbol(data);
        if (next !== this.symbolSubject.value) {
          this.symbolSubject.next(next);
        }
      },
      error: () => {
        this.fetching = false;
        // Keep the existing (default) symbol; another component can retry via refresh().
      }
    });
  }

  /**
   * Pulls the currency symbol out of whatever shape the `/api/settings` endpoint
   * returns. Handles:
   *  - a single object: `{ currencySymbol, ... }`
   *  - an array of rows: `[{ currencySymbol, ... }]`
   *  - the System Settings → General tab nested shape: `{ generalSettings: { currencySymbol, ... } }`
   *  - missing / empty values → falls back to `DEFAULT_SYMBOL`.
   */
  private static extractSymbol(data: any): string {
    if (!data) return CurrencyService.DEFAULT_SYMBOL;
    const row = Array.isArray(data) ? (data.length ? data[0] : null) : data;
    if (!row) return CurrencyService.DEFAULT_SYMBOL;

    const topLevel = typeof row.currencySymbol === 'string' ? row.currencySymbol.trim() : '';
    if (topLevel) return topLevel;

    const gs = row.generalSettings;
    const nested = gs && typeof gs.currencySymbol === 'string' ? gs.currencySymbol.trim() : '';
    if (nested) return nested;

    return CurrencyService.DEFAULT_SYMBOL;
  }

  /**
   * Re-fetch from the backend. Call this after the System Settings page saves a
   * new currency so other open views update immediately without a page reload.
   */
  refresh(): void {
    this.fetched = false;
    this.ensureLoaded();
  }

  /**
   * Imperatively push a new symbol (used by System Settings right after a save
   * succeeds so subscribers update before the next /api/settings round-trip).
   */
  setSymbol(symbol: string | null | undefined): void {
    const next = (symbol && String(symbol).trim()) || CurrencyService.DEFAULT_SYMBOL;
    if (next !== this.symbolSubject.value) {
      this.symbolSubject.next(next);
    }
    this.fetched = true;
  }
}
