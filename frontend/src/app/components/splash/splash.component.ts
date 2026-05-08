import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.css']
})
export class SplashComponent implements OnInit, OnDestroy {
  private navigateTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.navigateTimeoutId = setTimeout(() => {
      if (!this.authService.isAuthenticated()) {
        this.router.navigate(['/login']);
        return;
      }

      const user = this.authService.getCurrentUser();
      const role = (user?.role || '').toLowerCase();

      if (role === 'parent') {
        this.router.navigate(['/parent/dashboard']);
        return;
      }

      if (role === 'teacher' || role === 'hod') {
        this.router.navigate(['/teacher/dashboard']);
        return;
      }

      this.router.navigate(['/dashboard']);
    }, 3500);
  }

  ngOnDestroy(): void {
    if (this.navigateTimeoutId) {
      clearTimeout(this.navigateTimeoutId);
    }
  }
}
