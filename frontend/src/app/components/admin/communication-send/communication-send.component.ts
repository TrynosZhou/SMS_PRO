import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { ParentManagementService } from '../../../services/parent-management.service';

const MAX_SUBJECT = 500;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-communication-send',
  templateUrl: './communication-send.component.html',
  styleUrls: ['./communication-send.component.css']
})
export class CommunicationSendComponent implements OnInit {
  readonly maxSubject = MAX_SUBJECT;

  scope: 'all' | 'one' = 'all';
  parentId = '';
  parentSearch = '';
  subject = '';
  message = '';
  file: File | null = null;

  parents: { id: string; label: string }[] = [];
  loadingParents = false;
  sending = false;
  error = '';
  success = '';

  dropzoneActive = false;
  broadcastConfirmOpen = false;

  private successClearTimer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('bodyTa') bodyTa?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('attachInput') attachInput?: ElementRef<HTMLInputElement>;

  constructor(
    private messageService: MessageService,
    private parentManagementService: ParentManagementService
  ) {}

  ngOnInit(): void {
    this.loadParents();
  }

  get filteredParents(): { id: string; label: string }[] {
    const q = this.parentSearch.trim().toLowerCase();
    if (!q) return this.parents;
    return this.parents.filter((p) => p.label.toLowerCase().includes(q));
  }

  get recipientSummary(): string {
    if (this.scope === 'all') {
      const n = this.parents.length;
      return n === 0 ? 'No parent accounts yet' : `All parents (${n} inbox${n === 1 ? '' : 'es'})`;
    }
    const p = this.parents.find((x) => x.id === this.parentId);
    return p ? p.label : '— Select a parent —';
  }

  get canSend(): boolean {
    return (
      !!this.subject.trim() &&
      !!this.message.trim() &&
      (this.scope === 'all' || !!this.parentId) &&
      !this.sending
    );
  }

  loadParents(): void {
    this.loadingParents = true;
    this.parentManagementService.getParents().subscribe({
      next: (res) => {
        const list = res?.parents || [];
        this.parents = list.map((p: any) => ({
          id: p.id,
          label: `${p.firstName || ''} ${p.lastName || ''}`.trim() + (p.email ? ` — ${p.email}` : '')
        }));
        this.loadingParents = false;
      },
      error: () => {
        this.loadingParents = false;
        this.error = 'Could not load parent list.';
      }
    });
  }

  setScope(next: 'all' | 'one'): void {
    this.scope = next;
    this.error = '';
    if (next === 'all') {
      this.parentId = '';
      this.parentSearch = '';
    }
  }

  onFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] || null;
    this.applyFile(f, input);
  }

  private applyFile(f: File | null, input?: HTMLInputElement | null): void {
    this.error = '';
    if (!f) {
      this.file = null;
      return;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      this.error = `Attachment is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`;
      this.file = null;
      if (input) input.value = '';
      return;
    }
    this.file = f;
  }

  clearFile(): void {
    this.file = null;
    const el = this.attachInput?.nativeElement;
    if (el) el.value = '';
  }

  onDropZoneDragOver(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dropzoneActive = true;
  }

  onDropZoneDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dropzoneActive = false;
  }

  onDropZoneDrop(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dropzoneActive = false;
    const f = ev.dataTransfer?.files?.[0];
    this.applyFile(f || null, this.attachInput?.nativeElement ?? null);
  }

  openFilePicker(): void {
    this.attachInput?.nativeElement.click();
  }

  insertPlaceholder(token: string): void {
    const el = this.bodyTa?.nativeElement;
    if (!el) {
      this.message += token;
      return;
    }
    const start = el.selectionStart ?? this.message.length;
    const end = el.selectionEnd ?? this.message.length;
    this.message = this.message.slice(0, start) + token + this.message.slice(end);
    setTimeout(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  @HostListener('document:keydown', ['$event'])
  onDocKeydown(ev: KeyboardEvent): void {
    if (!ev.ctrlKey && !ev.metaKey) return;
    if (ev.key !== 'Enter') return;
    const t = ev.target as HTMLElement | null;
    if (!t?.closest?.('.cm-send')) return;
    if (t.tagName !== 'TEXTAREA' && t.tagName !== 'INPUT') return;
    ev.preventDefault();
    this.requestSend();
  }

  requestSend(): void {
    this.error = '';
    this.success = '';
    if (!this.subject.trim() || !this.message.trim()) {
      this.error = 'Subject and message are required.';
      return;
    }
    if (this.scope === 'one' && !this.parentId) {
      this.error = 'Select a parent.';
      return;
    }
    if (this.scope === 'all' && this.parents.length === 0) {
      this.error = 'There are no parent accounts to message yet.';
      return;
    }
    if (this.scope === 'all') {
      this.broadcastConfirmOpen = true;
      return;
    }
    this.executeSend();
  }

  cancelBroadcastConfirm(): void {
    this.broadcastConfirmOpen = false;
  }

  confirmBroadcast(): void {
    this.broadcastConfirmOpen = false;
    this.executeSend();
  }

  private executeSend(): void {
    const fd = new FormData();
    fd.append('scope', this.scope);
    fd.append('subject', this.subject.trim());
    fd.append('message', this.message.trim());
    if (this.scope === 'one') {
      fd.append('parentId', this.parentId);
    }
    if (this.file) {
      fd.append('attachment', this.file, this.file.name);
    }

    this.sending = true;
    this.messageService.sendAdminToParents(fd).subscribe({
      next: (res) => {
        this.sending = false;
        const n = res?.sentCount ?? 0;
        this.success = res?.message || `Delivered to ${n} parent inbox(es).`;
        this.subject = '';
        this.message = '';
        this.file = null;
        this.parentSearch = '';
        const el = this.attachInput?.nativeElement;
        if (el) el.value = '';
        if (this.successClearTimer) clearTimeout(this.successClearTimer);
        this.successClearTimer = setTimeout(() => {
          this.success = '';
          this.successClearTimer = null;
        }, 8000);
      },
      error: (err) => {
        this.sending = false;
        this.error = err?.error?.message || 'Failed to send.';
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
