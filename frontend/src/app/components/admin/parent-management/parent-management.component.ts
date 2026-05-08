import { Component, OnInit, OnDestroy } from '@angular/core';
import { ParentManagementService } from '../../../services/parent-management.service';
import { ParentService } from '../../../services/parent.service';

type Tab = 'manage' | 'create' | 'reset';

@Component({
  selector: 'app-parent-management',
  templateUrl: './parent-management.component.html',
  styleUrls: ['./parent-management.component.css']
})
export class ParentManagementComponent implements OnInit, OnDestroy {
  activeTab: Tab = 'manage';

  parents: any[] = [];
  stats: any = { total: 0, notLinked: 0, linkedStudents: 0, studentAccounts: 0 };
  searchQuery = '';
  loading = false;
  error = '';
  success = '';
  selectedParent: any = null;

  // Create form
  createForm = {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: '',
    gender: '',
    password: '',
    generatePassword: true
  };
  creating = false;
  showCreatePassword = false;
  createdCredentials: string | null = null;

  // Reset form
  resetParentId = '';
  resetParentSearch = '';
  resetParentSelectedName = '';
  resetNewPassword = '';
  resetConfirmPassword = '';
  resetParentSearching = false;
  savingNewPassword = false;
  showResetNewPassword = false;
  showResetConfirmPassword = false;

  // Edit parent mode
  editingParent = false;
  editForm = {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    gender: '',
    address: '',
  };
  savingEdit = false;

  // Link student (when parent selected)
  linkSearchQuery = '';
  linkSearchResults: any[] = [];
  linkSearching = false;
  selectedStudentIds = new Set<string>();
  linking = false;
  private linkSearchDebounceTimer: any = null;
  private readonly LINK_SEARCH_DEBOUNCE_MS = 300;

  constructor(
    private parentMgmtService: ParentManagementService,
    private parentService: ParentService
  ) {}

  ngOnInit() {
    this.loadParents();
  }

  ngOnDestroy() {
    if (this.linkSearchDebounceTimer) clearTimeout(this.linkSearchDebounceTimer);
  }

  setTab(tab: Tab) {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
    this.createdCredentials = null;
    if (tab === 'manage') {
      this.selectedParent = null;
      this.loadParents();
    }
  }

  loadParents() {
    this.loading = true;
    this.error = '';
    this.parentMgmtService.getParents(this.searchQuery.trim() || undefined).subscribe({
      next: (res: any) => {
        this.parents = res.parents || [];
        this.stats = res.stats || { total: 0, notLinked: 0, linkedStudents: 0, studentAccounts: 0 };
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load parents';
        this.loading = false;
      }
    });
  }

  onSearch() {
    this.loadParents();
  }

  selectParent(p: any) {
    this.selectedParent = p;
    this.parentMgmtService.getParentById(p.id).subscribe({
      next: (res: any) => {
        this.selectedParent = res;
      },
      error: () => {
        this.selectedParent = p;
      }
    });
  }

  closeParentDetail() {
    this.selectedParent = null;
    this.editingParent = false;
  }

  openEditParent() {
    if (!this.selectedParent) return;
    this.editForm = {
      firstName: this.selectedParent.firstName || '',
      lastName: this.selectedParent.lastName || '',
      email: this.selectedParent.email || '',
      phoneNumber: this.selectedParent.phoneNumber || '',
      gender: this.selectedParent.gender || '',
      address: this.selectedParent.address || '',
    };
    this.editingParent = true;
    this.error = '';
  }

  cancelEditParent() {
    this.editingParent = false;
  }

  saveEditParent() {
    if (!this.selectedParent) return;
    if (!this.editForm.firstName?.trim() || !this.editForm.lastName?.trim()) {
      this.error = 'First name and last name are required';
      return;
    }
    const emailVal = this.editForm.email?.trim();
    if (emailVal) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(emailVal)) {
        this.error = 'Please enter a valid email address (e.g. name@example.com)';
        return;
      }
    }
    this.savingEdit = true;
    this.error = '';
    this.parentMgmtService.updateParent(this.selectedParent.id, {
      firstName: this.editForm.firstName.trim(),
      lastName: this.editForm.lastName.trim(),
      email: this.editForm.email?.trim() || '',
      phoneNumber: this.editForm.phoneNumber?.trim() || '',
      gender: this.editForm.gender?.trim() || '',
      address: this.editForm.address?.trim() || '',
    }).subscribe({
      next: () => {
        this.savingEdit = false;
        this.editingParent = false;
        this.success = 'Parent updated successfully';
        this.selectParent(this.selectedParent);
      },
      error: (err: any) => {
        this.savingEdit = false;
        this.error = err.error?.message || 'Failed to update parent';
      }
    });
  }

  deleteParent() {
    if (!this.selectedParent || !confirm(`Delete ${this.getFullName(this.selectedParent)}? This will unlink all students and remove the parent account.`)) return;
    this.parentMgmtService.deleteParent(this.selectedParent.id).subscribe({
      next: () => {
        this.success = 'Parent account deleted';
        this.selectedParent = null;
        this.loadParents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete parent';
      }
    });
  }

  getInitial(name: string): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  createParent() {
    this.error = '';
    this.success = '';
    this.createdCredentials = null;
    if (!this.createForm.firstName?.trim() || !this.createForm.lastName?.trim()) {
      this.error = 'First name and last name are required';
      return;
    }
    const email = this.createForm.email?.trim();
    if (!email) {
      this.error = 'A valid email address is required';
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      this.error = 'Please enter a valid email address (e.g. name@example.com)';
      return;
    }
    if (!this.createForm.generatePassword && (!this.createForm.password || this.createForm.password.length < 8)) {
      this.error = 'Password must be at least 8 characters';
      return;
    }

    this.creating = true;
    const payload: any = {
      firstName: this.createForm.firstName.trim(),
      lastName: this.createForm.lastName.trim(),
      email,
      generatePassword: this.createForm.generatePassword
    };
    if (this.createForm.phoneNumber?.trim()) payload.phoneNumber = this.createForm.phoneNumber.trim();
    if (this.createForm.address?.trim()) payload.address = this.createForm.address.trim();
    if (this.createForm.gender?.trim()) payload.gender = this.createForm.gender.trim();
    if (!this.createForm.generatePassword && this.createForm.password) payload.password = this.createForm.password;

    this.parentMgmtService.createParentAccount(payload).subscribe({
      next: (res: any) => {
        this.creating = false;
        this.success = 'Parent account created successfully.';
        if (res.temporaryCredentials?.password) {
          this.createdCredentials = `Username: ${res.user?.username || res.parent?.email}\nPassword: ${res.temporaryCredentials.password}`;
        }
        this.createForm = { firstName: '', lastName: '', email: '', phoneNumber: '', address: '', gender: '', password: '', generatePassword: true };
        this.loadParents();
      },
      error: (err: any) => {
        this.creating = false;
        this.error = err.error?.message || 'Failed to create parent account';
      }
    });
  }

  findParentAndShowPasswordForm() {
    const email = this.resetParentSearch?.trim();
    if (!email) {
      this.error = 'Please enter parent email address';
      return;
    }
    this.error = '';
    this.success = '';
    this.resetParentSearching = true;
    this.parentMgmtService.getParents(email).subscribe({
      next: (res: any) => {
        this.resetParentSearching = false;
        const parents = res.parents || [];
        const parent = parents.find((p: any) => p.email && p.email.toLowerCase() === email.toLowerCase());
        if (parent) {
          this.resetParentId = parent.id;
          this.resetParentSelectedName = `${parent.firstName} ${parent.lastName} (${parent.email})`;
          this.resetNewPassword = '';
          this.resetConfirmPassword = '';
        } else {
          this.error = 'No parent found with that email address';
        }
      },
      error: (err: any) => {
        this.resetParentSearching = false;
        this.error = err.error?.message || 'Failed to find parent';
      }
    });
  }

  clearResetSelection() {
    this.resetParentId = '';
    this.resetParentSelectedName = '';
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
  }

  saveNewPassword() {
    this.error = '';
    this.success = '';
    if (!this.resetParentId) {
      this.error = 'Please find the parent first';
      return;
    }
    if (!this.resetNewPassword || this.resetNewPassword.length < 8) {
      this.error = 'Password must be at least 8 characters';
      return;
    }
    if (this.resetNewPassword !== this.resetConfirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    this.savingNewPassword = true;
    this.parentMgmtService.resetParentPassword(this.resetParentId, { newPassword: this.resetNewPassword }).subscribe({
      next: () => {
        this.savingNewPassword = false;
        this.success = 'Password reset successfully.';
        this.resetParentId = '';
        this.resetParentSearch = '';
        this.resetParentSelectedName = '';
        this.resetNewPassword = '';
        this.resetConfirmPassword = '';
      },
      error: (err: any) => {
        this.savingNewPassword = false;
        this.error = err.error?.message || 'Failed to reset password';
      }
    });
  }

  onLinkSearchInput() {
    const q = this.linkSearchQuery?.trim();
    if (this.linkSearchDebounceTimer) clearTimeout(this.linkSearchDebounceTimer);
    if (!q) {
      this.linkSearchResults = [];
      this.selectedStudentIds.clear();
      this.selectedStudentIds = new Set(this.selectedStudentIds);
      return;
    }
    this.linkSearchDebounceTimer = setTimeout(() => {
      this.linkSearchDebounceTimer = null;
      this.searchStudentsToLink();
    }, this.LINK_SEARCH_DEBOUNCE_MS);
  }

  searchStudentsToLink() {
    const q = this.linkSearchQuery?.trim();
    if (!q) {
      this.linkSearchResults = [];
      return;
    }
    this.linkSearching = true;
    this.selectedStudentIds.clear();
    this.parentService.searchStudents(q).subscribe({
      next: (res: any) => {
        this.linkSearchResults = (res.students || []).filter((s: any) => {
          const linked = this.selectedParent?.students?.some((ps: any) => ps.id === s.id);
          return !linked;
        });
        this.linkSearching = false;
      },
      error: () => {
        this.linkSearchResults = [];
        this.linkSearching = false;
      }
    });
  }

  toggleStudentSelection(student: any) {
    const id = student.id;
    if (this.selectedStudentIds.has(id)) {
      this.selectedStudentIds.delete(id);
    } else {
      this.selectedStudentIds.add(id);
    }
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  isStudentSelected(student: any): boolean {
    return this.selectedStudentIds.has(student.id);
  }

  selectAllSearchResults() {
    if (this.linkSearchResults.length === 0) return;
    this.linkSearchResults.forEach((s) => this.selectedStudentIds.add(s.id));
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  clearStudentSelection() {
    this.selectedStudentIds.clear();
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  bulkLinkSelected() {
    if (!this.selectedParent || this.selectedStudentIds.size === 0) return;
    this.linking = true;
    this.error = '';
    this.success = '';
    const ids = Array.from(this.selectedStudentIds);
    this.parentMgmtService.bulkLinkStudents(this.selectedParent.id, ids).subscribe({
      next: (res: any) => {
        this.linking = false;
        const count = res.linked?.length ?? ids.length;
        this.success = res.message || `${count} student(s) linked successfully`;
        this.selectedStudentIds.clear();
        this.selectParent(this.selectedParent);
        this.linkSearchResults = [];
        this.linkSearchQuery = '';
        this.loadParents();
      },
      error: (err: any) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link students';
      }
    });
  }

  getFullName(student: any): string {
    if (!student) return '';
    return [student.firstName, student.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
  }

  unlinkStudent(student: any) {
    if (!this.selectedParent || !confirm(`Unlink ${student.firstName} ${student.lastName}?`)) return;
    this.parentMgmtService.unlinkStudent(this.selectedParent.id, student.id).subscribe({
      next: () => {
        this.success = 'Student unlinked';
        this.selectParent(this.selectedParent);
        this.loadParents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink';
      }
    });
  }

  toggleCreatePassword() {
    this.showCreatePassword = !this.showCreatePassword;
  }

  toggleResetNewPassword() {
    this.showResetNewPassword = !this.showResetNewPassword;
  }

  toggleResetConfirmPassword() {
    this.showResetConfirmPassword = !this.showResetConfirmPassword;
  }
}
