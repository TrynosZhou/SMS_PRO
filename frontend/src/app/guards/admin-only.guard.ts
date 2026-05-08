import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AdminOnlyGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    const user = this.authService.getCurrentUser();
    if (user && (user.role === 'admin' || user.role === 'superadmin')) {
      return true;
    }
    this.router.navigate(['/dashboard']);
    return false;
  }
}
