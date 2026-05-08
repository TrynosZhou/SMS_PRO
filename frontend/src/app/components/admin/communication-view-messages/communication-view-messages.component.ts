import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';

@Component({
  selector: 'app-communication-view-messages',
  templateUrl: './communication-view-messages.component.html',
  styleUrls: ['./communication-view-messages.component.css']
})
export class CommunicationViewMessagesComponent implements OnInit {
  messages: any[] = [];
  filtered: any[] = [];
  searchQuery = '';
  loading = false;
  error = '';
  selected: any | null = null;

  constructor(private messageService: MessageService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.messageService.getAdminMessagesFromParents().subscribe({
      next: (res) => {
        this.messages = res?.messages || [];
        this.applyFilter();
        this.loading = false;
        if (this.selected) {
          const still = this.messages.find((m) => m.id === this.selected.id);
          this.selected = still || null;
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Could not load messages.';
      }
    });
  }

  applyFilter(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filtered = [...this.messages];
      return;
    }
    this.filtered = this.messages.filter((m) => {
      const blob = [
        m.subject,
        m.message,
        m.senderName,
        m.parentFirstName,
        m.parentLastName,
        m.parentEmail
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }

  onSearchChange(): void {
    this.applyFilter();
    if (this.selected && !this.filtered.some((m) => m.id === this.selected.id)) {
      this.selected = null;
    }
  }

  select(m: any): void {
    this.selected = m;
  }

  parentLabel(m: any): string {
    const name = `${m.parentFirstName || ''} ${m.parentLastName || ''}`.trim();
    if (name && m.parentEmail) return `${name} (${m.parentEmail})`;
    if (name) return name;
    return m.parentEmail || m.senderName || 'Parent';
  }

  formatDate(d: string): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }
}
