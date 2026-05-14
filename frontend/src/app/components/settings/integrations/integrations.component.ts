import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';

export type IntegrationStatus = 'active' | 'inactive' | 'error';

export interface IntegrationRow {
  id: string;
  name: string;
  type: string;
  status: IntegrationStatus;
  mode: string;
  lastSync: Date | null;
}

@Component({
  selector: 'app-integrations',
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.css'],
})
export class IntegrationsComponent implements OnDestroy {
  @ViewChild('modalLayer') modalLayerRef?: ElementRef<HTMLElement>;
  @ViewChild('modalScroll') modalScrollRef?: ElementRef<HTMLElement>;

  integrations: IntegrationRow[] = [];

  showAddModal = false;
  formType = 'api';
  formName = '';
  formDescription = '';
  /** When true, integration runs in test/sandbox mode (table shows "Test"). */
  formSandbox = false;
  formApiKey = '';
  formApiSecret = '';
  formBaseUrl = '';
  formWebhookUrl = '';

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly hostRef: ElementRef<HTMLElement>,
  ) {}

  readonly typeOptions = [
    { value: 'api', label: 'API' },
    { value: 'webhook', label: 'Webhook' },
    { value: 'sso', label: 'Single Sign-On' },
    { value: 'payment', label: 'Payment Gateway' },
    { value: 'sms', label: 'SMS' },
    { value: 'other', label: 'Other' },
  ];

  get totalCount(): number {
    return this.integrations.length;
  }

  get activeCount(): number {
    return this.integrations.filter((i) => i.status === 'active').length;
  }

  get inactiveCount(): number {
    return this.integrations.filter((i) => i.status === 'inactive').length;
  }

  get errorCount(): number {
    return this.integrations.filter((i) => i.status === 'error').length;
  }

  get canCreate(): boolean {
    const nameOk = (this.formName || '').trim().length > 0;
    const typeOk = (this.formType || '').trim().length > 0;
    return nameOk && typeOk;
  }

  openAdd(): void {
    this.formType = 'api';
    this.formName = '';
    this.formDescription = '';
    this.formSandbox = false;
    this.formApiKey = '';
    this.formApiSecret = '';
    this.formBaseUrl = '';
    this.formWebhookUrl = '';
    this.showAddModal = true;
    /* Portal to body AFTER Angular renders so position:fixed is never clipped by
       an ancestor overflow/transform in the app shell. */
    setTimeout(() => {
      this.moveModalLayerToBody();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const bodyEl = this.modalScrollRef?.nativeElement;
          if (bodyEl) {
            bodyEl.scrollTop = 0;
          }
        });
      });
    }, 0);
  }

  closeAdd(): void {
    this.moveModalLayerToHost();
    this.showAddModal = false;
  }

  ngOnDestroy(): void {
    this.moveModalLayerToHost();
  }

  private moveModalLayerToBody(): void {
    const layer = this.modalLayerRef?.nativeElement;
    if (!layer || layer.parentElement === this.document.body) {
      return;
    }
    this.document.body.appendChild(layer);
  }

  private moveModalLayerToHost(): void {
    const layer = this.modalLayerRef?.nativeElement;
    const host = this.hostRef.nativeElement;
    if (!layer || layer.parentElement !== this.document.body) {
      return;
    }
    try {
      host.appendChild(layer);
    } catch {
      /* host may already be detached during destroy */
    }
  }

  saveIntegration(): void {
    if (!this.canCreate) return;

    const name = (this.formName || '').trim();
    const typeLabel = this.typeOptions.find((t) => t.value === this.formType)?.label || this.formType;
    const modeLabel = this.formSandbox ? 'Test' : 'Live';

    const row: IntegrationRow = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `int-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: typeLabel,
      status: 'active',
      mode: modeLabel,
      lastSync: new Date(),
    };

    this.integrations = [...this.integrations, row];
    this.closeAdd();
  }

  deleteRow(row: IntegrationRow): void {
    if (!confirm(`Remove integration "${row.name}"?`)) return;
    this.integrations = this.integrations.filter((i) => i.id !== row.id);
  }

  lastSyncLabel(row: IntegrationRow): string {
    if (!row.lastSync) return '—';
    return row.lastSync.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
