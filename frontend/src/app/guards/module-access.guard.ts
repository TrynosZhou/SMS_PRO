import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { ModuleAccessService } from '../services/module-access.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private moduleAccessService: ModuleAccessService,
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const moduleName = route.data['module'] as string;
    
    if (!moduleName) {
      // If no module specified, allow access
      return true;
    }

    const hasAccess = this.moduleAccessService.canAccessModule(moduleName);
    
    if (!hasAccess) {
      // Redirect to appropriate dashboard based on role
      const user = this.authService.getCurrentUser();
      if (user) {
        const role = user.role.toLowerCase();
        switch (role) {
          case 'teacher':
          case 'hod':
            this.router.navigate(['/teacher/dashboard']);
            break;
          case 'parent':
            this.router.navigate(['/parent/dashboard']);
            break;
          case 'admin':
          case 'superadmin':
            this.router.navigate(['/admin/dashboard']);
            break;
          default:
            this.router.navigate(['/']);
        }
      } else {
        // Send unauthenticated users through the splash screen first.
        this.router.navigate(['/']);
      }
      return false;
    }
    
    return true;
  }
}

