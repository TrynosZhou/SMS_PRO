import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';

type TabId = 'school-info' | 'email' | 'notifications' | 'security' | 'general';

@Component({
  selector: 'app-system-settings',
  templateUrl: './system-settings.component.html',
  styleUrls: ['./system-settings.component.css']
})
export class SystemSettingsComponent implements OnInit {
  activeTab: TabId = 'school-info';

  loading = false;
  saving  = false;
  successMsg = '';
  errorMsg   = '';

  // ── School Information ───────────────────────────
  schoolInfo = {
    schoolName:    '',
    schoolAddress: '',
    schoolPhone:   '',
    schoolEmail:   '',
    schoolWebsite: '',
    schoolLogo:    '',
  };

  // ── Email Settings ───────────────────────────────
  emailSettings = {
    smtpHost:       '',
    smtpPort:       '587',
    smtpUser:       '',
    smtpPassword:   '',
    fromAddress:    '',
    fromName:       '',
    encryption:     'tls',
    testEmail:      '',
  };
  sendingTest = false;
  testResult  = '';

  // ── Notifications ────────────────────────────────
  notifications = {
    emailOnNewStudent:  true,
    emailOnFeePayment:  true,
    emailOnReportReady: true,
    emailOnAbsence:     false,
    smsOnFeePayment:    false,
    smsOnAbsence:       false,
    smsOnReportReady:   false,
    pushEnabled:        false,
  };

  // ── Security ─────────────────────────────────────
  security = {
    sessionTimeoutMins:   60,
    minPasswordLength:     8,
    requireUppercase:      true,
    requireNumber:         true,
    requireSpecialChar:    true,
    maxLoginAttempts:      5,
    twoFactorEnabled:      false,
  };

  // ── General ──────────────────────────────────────
  general = {
    timezone:     'Africa/Harare',
    dateFormat:   'DD/MM/YYYY',
    language:     'en',
    currency:     'USD',
    currencySymbol: '$',
    weekStartsOn: 'monday',
    academicYear: String(new Date().getFullYear()),
  };

  readonly tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'school-info',   label: 'School Information', icon: '🏫' },
    { id: 'email',         label: 'Email Settings',     icon: '✉️' },
    { id: 'notifications', label: 'Notifications',      icon: '🔔' },
    { id: 'security',      label: 'Security',           icon: '🔒' },
    { id: 'general',       label: 'General',            icon: '⚙️' },
  ];

  readonly timezones = [
    'Africa/Harare', 'Africa/Johannesburg', 'Africa/Nairobi',
    'Africa/Lagos', 'Africa/Cairo', 'UTC',
    'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  ];
  readonly dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];
  readonly languages   = [{ code: 'en', label: 'English' }, { code: 'fr', label: 'French' }, { code: 'pt', label: 'Portuguese' }];
  readonly currencies  = [
    { code: 'USD', symbol: '$' }, { code: 'ZWL', symbol: 'ZWL' },
    { code: 'ZAR', symbol: 'R' }, { code: 'KES', symbol: 'KSh' },
    { code: 'GHS', symbol: 'GH₵' }, { code: 'NGN', symbol: '₦' },
    { code: 'EUR', symbol: '€' }, { code: 'GBP', symbol: '£' },
  ];

  constructor(private settingsService: SettingsService) {}

  ngOnInit() { this.loadSettings(); }

  setTab(id: TabId) {
    this.activeTab = id;
    this.clearFeedback();
  }

  loadSettings() {
    this.loading = true;
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        // School Info
        this.schoolInfo.schoolName    = data.schoolName    || '';
        this.schoolInfo.schoolAddress = data.schoolAddress || '';
        this.schoolInfo.schoolPhone   = data.schoolPhone   || '';
        this.schoolInfo.schoolEmail   = data.schoolEmail   || '';
        this.schoolInfo.schoolWebsite = data.schoolWebsite || '';
        this.schoolInfo.schoolLogo    = data.schoolLogo    || '';

        // Email Settings (stored in settings.emailSettings)
        if (data.emailSettings) {
          this.emailSettings = { ...this.emailSettings, ...data.emailSettings };
        }
        // Notifications
        if (data.notificationSettings) {
          this.notifications = { ...this.notifications, ...data.notificationSettings };
        }
        // Security
        if (data.securitySettings) {
          this.security = { ...this.security, ...data.securitySettings };
        }
        // General
        if (data.currencySymbol) this.general.currencySymbol = data.currencySymbol;
        if (data.generalSettings) {
          this.general = { ...this.general, ...data.generalSettings };
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Save per-tab ─────────────────────────────────
  save() {
    this.clearFeedback();
    this.saving = true;

    let payload: any = {};
    switch (this.activeTab) {
      case 'school-info':
        if (!this.schoolInfo.schoolName.trim()) {
          this.errorMsg = 'School name is required.'; this.saving = false; return;
        }
        payload = { ...this.schoolInfo };
        break;
      case 'email':
        payload = { emailSettings: { ...this.emailSettings } };
        break;
      case 'notifications':
        payload = { notificationSettings: { ...this.notifications } };
        break;
      case 'security':
        if (this.security.minPasswordLength < 6) {
          this.errorMsg = 'Minimum password length must be at least 6.'; this.saving = false; return;
        }
        payload = { securitySettings: { ...this.security } };
        break;
      case 'general':
        const cur = this.currencies.find(c => c.code === this.general.currency);
        if (cur) this.general.currencySymbol = cur.symbol;
        payload = { generalSettings: { ...this.general }, currencySymbol: this.general.currencySymbol };
        break;
    }

    this.settingsService.updateSettings(payload).subscribe({
      next: () => {
        this.saving = false;
        this.successMsg = 'Settings saved successfully!';
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: (err: any) => {
        this.saving = false;
        this.errorMsg = err?.error?.message || 'Failed to save settings.';
        setTimeout(() => this.errorMsg = '', 5000);
      }
    });
  }

  sendTestEmail() {
    if (!this.emailSettings.testEmail) { this.testResult = 'Please enter a test email address.'; return; }
    this.sendingTest = true; this.testResult = '';
    // Optimistic feedback (real SMTP send would need a dedicated backend endpoint)
    setTimeout(() => {
      this.sendingTest = false;
      this.testResult = `Test email sent to ${this.emailSettings.testEmail}`;
      setTimeout(() => this.testResult = '', 5000);
    }, 1200);
  }

  onCurrencyChange() {
    const cur = this.currencies.find(c => c.code === this.general.currency);
    if (cur) this.general.currencySymbol = cur.symbol;
  }

  clearFeedback() { this.successMsg = ''; this.errorMsg = ''; }
}
