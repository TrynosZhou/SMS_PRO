import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-bulk-message',
  templateUrl: './bulk-message.component.html',
  styleUrls: ['./bulk-message.component.css']
})
export class BulkMessageComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  
  messageForm: any = {
    subject: '',
    message: '',
    recipients: 'all' // 'all', 'students', 'parents', 'teachers'
  };
  
  loading = false;
  success = '';
  error = '';
  schoolName = '';
  headmasterName = '';
  
  messageTemplate = '';

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings.schoolName || '[School Name]';
        this.headmasterName = settings.headmasterName || '[Headmaster Name]';
        
        // Initialize message template with actual values
        this.messageTemplate = `Dear [Recipient Name],

This is a message from ${this.schoolName}.

[Your message here]

Best regards,
${this.headmasterName}
${this.schoolName}`;
        
        // Initialize message with template
        this.messageForm.message = this.messageTemplate;
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Use default template if settings fail to load
        this.messageTemplate = `Dear [Recipient Name],

This is a message from [School Name].

[Your message here]

Best regards,
[Headmaster Name]
[School Name]`;
        this.messageForm.message = this.messageTemplate;
      }
    });
  }

  canSendMessage(): boolean {
    const user = this.authService.getCurrentUser();
    return user ? (user.role === 'admin' || user.role === 'superadmin' || user.role === 'accountant') : false;
  }

  closeModal() {
    this.close.emit();
  }

  sendMessage() {
    if (!this.canSendMessage()) {
      this.error = 'You do not have permission to send bulk messages.';
      return;
    }

    if (!this.messageForm.subject || !this.messageForm.subject.trim()) {
      this.error = 'Please enter a subject/title for the message.';
      return;
    }

    if (!this.messageForm.message || !this.messageForm.message.trim()) {
      this.error = 'Please enter a message.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.messageService.sendBulkMessage({
      subject: this.messageForm.subject.trim(),
      message: this.messageForm.message.trim(),
      recipients: this.messageForm.recipients
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.success = response.message || 'Bulk message sent successfully!';
        setTimeout(() => {
          this.closeModal();
        }, 2000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to send bulk message. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  useTemplate() {
    this.messageForm.message = this.messageTemplate;
  }

  clearMessage() {
    this.messageForm.message = '';
  }
}

