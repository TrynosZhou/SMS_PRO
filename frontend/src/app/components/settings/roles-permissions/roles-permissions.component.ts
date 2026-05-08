import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
  action: string;
  isActive: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  permissionIds: string[];
  permissionCount: number;
  createdAt: string;
}

@Component({
  selector: 'app-roles-permissions',
  templateUrl: './roles-permissions.component.html',
  styleUrls: ['./roles-permissions.component.css']
})
export class RolesPermissionsComponent implements OnInit {
  activeTab: 'roles' | 'permissions' = 'roles';

  roles: Role[] = [];
  permissions: Permission[] = [];
  permMap: Map<string, Permission> = new Map();

  loadingRoles = false;
  loadingPerms = false;
  successMsg = '';
  errorMsg   = '';

  // ── Permission list / filter ─────────────────────
  permModules: string[] = [];
  permsByModule: Record<string, Permission[]> = {};

  // ── Inline Create/Edit Permission form ───────────
  showPermForm    = false;
  isEditingPerm   = false;
  permSubmitting  = false;
  permSubmitted   = false;
  permFormError   = '';
  permForm: { id: string; name: string; module: string; action: string; description: string; isActive: boolean } =
    { id: '', name: '', module: '', action: '', description: '', isActive: true };

  // search within the permission picker (role form)
  rolePermSearch = '';

  // ── Inline role form (Create / Edit) ─────────────
  showRoleForm = false;
  isEditing    = false;
  submitting   = false;
  submitted    = false;
  formError    = '';
  form: { id: string; name: string; description: string; isActive: boolean; permissionIds: string[] } = {
    id: '', name: '', description: '', isActive: true, permissionIds: []
  };

  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPermissions();
    this.loadRoles();
  }

  setTab(t: 'roles' | 'permissions') { this.activeTab = t; this.clearFeedback(); }

  // ── Data loaders ──────────────────────────────────
  loadPermissions() {
    this.loadingPerms = true;
    this.http.get<Permission[]>(`${this.api}/roles/permissions`).subscribe({
      next: (data) => {
        this.permissions = data;
        this.permMap = new Map(data.map(p => [p.id, p]));
        this.buildPermModules();
        this.loadingPerms = false;
      },
      error: () => { this.loadingPerms = false; }
    });
  }

  loadRoles() {
    this.loadingRoles = true;
    this.http.get<Role[]>(`${this.api}/roles`).subscribe({
      next: (data) => { this.roles = data; this.loadingRoles = false; },
      error: () => { this.loadingRoles = false; }
    });
  }

  buildPermModules() {
    this.permsByModule = {};
    for (const p of this.permissions) {
      if (!this.permsByModule[p.module]) this.permsByModule[p.module] = [];
      this.permsByModule[p.module].push(p);
    }
    this.permModules = Object.keys(this.permsByModule).sort();
  }

  // ── Permission CRUD ───────────────────────────────
  openCreatePerm() {
    this.permForm = { id: '', name: '', module: '', action: '', description: '', isActive: true };
    this.isEditingPerm = false; this.permSubmitted = false; this.permFormError = '';
    this.showPermForm = true;
  }

  openEditPerm(p: Permission) {
    this.permForm = { id: p.id, name: p.name, module: p.module, action: p.action, description: p.description, isActive: p.isActive };
    this.isEditingPerm = true; this.permSubmitted = false; this.permFormError = '';
    this.showPermForm = true;
  }

  cancelPermForm() { this.showPermForm = false; this.permFormError = ''; }

  savePerm() {
    this.permSubmitted = true;
    // Accept either explicit module+action OR dot-notation name
    const name = this.permForm.name.trim();
    let mod = this.permForm.module.trim();
    let act = this.permForm.action.trim();

    if (!this.isEditingPerm) {
      if (name && name.includes('.')) {
        const parts = name.split('.');
        mod = mod || parts[0];
        act = act || parts.slice(1).join('.');
      }
      if (!mod || !act) { this.permFormError = 'Permission Name (or Resource + Action) is required.'; return; }
    }

    this.permSubmitting = true; this.permFormError = '';
    const payload: any = {
      module: mod,
      action: act,
      description: this.permForm.description.trim(),
      isActive: this.permForm.isActive,
    };
    if (name) payload.name = name;

    const req = this.isEditingPerm
      ? this.http.put<any>(`${this.api}/roles/permissions/${this.permForm.id}`, payload)
      : this.http.post<any>(`${this.api}/roles/permissions`, payload);

    req.subscribe({
      next: () => {
        this.permSubmitting = false; this.cancelPermForm(); this.loadPermissions();
        this.successMsg = this.isEditingPerm ? 'Permission updated.' : 'Permission created.';
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: (err: any) => { this.permSubmitting = false; this.permFormError = err?.error?.message || 'Failed to save permission.'; }
    });
  }

  deletePerm(p: Permission) {
    if (!confirm(`Delete permission "${p.name}"?`)) return;
    this.http.delete(`${this.api}/roles/permissions/${p.id}`).subscribe({
      next: () => { this.loadPermissions(); this.successMsg = 'Permission deleted.'; setTimeout(() => this.successMsg = '', 4000); },
      error: (err: any) => { this.errorMsg = err?.error?.message || 'Failed to delete.'; setTimeout(() => this.errorMsg = '', 4000); }
    });
  }

  permSearch = '';   // for the permissions table search

  get filteredPermissions(): Permission[] {
    const q = this.permSearch.toLowerCase().trim();
    if (!q) return this.permissions;
    return this.permissions.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.module.toLowerCase().includes(q) ||
      p.action.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  }

  // ── Inline role form helpers ──────────────────────
  openCreate() {
    this.form = { id: '', name: '', description: '', isActive: true, permissionIds: [] };
    this.isEditing = false; this.submitted = false; this.formError = '';
    this.showRoleForm = true;
  }

  openEdit(r: Role) {
    this.form = { id: r.id, name: r.name, description: r.description, isActive: r.isActive, permissionIds: [...(r.permissionIds || [])] };
    this.isEditing = true; this.submitted = false; this.formError = '';
    this.showRoleForm = true;
  }

  cancelForm() { this.showRoleForm = false; this.formError = ''; }

  saveRole() {
    this.submitted = true;
    if (!this.form.name.trim()) { this.formError = 'Role name is required.'; return; }
    this.submitting = true; this.formError = '';
    const payload = { name: this.form.name, description: this.form.description, isActive: this.form.isActive, permissionIds: this.form.permissionIds };

    const req = this.isEditing
      ? this.http.put<any>(`${this.api}/roles/${this.form.id}`, payload)
      : this.http.post<any>(`${this.api}/roles`, payload);

    req.subscribe({
      next: () => {
        this.submitting = false; this.cancelForm(); this.loadRoles();
        this.successMsg = this.isEditing ? 'Role updated.' : 'Role created.';
        setTimeout(() => this.successMsg = '', 4000);
      },
      error: (err: any) => { this.submitting = false; this.formError = err?.error?.message || 'Failed to save role.'; }
    });
  }

  deleteRole(r: Role) {
    if (r.isSystem) { this.errorMsg = 'System roles cannot be deleted.'; setTimeout(() => this.errorMsg = '', 4000); return; }
    if (!confirm(`Delete role "${r.name}"?`)) return;
    this.http.delete(`${this.api}/roles/${r.id}`).subscribe({
      next: () => { this.loadRoles(); this.successMsg = 'Role deleted.'; setTimeout(() => this.successMsg = '', 4000); },
      error: (err: any) => { this.errorMsg = err?.error?.message || 'Failed to delete.'; setTimeout(() => this.errorMsg = '', 4000); }
    });
  }

  // Permission picker
  togglePerm(id: string) {
    const idx = this.form.permissionIds.indexOf(id);
    if (idx === -1) this.form.permissionIds.push(id); else this.form.permissionIds.splice(idx, 1);
  }
  hasPerm(id: string) { return this.form.permissionIds.includes(id); }

  filteredPermsByModule(module: string): Permission[] {
    const q = this.rolePermSearch.toLowerCase().trim();
    return this.permsByModule[module]?.filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    ) || [];
  }

  selectAllInModule(module: string) {
    for (const p of this.permsByModule[module] || []) {
      if (!this.form.permissionIds.includes(p.id)) this.form.permissionIds.push(p.id);
    }
  }

  clearAllInModule(module: string) {
    const ids = new Set((this.permsByModule[module] || []).map(p => p.id));
    this.form.permissionIds = this.form.permissionIds.filter(id => !ids.has(id));
  }

  selectAll() {
    this.form.permissionIds = this.permissions.map(p => p.id);
  }

  clearAll() { this.form.permissionIds = []; }

  // Helpers
  permCountLabel(r: Role): string {
    const c = r.permissionCount ?? r.permissionIds?.length ?? 0;
    return c === 0 ? 'No permissions' : `${c} permission${c === 1 ? '' : 's'}`;
  }

  moduleLabel(m: string): string {
    return m.charAt(0).toUpperCase() + m.slice(1);
  }

  clearFeedback() { this.successMsg = ''; this.errorMsg = ''; }

  get visiblePermModules(): string[] {
    const q = this.rolePermSearch.toLowerCase().trim();
    if (!q) return this.permModules;
    return this.permModules.filter(m => this.filteredPermsByModule(m).length > 0);
  }
}
