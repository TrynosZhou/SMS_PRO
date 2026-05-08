import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { InventoryService } from '../../../services/inventory.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-inventory',
  templateUrl: './student-inventory.component.html',
  styleUrls: ['./student-inventory.component.css'],
})
export class StudentInventoryComponent implements OnInit {
  loading = true;
  error = '';
  summary: any = null;

  constructor(private inv: InventoryService, private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    if (!this.auth.isAuthenticated() || String(this.auth.getCurrentUser()?.role).toLowerCase() !== 'student') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.inv.mySummary().subscribe({
      next: s => {
        this.summary = s;
        this.loading = false;
      },
      error: e => {
        this.error = e?.error?.message || 'Could not load inventory.';
        this.loading = false;
      },
    });
  }
}
