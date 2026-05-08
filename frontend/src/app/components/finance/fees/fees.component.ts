import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

interface FeeItem {
  id: string;
  categoryId: string;
  subCategory: string;
  itemName: string;
  amount: number;
  currency: string;
  sortOrder: number;
}

interface FeeCategory {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  items: FeeItem[];
}

@Component({
  selector: 'app-fees',
  templateUrl: './fees.component.html',
  styleUrls: ['./fees.component.css'],
})
export class FeesComponent implements OnInit {
  private apiUrl = `${environment.apiUrl}/fees`;

  categories: FeeCategory[] = [];
  loading = false;
  error = '';
  successMsg = '';

  // Add Fee modal
  showAddModal = false;
  addSubmitting = false;
  addError = '';
  addForm = this.blankAddForm();

  // Edit Fee modal
  showEditModal = false;
  editSubmitting = false;
  editError = '';
  editForm: any = {};

  // Add Category modal
  showCatModal = false;
  catSubmitting = false;
  catError = '';
  catForm = { name: '', description: '' };

  // Confirm delete
  showDeleteModal = false;
  deleteTarget: { type: 'item' | 'category'; id: string; label: string } | null = null;
  deleting = false;

  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit() {
    this.load();
  }

  private headers(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  load() {
    this.loading = true;
    this.error = '';
    this.http.get<FeeCategory[]>(`${this.apiUrl}/categories`, { headers: this.headers() }).subscribe({
      next: data => { this.categories = data; this.loading = false; },
      error: e => { this.error = e?.error?.message || 'Failed to load fees'; this.loading = false; },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  subCategories(cat: FeeCategory): string[] {
    const set = new Set(cat.items.map(i => i.subCategory));
    return Array.from(set);
  }

  itemsFor(cat: FeeCategory, sub: string): FeeItem[] {
    return cat.items.filter(i => i.subCategory === sub);
  }

  subTotal(cat: FeeCategory, sub: string): number {
    return this.itemsFor(cat, sub).reduce((s, i) => s + Number(i.amount), 0);
  }

  catTotal(cat: FeeCategory): number {
    return cat.items.reduce((s, i) => s + Number(i.amount), 0);
  }

  fmt(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get allSubCategories(): string[] {
    const set = new Set<string>();
    this.categories.forEach(c => c.items.forEach(i => set.add(i.subCategory)));
    const common = ['Day Scholars', 'Boarders'];
    common.forEach(s => set.add(s));
    return Array.from(set);
  }

  private blankAddForm() {
    return { categoryId: '', subCategory: '', itemName: '', amount: 0, currency: 'USD' };
  }

  private flash(msg: string) {
    this.successMsg = msg;
    setTimeout(() => (this.successMsg = ''), 3500);
  }

  // ── Add Fee Modal ─────────────────────────────────────────────────────────

  openAddFee() {
    this.addForm = this.blankAddForm();
    this.addError = '';
    this.showAddModal = true;
  }

  cancelAdd() { this.showAddModal = false; }

  saveNewFee() {
    if (!this.addForm.categoryId) { this.addError = 'Select a category'; return; }
    if (!this.addForm.subCategory.trim()) { this.addError = 'Sub-category is required'; return; }
    if (!this.addForm.itemName.trim()) { this.addError = 'Item name is required'; return; }
    this.addSubmitting = true;
    this.addError = '';
    this.http.post(`${this.apiUrl}/items`, this.addForm, { headers: this.headers() }).subscribe({
      next: () => {
        this.addSubmitting = false;
        this.showAddModal = false;
        this.flash('Fee item added successfully');
        this.load();
      },
      error: e => { this.addError = e?.error?.message || 'Save failed'; this.addSubmitting = false; },
    });
  }

  // ── Edit Fee Modal ────────────────────────────────────────────────────────

  openEditItem(item: FeeItem) {
    this.editForm = { ...item };
    this.editError = '';
    this.showEditModal = true;
  }

  cancelEdit() { this.showEditModal = false; }

  saveEdit() {
    if (!this.editForm.itemName.trim()) { this.editError = 'Item name is required'; return; }
    this.editSubmitting = true;
    this.editError = '';
    this.http.put(`${this.apiUrl}/items/${this.editForm.id}`, this.editForm, { headers: this.headers() }).subscribe({
      next: () => {
        this.editSubmitting = false;
        this.showEditModal = false;
        this.flash('Fee item updated');
        this.load();
      },
      error: e => { this.editError = e?.error?.message || 'Update failed'; this.editSubmitting = false; },
    });
  }

  // ── Add Category Modal ────────────────────────────────────────────────────

  openAddCategory() {
    this.catForm = { name: '', description: '' };
    this.catError = '';
    this.showCatModal = true;
  }

  cancelCat() { this.showCatModal = false; }

  saveCat() {
    if (!this.catForm.name.trim()) { this.catError = 'Category name is required'; return; }
    this.catSubmitting = true;
    this.catError = '';
    this.http.post(`${this.apiUrl}/categories`, this.catForm, { headers: this.headers() }).subscribe({
      next: () => {
        this.catSubmitting = false;
        this.showCatModal = false;
        this.flash('Category created');
        this.load();
      },
      error: e => { this.catError = e?.error?.message || 'Save failed'; this.catSubmitting = false; },
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  confirmDeleteItem(item: FeeItem) {
    this.deleteTarget = { type: 'item', id: item.id, label: item.itemName };
    this.showDeleteModal = true;
  }

  confirmDeleteCategory(cat: FeeCategory) {
    this.deleteTarget = { type: 'category', id: cat.id, label: cat.name };
    this.showDeleteModal = true;
  }

  cancelDelete() { this.showDeleteModal = false; this.deleteTarget = null; }

  doDelete() {
    if (!this.deleteTarget) return;
    this.deleting = true;
    const url = this.deleteTarget.type === 'item'
      ? `${this.apiUrl}/items/${this.deleteTarget.id}`
      : `${this.apiUrl}/categories/${this.deleteTarget.id}`;
    this.http.delete(url, { headers: this.headers() }).subscribe({
      next: () => {
        this.deleting = false;
        this.showDeleteModal = false;
        this.deleteTarget = null;
        this.flash('Deleted successfully');
        this.load();
      },
      error: e => {
        this.error = e?.error?.message || 'Delete failed';
        this.deleting = false;
        this.showDeleteModal = false;
      },
    });
  }
}
