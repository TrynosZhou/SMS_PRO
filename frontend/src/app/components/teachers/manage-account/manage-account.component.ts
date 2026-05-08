import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AccountService } from '../../../services/account.service';

@Component({
  selector: 'app-manage-account',
  templateUrl: './manage-account.component.html',
  styleUrls: ['./manage-account.component.css']
})
export class ManageAccountComponent implements OnInit {
  accountInfo: any = null;
  currentUsername = '';
  currentEmail = '';
  newUsername = '';
  newEmail = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loading = false;
  error = '';
  success = '';
  isTeacher = false;
  mustChangePassword = false;
  canChangeUsername = true;

  /** Parent portal layout + mobile nav */
  isParentViewer = false;
  mobileMenuOpen = false;
  isMobile = false;

  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.isParentViewer = this.authService.hasRole('parent');
    this.checkMobile();
    this.loadAccountInfo();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.checkMobile();
  }

  checkMobile() {
    this.isMobile = window.innerWidth <= 900;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  getParentDisplayName(): string {
    const user = this.authService.getCurrentUser();
    const p = user?.parent;
    if (!p) {
      return 'Parent';
    }
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    return name || 'Parent';
  }

  /** Simple password strength 0–4 for UI meter */
  get passwordStrengthScore(): number {
    const p = this.newPassword || '';
    if (!p.length) {
      return 0;
    }
    let score = 1;
    if (p.length >= 8) {
      score++;
    }
    if (p.length >= 12) {
      score++;
    }
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) {
      score++;
    }
    if (/\d/.test(p) || /[^a-zA-Z0-9]/.test(p)) {
      score++;
    }
    return Math.min(4, score);
  }

  get passwordStrengthLabel(): string {
    const s = this.passwordStrengthScore;
    if (!this.newPassword?.length) {
      return '';
    }
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
    return labels[Math.min(s - 1, 3)] || 'Weak';
  }

  loadAccountInfo() {
    this.loading = true;
    this.accountService.getAccountInfo().subscribe({
      next: (data: any) => {
        this.accountInfo = data;
        this.currentUsername = data.username || '';
        this.currentEmail = data.email || '';
        this.newUsername = this.currentUsername;
        this.newEmail = this.currentEmail;
        this.isTeacher = data.role === 'teacher' || data.role === 'hod';
        this.mustChangePassword = data.mustChangePassword === true;
        this.canChangeUsername = !this.isTeacher || !this.mustChangePassword;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load account information';
        this.loading = false;
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  updateAccount() {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill in all password fields';
      return;
    }

    if (this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters long';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirm password do not match';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const updateData: any = {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword
    };

    if (this.canChangeUsername && this.newUsername && this.newUsername !== this.currentUsername) {
      updateData.newUsername = this.newUsername;
    }

    if (!this.isTeacher && this.newEmail && this.newEmail !== this.currentEmail) {
      updateData.newEmail = this.newEmail;
    }

    this.accountService.updateAccount(updateData).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.success = 'Account updated successfully! Redirecting to dashboard...';

        const currentUser = this.authService.getCurrentUser();
        if (currentUser && response.user) {
          currentUser.username = response.user.username || response.user.email;
          localStorage.setItem('user', JSON.stringify(currentUser));
        }

        setTimeout(() => {
          this.navigateToRoleHome();
        }, 2000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error =
            'Your session expired before the server could save changes. Your password was not updated—use your previous password after signing in again. If that still fails, ask an administrator to reset your account password.';
        } else {
          this.error = err.error?.message || 'Failed to update account';
        }
        setTimeout(() => (this.error = ''), 12000);
      }
    });
  }

  private navigateToRoleHome() {
    if (this.authService.hasRole('parent')) {
      this.router.navigate(['/parent/dashboard']);
    } else if (this.authService.hasRole('teacher') || this.authService.hasRole('hod')) {
      this.router.navigate(['/teacher/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  toggleCurrentPasswordVisibility() {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  goToDashboard() {
    this.navigateToRoleHome();
  }

  isCommunicationsActive(): boolean {
    return this.router.url.startsWith('/parent/communications');
  }
}
