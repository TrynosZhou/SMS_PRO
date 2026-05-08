import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: string;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-manage-accounts',
  templateUrl: './manage-accounts.component.html',
  styleUrls: ['./manage-accounts.component.css'],
})
export class ManageAccountsComponent implements OnInit {
  private api = environment.apiUrl;

  // ── Table data ────────────────────────────────────
  users: UserRow[] = [];
  total  = 0;
  pages  = 1;
  loading = false;
  successMsg = '';
  errorMsg   = '';

  // ── Filters ───────────────────────────────────────
  searchQuery  = '';
  filterRole   = '';
  filterStatus = '';

  // ── Pagination ────────────────────────────────────
  page  = 1;
  limit = 10;

  // ── Selection ─────────────────────────────────────
  selectedIds = new Set<string>();

  // ── Roles list ────────────────────────────────────
  allRoles = [
    { value: 'superadmin',       label: 'Super Admin' },
    { value: 'admin',            label: 'Admin' },
    { value: 'accountant',       label: 'Accountant' },
    { value: 'teacher',          label: 'Teacher' },
    { value: 'hod',              label: 'HOD' },
    { value: 'parent',           label: 'Parent' },
    { value: 'student',          label: 'Student' },
    { value: 'librarian',        label: 'Librarian' },
    { value: 'inventory_clerk',  label: 'Inventory Clerk' },
    { value: 'demo_user',        label: 'Demo User' },
  ];

  // ── Add User modal ────────────────────────────────
  showAddModal  = false;
  addSubmitting = false;
  addSubmitted  = false;
  addError      = '';
  showPassword  = false;
  showConfirmPw = false;
  addForm = this.blankAddForm();

  // password strength indicators
  get pwHasLength()    { return this.addForm.password.length >= 8; }
  get pwHasUpper()     { return /[A-Z]/.test(this.addForm.password); }
  get pwHasLower()     { return /[a-z]/.test(this.addForm.password); }
  get pwHasNumber()    { return /[0-9]/.test(this.addForm.password); }
  get pwHasSpecial()   { return /[^A-Za-z0-9]/.test(this.addForm.password); }

  manualAccountRoles = [
    { value: 'admin',           label: 'Administrator' },
    { value: 'accountant',      label: 'Accountant' },
    { value: 'librarian',       label: 'Librarian' },
    { value: 'inventory_clerk', label: 'Inventory Clerk' },
    { value: 'hod',             label: 'Head of Department (HOD)' },
    { value: 'teacher',         label: 'Teacher' },
    { value: 'parent',          label: 'Parent' },
    { value: 'student',         label: 'Student' },
    { value: 'superadmin',      label: 'Super Admin' },
  ];

  // ── Edit modal ────────────────────────────────────
  showEditModal   = false;
  editSubmitting  = false;
  editError       = '';
  editForm: { id: string; username: string; email: string; role: string; isActive: boolean } =
    { id: '', username: '', email: '', role: '', isActive: true };

  // ── View details modal ────────────────────────────
  showViewModal = false;
  viewUser: UserRow | null = null;

  // ── Reset password result modal ───────────────────
  showResetModal   = false;
  resetResult: { username: string; temporaryPassword: string } | null = null;
  copyFeedback = '';

  currentUser: any;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    this.loadUsers();
  }

  // ── Load / filter ─────────────────────────────────
  loadUsers() {
    this.loading = true;
    let url = `${this.api}/account/users?page=${this.page}&limit=${this.limit}`;
    if (this.searchQuery.trim())  url += `&search=${encodeURIComponent(this.searchQuery.trim())}`;
    if (this.filterRole)          url += `&role=${this.filterRole}`;
    if (this.filterStatus)        url += `&status=${this.filterStatus}`;

    this.http.get<any>(url).subscribe({
      next: res => {
        this.users   = res.users  || [];
        this.total   = res.total  || 0;
        this.pages   = res.pages  || 1;
        this.loading = false;
      },
      error: err => {
        this.errorMsg = err?.error?.message || 'Failed to load users.';
        this.loading  = false;
        setTimeout(() => this.errorMsg = '', 5000);
      },
    });
  }

  applyFilters() { this.page = 1; this.loadUsers(); }

  clearFilters() {
    this.searchQuery = ''; this.filterRole = ''; this.filterStatus = '';
    this.page = 1; this.loadUsers();
  }

  setLimit(val: number) { this.limit = val; this.page = 1; this.loadUsers(); }

  goToPage(p: number) {
    if (p < 1 || p > this.pages) return;
    this.page = p; this.loadUsers();
  }

  get pageStart() { return (this.page - 1) * this.limit + 1; }
  get pageEnd()   { return Math.min(this.page * this.limit, this.total); }

  // ── Selection ─────────────────────────────────────
  toggleSelect(id: string) {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
  }

  toggleAll(checked: boolean) {
    if (checked) this.users.forEach(u => this.selectedIds.add(u.id));
    else this.selectedIds.clear();
  }

  get allSelected() {
    return this.users.length > 0 && this.users.every(u => this.selectedIds.has(u.id));
  }

  // ── Add User modal ────────────────────────────────
  openAddUser() {
    this.showAddModal = true;
    this.addForm = this.blankAddForm();
    this.addError = '';
    this.addSubmitted = false;
    this.showPassword = false;
    this.showConfirmPw = false;
  }
  cancelAdd() { this.showAddModal = false; }

  isTeacherRole() { return this.addForm.role === 'teacher' || this.addForm.role === 'hod'; }
  onAddRoleChange() { /* email always optional in this modal */ }

  saveNewUser() {
    this.addSubmitted = true;
    const f = this.addForm;

    if (!f.username.trim())            { this.addError = 'Username is required.'; return; }
    if (!f.role)                       { this.addError = 'Role is required.'; return; }
    if (!f.fullName.trim())            { this.addError = 'Full Name is required.'; return; }
    if (!f.password)                   { this.addError = 'Password is required.'; return; }
    if (f.password.length < 8)        { this.addError = 'Password must be at least 8 characters.'; return; }
    if (f.password !== f.confirmPassword) { this.addError = 'Passwords do not match.'; return; }

    this.addSubmitting = true; this.addError = '';

    const payload: any = {
      role:            f.role,
      username:        f.username.trim(),
      fullName:        f.fullName.trim(),
      profileId:       f.profileId.trim() || undefined,
      phone:           f.phone.trim()     || undefined,
      password:        f.password,
      generatePassword: false,
    };
    if (f.email.trim()) payload.email = f.email.trim();

    this.http.post<any>(`${this.api}/account/users`, payload).subscribe({
      next: res => {
        this.addSubmitting = false; this.cancelAdd(); this.loadUsers();
        this.successMsg = `User <strong>${res.user?.username}</strong> created successfully (role: ${res.user?.role}).`;
        setTimeout(() => this.successMsg = '', 8000);
      },
      error: err => {
        this.addSubmitting = false;
        this.addError = err?.error?.message || 'Failed to create user.';
      },
    });
  }

  // ── View details ──────────────────────────────────
  openView(u: UserRow) { this.viewUser = u; this.showViewModal = true; }
  closeView()          { this.showViewModal = false; this.viewUser = null; }

  // ── Edit user ─────────────────────────────────────
  openEdit(u: UserRow) {
    this.editForm = { id: u.id, username: u.username, email: u.email || '', role: u.role, isActive: u.isActive };
    this.editError = ''; this.showEditModal = true;
  }
  closeEdit() { this.showEditModal = false; }

  saveEdit() {
    if (!this.editForm.role) { this.editError = 'Role is required.'; return; }
    this.editSubmitting = true; this.editError = '';

    this.http.put<any>(`${this.api}/account/users/${this.editForm.id}`, {
      role:     this.editForm.role,
      isActive: this.editForm.isActive,
      username: this.editForm.username,
      email:    this.editForm.email || null,
    }).subscribe({
      next: () => {
        this.editSubmitting = false; this.closeEdit(); this.loadUsers();
        this.successMsg = 'User updated successfully.';
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: err => {
        this.editSubmitting = false;
        this.editError = err?.error?.message || 'Failed to update user.';
      },
    });
  }

  // ── Reset password ────────────────────────────────
  resetPassword(u: UserRow) {
    if (!confirm(`Reset password for "${u.username}"? A temporary password will be shown.`)) return;

    this.http.post<any>(`${this.api}/account/users/${u.id}/reset-password`, {}).subscribe({
      next: res => {
        this.resetResult = { username: res.username, temporaryPassword: res.temporaryPassword };
        this.showResetModal = true; this.copyFeedback = '';
      },
      error: err => {
        this.errorMsg = err?.error?.message || 'Failed to reset password.';
        setTimeout(() => this.errorMsg = '', 6000);
      },
    });
  }

  closeResetModal() { this.showResetModal = false; this.resetResult = null; }

  async copyField(val: string, label: string) {
    try {
      await navigator.clipboard.writeText(val);
      this.copyFeedback = `${label} copied!`;
    } catch { this.copyFeedback = 'Could not copy — please copy manually.'; }
    setTimeout(() => this.copyFeedback = '', 2500);
  }

  // ── Delete ────────────────────────────────────────
  deleteUser(u: UserRow) {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;

    this.http.delete<any>(`${this.api}/account/users/${u.id}`).subscribe({
      next: () => {
        this.successMsg = `User "${u.username}" deleted.`;
        this.loadUsers();
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: err => {
        this.errorMsg = err?.error?.message || 'Failed to delete user.';
        setTimeout(() => this.errorMsg = '', 5000);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────
  roleBadgeClass(role: string) {
    const map: Record<string, string> = {
      superadmin: 'um-role-superadmin',
      admin:      'um-role-admin',
      teacher:    'um-role-teacher',
      hod:        'um-role-hod',
      accountant: 'um-role-accountant',
      parent:     'um-role-parent',
      student:    'um-role-student',
    };
    return map[role] || 'um-role-default';
  }

  fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: '2-digit',
      hour: 'numeric', minute: '2-digit',
    });
  }

  isSuperAdmin() { return this.currentUser?.role === 'superadmin'; }

  goToActivityLog() { this.router.navigate(['/general/manage/activity-log']); }

  private blankAddForm() {
    return {
      username: '', role: 'admin', fullName: '', profileId: '',
      email: '', phone: '',
      password: '', confirmPassword: '',
      generatePassword: false,
    };
  }
}
