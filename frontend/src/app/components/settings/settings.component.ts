import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { PromotionRuleService } from '../../services/promotion-rule.service';
import { ClassService } from '../../services/class.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  settings: any = {
    studentIdPrefix: 'JPS',
    teacherIdPrefix: 'JPST',
    feesSettings: {
      dayScholarTuitionFee: 0,
      boarderTuitionFee: 0,
      registrationFee: 0,
      deskFee: 0,
      libraryFee: 0,
      sportsFee: 0,
      transportCost: 0,
      diningHallCost: 0,
      otherFees: []
    },
    schoolName: '',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    headmasterName: '',
    schoolMotto: '',
    schoolMotto2: '',
    schoolMotto3: '',
    academicYear: new Date().getFullYear().toString(),
    currentTerm: `Term 1 ${new Date().getFullYear()}`,
    schoolLogo: null,
    schoolLogo2: null,
    currencySymbol: 'KES',
    promotionRules: {
      'ECD A': 'ECD B',
      'ECD B': 'Grade 1',
      'Grade 1': 'Grade 2',
      'Grade 2': 'Grade 3',
      'Grade 3': 'Grade 4',
      'Grade 4': 'Grade 5',
      'Grade 5': 'Grade 6',
      'Grade 6': 'Grade 7',
      'Grade 7': 'Completed'
    }
  };

  loading = false;
  error = '';
  success = '';
  // Promotion Rules (database-backed)
  promotionRules: any[] = [];
  classes: any[] = [];
  editingPromotionRule: any | null = null;
  promotionRuleForm: {
    fromClassId: string;
    toClassId: string | null;
    isFinalClass: boolean;
    isActive: boolean;
  } = {
    fromClassId: '',
    toClassId: null,
    isFinalClass: false,
    isActive: true
  };
  loadingPromotionRules = false;
  resettingCoreData: boolean = false;
  resetConfirmationWord: string = '';
  uniformItems: any[] = [];
  uniformItemForm: {
    id?: string;
    name: string;
    description: string;
    unitPrice: number;
    isActive: boolean;
  } = {
    id: undefined,
    name: '',
    description: '',
    unitPrice: 0,
    isActive: true
  };
  uniformItemModalOpen = false;
  uniformItemSubmitting = false;
  uniformItemError = '';

  constructor(
    private settingsService: SettingsService,
    public authService: AuthService,
    private promotionRuleService: PromotionRuleService,
    private classService: ClassService
  ) { }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true;
  }

  ngOnInit() {
    this.loadSettings();
    this.loadUniformItems();
    this.loadClasses();
    this.loadPromotionRules();
  }

  loadSettings() {
    // For demo users, always set school name to "Demo School"
    if (this.isDemoUser()) {
      this.settings.schoolName = 'Demo School';
    }
    this.loading = true;
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.settings = { ...this.settings, ...data };
        
        // For demo users, always set school name to "Demo School"
        if (this.isDemoUser()) {
          this.settings.schoolName = 'Demo School';
        }
        
        if (!this.settings.activeTerm && this.settings.currentTerm) {
          this.settings.activeTerm = this.settings.currentTerm;
        }
        
        // Initialize teacherIdPrefix if not present
        if (!this.settings.teacherIdPrefix) {
          this.settings.teacherIdPrefix = 'JPST';
        }
        
        if (!this.settings.feesSettings) {
          this.settings.feesSettings = {
            dayScholarTuitionFee: 0,
            boarderTuitionFee: 0,
            registrationFee: 0,
            deskFee: 0,
            libraryFee: 0,
            sportsFee: 0,
            transportCost: 0,
            diningHallCost: 0,
            otherFees: []
          };
        }
        if (this.settings.feesSettings.registrationFee === undefined) {
          this.settings.feesSettings.registrationFee = 0;
        }
        if (this.settings.feesSettings.deskFee === undefined) {
          this.settings.feesSettings.deskFee = 0;
        }
        // Initialize transport and dining hall costs if not present
        if (this.settings.feesSettings.transportCost === undefined) {
          this.settings.feesSettings.transportCost = 0;
        }
        if (this.settings.feesSettings.diningHallCost === undefined) {
          this.settings.feesSettings.diningHallCost = 0;
        }
        // Migrate old tuitionFee to both dayScholarTuitionFee and boarderTuitionFee if needed
        if (this.settings.feesSettings.tuitionFee !== undefined && 
            this.settings.feesSettings.dayScholarTuitionFee === undefined &&
            this.settings.feesSettings.boarderTuitionFee === undefined) {
          const oldTuitionFee = this.settings.feesSettings.tuitionFee;
          this.settings.feesSettings.dayScholarTuitionFee = oldTuitionFee;
          this.settings.feesSettings.boarderTuitionFee = oldTuitionFee;
          delete this.settings.feesSettings.tuitionFee;
        }
        if (!this.settings.currencySymbol) {
          this.settings.currencySymbol = 'KES';
        }
        if (!this.settings.currentTerm) {
          const currentYear = new Date().getFullYear();
          this.settings.currentTerm = `Term 1 ${currentYear}`;
        }
        if (!this.settings.promotionRules) {
          this.settings.promotionRules = {
            'ECD A': 'ECD B',
            'ECD B': 'Grade 1',
            'Grade 1': 'Grade 2',
            'Grade 2': 'Grade 3',
            'Grade 3': 'Grade 4',
            'Grade 4': 'Grade 5',
            'Grade 5': 'Grade 6',
            'Grade 6': 'Grade 7',
            'Grade 7': 'Completed'
          };
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.error = 'Failed to load settings';
        this.loading = false;
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (response: any) => {
        const classesList = Array.isArray(response) ? response : (response?.classes || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  // Load promotion rules from database
  loadPromotionRules() {
    this.loadingPromotionRules = true;
    this.promotionRuleService.getPromotionRules().subscribe({
      next: (rules: any) => {
        this.promotionRules = Array.isArray(rules) ? rules : [];
        this.loadingPromotionRules = false;
      },
      error: (err: any) => {
        console.error('Error loading promotion rules:', err);
        this.error = 'Failed to load promotion rules';
        this.loadingPromotionRules = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Get active classes for dropdown (excluding the one being edited)
  getAvailableFromClasses(): any[] {
    const editingFromClassId = this.editingPromotionRule?.fromClassId;
    return this.classes.filter(c => 
      c.isActive && 
      (c.id === editingFromClassId || !this.promotionRules.find(r => r.fromClassId === c.id))
    );
  }

  // Get available to classes (all classes + "Completed" option)
  getAvailableToClasses(): any[] {
    return this.classes.filter(c => c.isActive);
  }

  // Add or update promotion rule
  savePromotionRule() {
    if (!this.promotionRuleForm.fromClassId) {
      this.error = 'Please select a From Class';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    if (!this.promotionRuleForm.isFinalClass && !this.promotionRuleForm.toClassId) {
      this.error = 'Please select a To Class or mark as Final Class';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    if (this.promotionRuleForm.fromClassId === this.promotionRuleForm.toClassId) {
      this.error = 'From Class and To Class cannot be the same';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    // Handle "COMPLETED" option
    const toClassId = this.promotionRuleForm.toClassId === 'COMPLETED' || this.promotionRuleForm.isFinalClass 
      ? null 
      : this.promotionRuleForm.toClassId;
    const isFinalClass = this.promotionRuleForm.toClassId === 'COMPLETED' || this.promotionRuleForm.isFinalClass;

    const ruleData = {
      fromClassId: this.promotionRuleForm.fromClassId,
      toClassId: toClassId,
      isFinalClass: isFinalClass,
      isActive: this.promotionRuleForm.isActive
    };

    if (this.editingPromotionRule) {
      // Update existing rule
      this.promotionRuleService.updatePromotionRule(this.editingPromotionRule.id, ruleData).subscribe({
        next: (rule: any) => {
          this.success = 'Promotion rule updated successfully';
          this.loadPromotionRules();
          this.resetPromotionRuleForm();
          setTimeout(() => this.success = '', 5000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update promotion rule';
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // Create new rule
      this.promotionRuleService.createPromotionRule(ruleData).subscribe({
        next: (rule: any) => {
          this.success = 'Promotion rule created successfully';
          this.loadPromotionRules();
          this.resetPromotionRuleForm();
          setTimeout(() => this.success = '', 5000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create promotion rule';
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  // Edit promotion rule
  editPromotionRule(rule: any) {
    this.editingPromotionRule = rule;
    this.promotionRuleForm = {
      fromClassId: rule.fromClassId,
      toClassId: rule.isFinalClass ? 'COMPLETED' : rule.toClassId,
      isFinalClass: rule.isFinalClass,
      isActive: rule.isActive
    };
    
    // Scroll to form
    setTimeout(() => {
      const formElement = document.querySelector('.promotion-rule-form') as HTMLElement;
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // Delete promotion rule
  deletePromotionRule(rule: any) {
    if (!confirm(`Are you sure you want to delete the promotion rule from "${rule.fromClass?.name || rule.fromClass?.form}"?`)) {
      return;
    }

    this.promotionRuleService.deletePromotionRule(rule.id).subscribe({
      next: () => {
        this.success = 'Promotion rule deleted successfully';
        this.loadPromotionRules();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete promotion rule';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Cancel editing
  cancelEditPromotionRule() {
    this.resetPromotionRuleForm();
  }

  // Reset form
  resetPromotionRuleForm() {
    this.editingPromotionRule = null;
    this.promotionRuleForm = {
      fromClassId: '',
      toClassId: null,
      isFinalClass: false,
      isActive: true
    };
  }

  // Toggle rule active status
  toggleRuleStatus(rule: any) {
    this.promotionRuleService.updatePromotionRule(rule.id, {
      isActive: !rule.isActive
    }).subscribe({
      next: () => {
        this.loadPromotionRules();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update rule status';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Get class display name
  getClassDisplayName(classItem: any): string {
    if (!classItem) return '';
    return classItem.name || classItem.form || 'Unknown';
  }

  // Check if class has no promotion rule (for warning)
  hasNoPromotionRule(classId: string): boolean {
    return !this.promotionRules.find(r => r.fromClassId === classId && r.isActive);
  }

  onSubmit() {
    // Prevent demo users from saving settings
    if (this.isDemoUser()) {
      this.error = 'Demo accounts cannot modify system settings. This is a demo environment.';
      this.loading = false;
      setTimeout(() => this.error = '', 5000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Ensure activeTerm is set (default to currentTerm if not provided)
    if (!this.settings.activeTerm && this.settings.currentTerm) {
      this.settings.activeTerm = this.settings.currentTerm;
    }

    // Ensure numeric values are numbers
    if (this.settings.feesSettings) {
      this.settings.feesSettings.dayScholarTuitionFee = Number(this.settings.feesSettings.dayScholarTuitionFee) || 0;
      this.settings.feesSettings.boarderTuitionFee = Number(this.settings.feesSettings.boarderTuitionFee) || 0;
      this.settings.feesSettings.deskFee = Number(this.settings.feesSettings.deskFee) || 0;
      this.settings.feesSettings.libraryFee = Number(this.settings.feesSettings.libraryFee) || 0;
      this.settings.feesSettings.sportsFee = Number(this.settings.feesSettings.sportsFee) || 0;
      this.settings.feesSettings.transportCost = Number(this.settings.feesSettings.transportCost) || 0;
      this.settings.feesSettings.diningHallCost = Number(this.settings.feesSettings.diningHallCost) || 0;
    }

    // Ensure currencySymbol is set and not empty
    if (!this.settings.currencySymbol || this.settings.currencySymbol.trim() === '') {
      this.settings.currencySymbol = 'KES';
    }

    const payload = { ...this.settings };

    this.settingsService.updateSettings(payload).subscribe({
      next: (response: any) => {
        this.success = 'Settings saved successfully!';
        this.loading = false;
        this.error = ''; // Clear any previous errors
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear success message after 5 seconds (increased from 3)
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error saving settings:', err);
        
        // Handle specific error cases
        if (err.status === 413 || err.error?.status === 413) {
          this.error = 'The data being saved is too large. Please reduce the size of the school logo or other large data and try again.';
        } else if (err.error?.message) {
          this.error = err.error.message;
        } else {
          this.error = 'Failed to save settings. Please try again.';
        }
        
        this.loading = false;
        this.success = ''; // Clear any previous success message
        
        // Scroll to top to show error message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear error message after 5 seconds
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadUniformItems() {
    this.settingsService.getUniformItems().subscribe({
      next: (items: any[]) => {
        this.uniformItems = items || [];
      },
      error: (err: any) => {
        console.error('Error loading uniform items:', err);
      }
    });
  }

  openUniformItemModal(item?: any) {
    if (item) {
      this.uniformItemForm = {
        id: item.id,
        name: item.name,
        description: item.description || '',
        unitPrice: parseFloat(String(item.unitPrice || 0)),
        isActive: item.isActive !== false
      };
    } else {
      this.uniformItemForm = {
        id: undefined,
        name: '',
        description: '',
        unitPrice: 0,
        isActive: true
      };
    }
    this.uniformItemError = '';
    this.uniformItemModalOpen = true;
  }

  closeUniformItemModal() {
    this.uniformItemModalOpen = false;
    this.uniformItemSubmitting = false;
    this.uniformItemError = '';
  }

  saveUniformItem() {
    if (!this.uniformItemForm.name || this.uniformItemForm.name.trim() === '') {
      this.uniformItemError = 'Uniform item name is required';
      return;
    }

    if (this.uniformItemForm.unitPrice === null || this.uniformItemForm.unitPrice === undefined || this.uniformItemForm.unitPrice < 0) {
      this.uniformItemError = 'Please enter a valid price';
      return;
    }

    this.uniformItemSubmitting = true;
    const payload = {
      name: this.uniformItemForm.name.trim(),
      description: this.uniformItemForm.description?.trim() || '',
      unitPrice: Number(this.uniformItemForm.unitPrice),
      isActive: this.uniformItemForm.isActive
    };

    const request$ = this.uniformItemForm.id
      ? this.settingsService.updateUniformItem(this.uniformItemForm.id, payload)
      : this.settingsService.createUniformItem(payload);

    request$.subscribe({
      next: (response: any) => {
        this.uniformItemSubmitting = false;
        this.success = response?.message || 'Uniform item saved successfully!';
        this.loadUniformItems();
        this.closeUniformItemModal();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.uniformItemSubmitting = false;
        this.uniformItemError = err.error?.message || 'Failed to save uniform item';
      }
    });
  }

  deleteUniformItem(item: any) {
    if (!item?.id) {
      return;
    }

    if (!confirm(`Delete uniform item "${item.name}"? This cannot be undone.`)) {
      return;
    }

    this.settingsService.deleteUniformItem(item.id).subscribe({
      next: (response: any) => {
        this.success = response?.message || 'Uniform item deleted successfully';
        this.loadUniformItems();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete uniform item';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  canResetCoreData(): boolean {
    return !this.resettingCoreData
      && !this.isDemoUser()
      && (this.authService.hasRole('admin') || this.authService.hasRole('superadmin'))
      && this.resetConfirmationWord.trim() === 'RESET';
  }

  resetCoreData() {
    if (!this.canResetCoreData()) {
      this.error = 'Type RESET exactly to enable data reset.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const confirmed = confirm(
      'This will permanently erase students, teachers, and transaction data. Settings will be retained. Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    this.resettingCoreData = true;
    this.error = '';
    this.success = '';

    this.settingsService.resetCoreData('RESET').subscribe({
      next: (response: any) => {
        this.resettingCoreData = false;
        this.resetConfirmationWord = '';
        this.success = response?.message || 'Data reset completed successfully.';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => this.success = '', 7000);
      },
      error: (err: any) => {
        this.resettingCoreData = false;
        this.error = err?.error?.message || 'Failed to reset data. Please try again.';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => this.error = '', 7000);
      }
    });
  }
}

