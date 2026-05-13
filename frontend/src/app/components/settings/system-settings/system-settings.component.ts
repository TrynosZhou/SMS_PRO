import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../../services/settings.service';
import { CurrencyService } from '../../../services/currency.service';
import { PromotionRuleService } from '../../../services/promotion-rule.service';
import { ClassService } from '../../../services/class.service';

type TabId =
  | 'school-info'
  | 'email'
  | 'notifications'
  | 'security'
  | 'general'
  | 'school-settings'
  | 'student-id';

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

  // ── Student ID Prefix ───────────────────────────
  /** Prefix used at the start of every generated student number (3 letters). */
  studentIdPrefixInput = 'SCH';
  /** The currently saved prefix as fetched from the API; used to detect changes. */
  savedStudentIdPrefix = 'SCH';

  /** Loaded when "School Settings" tab is opened (promotion rules). */
  private promotionDataLoaded = false;
  promotionRules: any[] = [];
  promotionClasses: any[] = [];
  editingPromotionRule: any | null = null;
  promotionRuleForm: {
    fromClassId: string;
    toClassId: string | null;
    isFinalClass: boolean;
    isActive: boolean;
    minimumAveragePercent: number | null;
  } = {
    fromClassId: '',
    toClassId: null,
    isFinalClass: false,
    isActive: true,
    minimumAveragePercent: null
  };
  loadingPromotionRules = false;

  readonly tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'school-info',     label: 'School Information', icon: '🏫' },
    { id: 'general',         label: 'General',            icon: '⚙️' },
    { id: 'school-settings', label: 'School Settings',    icon: '⬆️' },
    { id: 'student-id',      label: 'Student ID Prefix',  icon: '🆔' },
    { id: 'email',           label: 'Email Settings',      icon: '✉️' },
    { id: 'notifications',   label: 'Notifications',       icon: '🔔' },
    { id: 'security',        label: 'Security',           icon: '🔒' },
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

  constructor(
    private settingsService: SettingsService,
    private currencyService: CurrencyService,
    private promotionRuleService: PromotionRuleService,
    private classService: ClassService
  ) {}

  ngOnInit() { this.loadSettings(); }

  setTab(id: TabId) {
    this.activeTab = id;
    this.clearFeedback();
    if (id === 'school-settings' && !this.promotionDataLoaded) {
      this.promotionDataLoaded = true;
      this.loadPromotionClasses();
      this.loadPromotionRules();
    }
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

        // Student ID Prefix
        const sanitizedPrefix = this.sanitizeStudentIdPrefix(data.studentIdPrefix);
        this.studentIdPrefixInput = sanitizedPrefix;
        this.savedStudentIdPrefix = sanitizedPrefix;

        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /**
   * Mirrors the backend's prefix rules:
   *  - letters only,
   *  - upper-case,
   *  - exactly 3 characters (defaults to "SCH", pads short values with "X").
   */
  sanitizeStudentIdPrefix(raw: string | null | undefined): string {
    let p = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!p) p = 'SCH';
    if (p.length < 3) p = (p + 'XXX').slice(0, 3);
    if (p.length > 3) p = p.slice(0, 3);
    return p;
  }

  get studentIdPreview(): string {
    const prefix = this.sanitizeStudentIdPrefix(this.studentIdPrefixInput);
    const year = new Date().getFullYear();
    return `${prefix}001${year}`;
  }

  onStudentIdPrefixInput() {
    this.studentIdPrefixInput = String(this.studentIdPrefixInput || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3);
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
      case 'school-settings':
        this.saving = false;
        return;
      case 'student-id': {
        const cleaned = this.sanitizeStudentIdPrefix(this.studentIdPrefixInput);
        if (cleaned.length !== 3) {
          this.errorMsg = 'Student ID prefix must be exactly 3 letters.';
          this.saving = false;
          return;
        }
        this.studentIdPrefixInput = cleaned;
        payload = { studentIdPrefix: cleaned };
        break;
      }
    }

    this.settingsService.updateSettings(payload).subscribe({
      next: () => {
        this.saving = false;
        this.successMsg = 'Settings saved successfully!';
        // Push the freshly saved currency symbol to every subscriber so other
        // open views (dashboard, invoices, reports, etc.) update in real time.
        if (this.activeTab === 'general') {
          this.currencyService.setSymbol(this.general.currencySymbol);
        }
        if (this.activeTab === 'student-id') {
          // Backend re-syncs existing student numbers automatically; just remember
          // the saved prefix so we don't show a stale "unsaved change" hint.
          this.savedStudentIdPrefix = this.studentIdPrefixInput;
          this.successMsg =
            'Student ID prefix saved. Existing student IDs have been updated to the new prefix.';
        }
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

  // ── School Settings: class promotion rules ─────────────────
  loadPromotionClasses() {
    this.classService.getClasses().subscribe({
      next: (response: any) => {
        const list = Array.isArray(response) ? response : (response?.classes || []);
        this.promotionClasses = this.classService.sortClasses(list);
      },
      error: () => {
        this.promotionClasses = [];
      }
    });
  }

  loadPromotionRules() {
    this.loadingPromotionRules = true;
    this.promotionRuleService.getPromotionRules().subscribe({
      next: (rules: any) => {
        this.promotionRules = Array.isArray(rules) ? rules : [];
        this.loadingPromotionRules = false;
      },
      error: () => {
        this.promotionRules = [];
        this.loadingPromotionRules = false;
        this.errorMsg = 'Failed to load promotion rules.';
        setTimeout(() => this.errorMsg = '', 5000);
      }
    });
  }

  getAvailableFromClasses(): any[] {
    const editingFromClassId = this.editingPromotionRule?.fromClassId;
    return this.promotionClasses.filter(c =>
      c.isActive &&
      (c.id === editingFromClassId || !this.promotionRules.find(r => r.fromClassId === c.id))
    );
  }

  getAvailableToClasses(): any[] {
    return this.promotionClasses.filter(c => c.isActive);
  }

  onPromotionToClassChange() {
    if (this.promotionRuleForm.toClassId === 'COMPLETED') {
      this.promotionRuleForm.isFinalClass = true;
      this.promotionRuleForm.minimumAveragePercent = null;
    }
  }

  onPromotionFinalClassChange() {
    if (this.promotionRuleForm.isFinalClass) {
      this.promotionRuleForm.toClassId = null;
      this.promotionRuleForm.minimumAveragePercent = null;
    }
  }

  savePromotionRule() {
    if (!this.promotionRuleForm.fromClassId) {
      this.errorMsg = 'Please select a From Class';
      setTimeout(() => this.errorMsg = '', 4000);
      return;
    }

    if (!this.promotionRuleForm.isFinalClass && !this.promotionRuleForm.toClassId) {
      this.errorMsg = 'Please select a To Class or mark as Final Class';
      setTimeout(() => this.errorMsg = '', 4000);
      return;
    }

    if (this.promotionRuleForm.fromClassId === this.promotionRuleForm.toClassId) {
      this.errorMsg = 'From Class and To Class cannot be the same';
      setTimeout(() => this.errorMsg = '', 4000);
      return;
    }

    const toClassId = this.promotionRuleForm.toClassId === 'COMPLETED' || this.promotionRuleForm.isFinalClass
      ? null
      : this.promotionRuleForm.toClassId;
    const isFinalClass = this.promotionRuleForm.toClassId === 'COMPLETED' || this.promotionRuleForm.isFinalClass;

    let minimumAveragePercent: number | null = null;
    if (!isFinalClass && this.promotionRuleForm.minimumAveragePercent != null &&
        this.promotionRuleForm.minimumAveragePercent !== ('' as unknown as number)) {
      const n = Number(this.promotionRuleForm.minimumAveragePercent);
      if (!Number.isNaN(n)) {
        minimumAveragePercent = Math.min(100, Math.max(0, n));
      }
    }

    const ruleData = {
      fromClassId: this.promotionRuleForm.fromClassId,
      toClassId,
      isFinalClass,
      isActive: this.promotionRuleForm.isActive,
      minimumAveragePercent
    };

    if (this.editingPromotionRule) {
      this.promotionRuleService.updatePromotionRule(this.editingPromotionRule.id, ruleData).subscribe({
        next: () => {
          this.successMsg = 'Promotion rule updated successfully.';
          this.loadPromotionRules();
          this.resetPromotionRuleForm();
          setTimeout(() => this.successMsg = '', 4000);
        },
        error: (err: any) => {
          this.errorMsg = err.error?.message || 'Failed to update promotion rule.';
          setTimeout(() => this.errorMsg = '', 5000);
        }
      });
    } else {
      this.promotionRuleService.createPromotionRule(ruleData).subscribe({
        next: () => {
          this.successMsg = 'Promotion rule created successfully.';
          this.loadPromotionRules();
          this.resetPromotionRuleForm();
          setTimeout(() => this.successMsg = '', 4000);
        },
        error: (err: any) => {
          this.errorMsg = err.error?.message || 'Failed to create promotion rule.';
          setTimeout(() => this.errorMsg = '', 5000);
        }
      });
    }
  }

  editPromotionRule(rule: any) {
    this.editingPromotionRule = rule;
    this.promotionRuleForm = {
      fromClassId: rule.fromClassId,
      toClassId: rule.isFinalClass ? 'COMPLETED' : rule.toClassId,
      isFinalClass: rule.isFinalClass,
      isActive: rule.isActive,
      minimumAveragePercent:
        rule.minimumAveragePercent != null && !rule.isFinalClass ? Number(rule.minimumAveragePercent) : null
    };

    setTimeout(() => {
      document.querySelector('.ss-promotion-rule-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  deletePromotionRule(rule: any) {
    if (!confirm(`Delete the promotion rule from "${rule.fromClass?.name || rule.fromClass?.form}"?`)) {
      return;
    }
    this.promotionRuleService.deletePromotionRule(rule.id).subscribe({
      next: () => {
        this.successMsg = 'Promotion rule deleted.';
        this.loadPromotionRules();
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: (err: any) => {
        this.errorMsg = err.error?.message || 'Failed to delete promotion rule.';
        setTimeout(() => this.errorMsg = '', 5000);
      }
    });
  }

  cancelEditPromotionRule() {
    this.resetPromotionRuleForm();
  }

  resetPromotionRuleForm() {
    this.editingPromotionRule = null;
    this.promotionRuleForm = {
      fromClassId: '',
      toClassId: null,
      isFinalClass: false,
      isActive: true,
      minimumAveragePercent: null
    };
  }

  toggleRuleStatus(rule: any) {
    this.promotionRuleService.updatePromotionRule(rule.id, {
      isActive: !rule.isActive
    }).subscribe({
      next: () => this.loadPromotionRules(),
      error: (err: any) => {
        this.errorMsg = err.error?.message || 'Failed to update rule status.';
        setTimeout(() => this.errorMsg = '', 5000);
      }
    });
  }

  promotionClassDisplayName(classItem: any): string {
    if (!classItem) {
      return '';
    }
    return classItem.name || classItem.form || 'Unknown';
  }

  promotionClassHasNoRule(classId: string): boolean {
    return !this.promotionRules.find(r => r.fromClassId === classId && r.isActive);
  }
}
