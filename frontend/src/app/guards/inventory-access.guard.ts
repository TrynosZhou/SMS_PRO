import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

const INVENTORY_ROLES = ['teacher', 'librarian', 'inventory_clerk', 'hod', 'admin', 'superadmin'];

@Injectable({ providedIn: 'root' })
export class InventoryAccessGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/']);
      return false;
    }
    const role = String(this.auth.getCurrentUser()?.role || '').toLowerCase();
    if (INVENTORY_ROLES.includes(role)) return true;
    this.router.navigate(['/dashboard']);
    return false;
  }
}
