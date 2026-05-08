import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    const token = this.authService.getToken();

    // Normalize malformed production URLs (e.g. onrender....api) before request dispatch.
    const normalizedUrl = this.normalizeApiUrl(req.url);
    let authReq = normalizedUrl !== req.url ? req.clone({ url: normalizedUrl }) : req;
    
    // Clone the request and add the authorization header if token exists
    if (token) {
      authReq = authReq.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    
    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle 401 errors
        if (error.status === 401) {
          // Skip auto-logout for auth endpoints (login, register, reset-password)
          const isAuthEndpoint = authReq.url.includes('/auth/login') || 
                                 authReq.url.includes('/auth/register') || 
                                 authReq.url.includes('/auth/reset-password');
          
          if (!isAuthEndpoint && token) {
            // Token is invalid or expired - clear it and redirect to login
            console.warn('Authentication failed - token may be expired or invalid');
            this.authService.logout('unauthorized');
          }
        }
        
        // Handle 400 errors related to school context (indicates old token format)
        if (error.status === 400) {
          const errorMessage = error.error?.message || '';
          const isSchoolContextError = errorMessage.toLowerCase().includes('school context') ||
                                       errorMessage.toLowerCase().includes('school context not found');
          
          if (isSchoolContextError && token) {
            console.warn('School context missing - token may be outdated. Please log out and log back in.');
            // Don't auto-logout, but log the warning - user should manually re-login
            // This allows them to see the error and understand they need to refresh their session
          }
        }
        
        return throwError(() => error);
      })
    );
  }

  private normalizeApiUrl(url: string): string {
    if (!url || !url.includes('onrender')) {
      return url;
    }

    let normalized = url.trim();

    // Fix common malformed Render hosts:
    // - sms-xxx.onrender....api -> sms-xxx.onrender.com/api
    // - sms-xxx.onrender/api     -> sms-xxx.onrender.com/api
    normalized = normalized.replace(/\.onrender\.\.\.\.+api/i, '.onrender.com/api');
    normalized = normalized.replace(/\.onrender\.\.\.\.?api/i, '.onrender.com/api');
    normalized = normalized.replace(/\.onrender\/api/i, '.onrender.com/api');
    normalized = normalized.replace(/\.onrender(?=\/|$)/i, '.onrender.com');
    normalized = normalized.replace(/^https:\//i, 'https://').replace(/^http:\//i, 'http://');

    return normalized;
  }
}

