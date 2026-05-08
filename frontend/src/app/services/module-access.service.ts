import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';
import { Observable, of } from 'rxjs';
import { map, catchError, filter } from 'rxjs/operators';

export interface ModuleAccess {
  teachers?: {
    students?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    settings?: boolean;
    recordBook?: boolean;
    attendance?: boolean;
  };
  parents?: {
    reportCards?: boolean;
    invoices?: boolean;
    dashboard?: boolean;
  };
  accountant?: {
    students?: boolean;
    invoices?: boolean;
    finance?: boolean;
    dashboard?: boolean;
    settings?: boolean;
  };
  admin?: {
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    dashboard?: boolean;
  };
  superadmin?: {
    [key: string]: boolean; // Superadmin has access to everything
  };
  demo_user?: {
    dashboard?: boolean;
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessService {
  private moduleAccess: ModuleAccess | null = null;
  private defaultAccess: ModuleAccess = {
    teachers: {
      students: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: false, // Teachers cannot access finance by default
      settings: false,
      recordBook: true,
      attendance: true
    },
    parents: {
      reportCards: true,
      invoices: true,
      dashboard: true
    },
    accountant: {
      students: true,
      invoices: true,
      finance: true,
      dashboard: true,
      settings: false
    },
    admin: {
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: true,
      attendance: true,
      settings: true,
      dashboard: true
    },
    superadmin: {}, // All access
    demo_user: {
      dashboard: true,
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: true,
      attendance: true,
      settings: false // Demo users cannot access settings
    }
  };

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService
  ) {
    // Always initialize with default access
    this.moduleAccess = this.defaultAccess;
    
    // Load module access from settings if user is authenticated
    if (this.authService.isAuthenticated()) {
      this.loadModuleAccess();
    }
    
    // Subscribe to auth state changes to refresh module access on login
    this.authService.currentUser$.pipe(
      filter(user => user !== null)
    ).subscribe(() => {
      // User just logged in, refresh module access
      if (this.authService.isAuthenticated()) {
        this.loadModuleAccess();
      }
    });
  }

  loadModuleAccess(): void {
    // Check if user is authenticated before making API call
    if (!this.authService.isAuthenticated()) {
      this.moduleAccess = this.defaultAccess;
      return;
    }

    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings && settings.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
      },
      error: (err) => {
        // Silently fall back to default access on error (401, 403, etc.)
        this.moduleAccess = this.defaultAccess;
      }
    });
  }

  canAccessModule(moduleName: string): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;

    const role = user.role.toLowerCase();

    // Superadmin has access to everything
    if (role === 'superadmin') return true;

    // Students don't use module access - they have direct access to their own data
    if (role === 'student') return true;

    // Map role names to module access keys (handle singular/plural differences)
    const roleMap: { [key: string]: string } = {
      'teacher': 'teachers',
      'hod': 'teachers',
      'parent': 'parents',
      'accountant': 'accountant',
      'admin': 'admin',
      'superadmin': 'superadmin',
      'demo_user': 'demo_user',
      'student': 'students'
    };

    const accessKey = roleMap[role] || role;

    // Get module access for the user's role
    const access = this.moduleAccess || this.defaultAccess;
    const roleAccess = (access as any)[accessKey];

    if (!roleAccess) {
      console.warn(`No module access found for role: ${role} (mapped to: ${accessKey})`);
      return false;
    }

    // Check if the module is explicitly allowed
    const hasAccess = roleAccess[moduleName] !== false;
    return hasAccess;
  }

  getModuleAccess(): ModuleAccess {
    return this.moduleAccess || this.defaultAccess;
  }

  refreshModuleAccess(): Observable<boolean> {
    // Check if user is authenticated before making API call
    if (!this.authService.isAuthenticated()) {
      this.moduleAccess = this.defaultAccess;
      return of(false);
    }

    return this.settingsService.getSettings().pipe(
      map((settings: any) => {
        if (settings && settings.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
        return true;
      }),
      catchError((err) => {
        // Silently fall back to default access on error
        this.moduleAccess = this.defaultAccess;
        return of(false);
      })
    );
  }
}

