import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-parent-inbox',
  templateUrl: './parent-inbox.component.html',
  styleUrls: ['./parent-inbox.component.css']
})
export class ParentInboxComponent implements OnInit, OnDestroy {
  messages: any[] = [];
  outboxMessages: any[] = [];
  loading = false;
  loadingOutbox = false;
  error = '';
  parentName = '';

  /** When true, rendered inside /parent/communications (shell provides tabs + title). */
  hubMode = false;

  activeTab: 'inbox' | 'compose' | 'outbox' = 'inbox';

  searchQuery = '';
  selectedId: string | null = null;
  listPanelOpen = true;

  composeSubject = '';
  composeBody = '';
  sending = false;
  composeError = '';
  composeSuccess = '';

  private routeSub?: Subscription;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    const snap = this.route.snapshot.data;
    this.hubMode = !!snap['parentCommHub'];
    if (this.hubMode) {
      this.applyCommSegment(String(snap['parentCommSegment'] || 'inbox'));
    } else {
      this.applyQueryTabParams(this.route.snapshot.queryParams);
    }

    this.routeSub = new Subscription();
    this.routeSub.add(
      this.route.data.subscribe((data) => {
        this.hubMode = !!data['parentCommHub'];
        if (this.hubMode) {
          this.applyCommSegment(String(data['parentCommSegment'] || 'inbox'));
        }
      })
    );
    this.routeSub.add(
      this.route.queryParams.subscribe((params) => {
        if (this.hubMode) {
          return;
        }
        this.applyQueryTabParams(params);
      })
    );

    this.loadMessages();
    this.loadOutbox();
  }

  private applyCommSegment(seg: string): void {
    if (seg === 'compose') {
      this.activeTab = 'compose';
    } else if (seg === 'outbox') {
      this.activeTab = 'outbox';
      this.loadOutbox();
    } else {
      this.activeTab = 'inbox';
    }
  }

  private applyQueryTabParams(params: Record<string, unknown>): void {
    const t = params['tab'];
    if (params['compose'] === '1' || t === 'compose') {
      this.activeTab = 'compose';
    } else if (t === 'outbox') {
      this.activeTab = 'outbox';
    } else {
      this.activeTab = 'inbox';
    }
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth > 960) {
      this.listPanelOpen = true;
    }
  }

  setTab(tab: 'inbox' | 'compose' | 'outbox') {
    this.activeTab = tab;
    if (this.hubMode) {
      const path = tab === 'inbox' ? 'view' : tab === 'compose' ? 'send' : 'sent';
      void this.router.navigate(['/parent/communications', path], { replaceUrl: true });
      if (tab === 'outbox') {
        this.loadOutbox();
      }
      return;
    }
    if (tab === 'inbox') {
      this.router.navigate(['/parent/inbox'], { replaceUrl: true });
    } else {
      this.router.navigate(['/parent/inbox'], { queryParams: { tab }, replaceUrl: true });
    }
    if (tab === 'outbox') {
      this.loadOutbox();
    }
  }

  get toolbarTitle(): string {
    switch (this.activeTab) {
      case 'compose':
        return 'Message the school';
      case 'outbox':
        return 'Sent messages';
      default:
        return 'Inbox';
    }
  }

  get toolbarSub(): string {
    switch (this.activeTab) {
      case 'compose':
        return 'Write to the school administrator. Your message is delivered to the school office.';
      case 'outbox':
        return 'Copies of messages you have sent to the school.';
      default:
        return 'Read announcements and notices from your school in one place.';
    }
  }

  loadMessages() {
    this.loading = true;
    this.error = '';

    this.messageService.getParentMessages().subscribe({
      next: (response: any) => {
        this.messages = response.messages || [];
        this.loading = false;
        if (this.messages.length > 0) {
          const stillExists = this.selectedId && this.messages.some((m) => m.id === this.selectedId);
          if (!stillExists) {
            this.selectedId = this.messages[0].id;
            this.maybeMarkRead(this.messages[0]);
          }
        } else {
          this.selectedId = null;
        }
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load messages';
        }
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  loadOutbox() {
    this.loadingOutbox = true;
    this.messageService.getParentOutbox().subscribe({
      next: (response: any) => {
        this.outboxMessages = response.messages || [];
        this.loadingOutbox = false;
      },
      error: () => {
        this.loadingOutbox = false;
      }
    });
  }

  sendToSchool() {
    this.composeError = '';
    this.composeSuccess = '';
    const sub = this.composeSubject.trim();
    const body = this.composeBody.trim();
    if (!sub || !body) {
      this.composeError = 'Please enter subject and message.';
      return;
    }
    this.sending = true;
    this.messageService.sendParentMessageToSchool({ subject: sub, message: body }).subscribe({
      next: () => {
        this.sending = false;
        this.composeSuccess = 'Your message was sent to the school.';
        this.composeSubject = '';
        this.composeBody = '';
        this.loadOutbox();
        setTimeout(() => (this.composeSuccess = ''), 6000);
      },
      error: (err: any) => {
        this.sending = false;
        this.composeError = err.error?.message || 'Failed to send';
      }
    });
  }

  get filteredMessages(): any[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      return this.messages;
    }
    return this.messages.filter(
      (m) =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.message || '').toLowerCase().includes(q) ||
        (m.senderName || '').toLowerCase().includes(q)
    );
  }

  get selectedMessage(): any | null {
    if (!this.selectedId) {
      return null;
    }
    return this.messages.find((m) => m.id === this.selectedId) || null;
  }

  get unreadCount(): number {
    return this.messages.filter((m) => !m.isRead).length;
  }

  selectMessage(msg: any) {
    this.selectedId = msg.id;
    this.maybeMarkRead(msg);
    if (window.innerWidth <= 960) {
      this.listPanelOpen = false;
    }
  }

  showListOnMobile() {
    this.listPanelOpen = true;
  }

  private maybeMarkRead(msg: any) {
    if (!msg || msg.isRead) {
      return;
    }
    this.messageService.markParentMessageRead(msg.id).subscribe({
      next: () => {
        msg.isRead = true;
      },
      error: () => {}
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) {
      return '';
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  relativeTime(dateString: string): string {
    if (!dateString) {
      return '';
    }
    const d = new Date(dateString);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) {
      return 'Just now';
    }
    if (min < 60) {
      return `${min}m ago`;
    }
    if (hr < 24) {
      return `${hr}h ago`;
    }
    if (day < 7) {
      return `${day}d ago`;
    }
    return this.formatDate(dateString);
  }

  previewText(body: string, max = 72): string {
    const t = (body || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) {
      return t;
    }
    return t.slice(0, max).trim() + '…';
  }

  refresh() {
    this.loadMessages();
    this.loadOutbox();
  }

  onSearchQueryChange() {
    if (this.filteredMessages.length === 0) {
      this.selectedId = null;
      return;
    }
    if (!this.filteredMessages.some((m) => m.id === this.selectedId)) {
      const next = this.filteredMessages[0];
      this.selectedId = next.id;
      this.maybeMarkRead(next);
    }
  }

  logout() {
    this.authService.logout();
  }

  attachmentHref(url: string | null | undefined): string {
    if (!url || typeof url !== 'string' || !url.startsWith('/')) {
      return '#';
    }
    return `${environment.serverBaseUrl}${url}`;
  }

  communicationsNavActive(): boolean {
    return this.router.url.startsWith('/parent/communications');
  }
}
