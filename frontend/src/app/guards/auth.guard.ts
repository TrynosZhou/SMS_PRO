import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const user = this.authService.getCurrentUser();
    if (user?.role === 'accountant') {
      const allowedPrefixes = ['/dashboard', '/students', '/invoices', '/user_log', '/audit_log', '/settings', '/payroll'];
      const isAllowed = allowedPrefixes.some(prefix => state.url.startsWith(prefix));
      if (!isAllowed) {
        this.router.navigate(['/invoices']);
        return false;
      }
    }

    return true;
  }
}

