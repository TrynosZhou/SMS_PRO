import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  // Tab management
  activeTab: 'signin' | 'signup' | 'reset' | 'student' = 'signin';
  
  // Sign In fields
  email = '';
  password = '';
  
  // Student Login fields
  studentId = '';
  dateOfBirth = '';
  
  // Sign Up fields
  signupRole = '';
  signupUsername = '';
  signupPassword = '';
  signupConfirmPassword = '';
  signupFirstName = '';
  signupLastName = '';
  signupContactNumber = '';
  signupEmail = '';
  /** Self-registration as Student */
  signupDateOfBirth = '';
  signupGender = '';
  /** Self-registration as Parent */
  signupParentGender = '';
  
  // Password Reset fields
  resetEmail = '';
  /** student | teacher | email (parents/staff) */
  resetType: 'student' | 'teacher' | 'email' = 'student';
  resetPasswordStep: 1 | 2 = 1;
  resetPasswordToken = '';
  resetStudentId = '';
  resetStudentDob = '';
  resetTeacherEmployeeId = '';
  resetNewPassword = '';
  resetConfirmPassword = '';
  showResetNewPassword = false;
  showResetConfirmPassword = false;
  
  error = '';
  success = '';
  loading = false;
  
  // Password visibility toggles
  showPassword = false;
  showSignupPassword = false;
  showSignupConfirmPassword = false;

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    const storedMessage = sessionStorage.getItem('sessionMessage');
    if (storedMessage) {
      this.error = storedMessage;
      sessionStorage.removeItem('sessionMessage');
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleSignupPasswordVisibility() {
    this.showSignupPassword = !this.showSignupPassword;
  }

  toggleSignupConfirmPasswordVisibility() {
    this.showSignupConfirmPassword = !this.showSignupConfirmPassword;
  }

  setTab(tab: 'signin' | 'signup' | 'reset' | 'student') {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
    // Clear all fields when switching tabs
    this.email = '';
    this.password = '';
    this.studentId = '';
    this.dateOfBirth = '';
    this.signupRole = '';
    this.signupUsername = '';
    this.signupPassword = '';
    this.signupConfirmPassword = '';
    this.signupFirstName = '';
    this.signupLastName = '';
    this.signupContactNumber = '';
    this.signupEmail = '';
    this.signupDateOfBirth = '';
    this.signupGender = '';
    this.signupParentGender = '';
    this.resetEmail = '';
    this.resetType = 'student';
    this.resetPasswordStep = 1;
    this.resetPasswordToken = '';
    this.resetStudentId = '';
    this.resetStudentDob = '';
    this.resetTeacherEmployeeId = '';
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
    this.showResetNewPassword = false;
    this.showResetConfirmPassword = false;
  }

  setResetType(t: 'student' | 'teacher' | 'email') {
    this.resetType = t;
    this.resetPasswordStep = 1;
    this.resetPasswordToken = '';
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
    this.error = '';
    this.success = '';
  }

  backToResetVerifyStep() {
    this.resetPasswordStep = 1;
    this.resetPasswordToken = '';
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
    this.error = '';
    this.success = '';
  }

  toggleResetNewPasswordVisibility() {
    this.showResetNewPassword = !this.showResetNewPassword;
  }

  toggleResetConfirmPasswordVisibility() {
    this.showResetConfirmPassword = !this.showResetConfirmPassword;
  }

  onSignIn() {
    if (!this.email || !this.password) {
      this.error = 'Please enter username and password';
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        this.loading = false;
        
        if (!response || !response.user) {
          this.error = 'Invalid response from server';
          return;
        }
        
        const user = response.user;
        
        // Ensure token is stored before navigation
        if (!response.token) {
          this.error = 'Authentication token not received';
          return;
        }
        
        // Verify authentication is complete before navigation
        // The tap operator in authService.login() already stored token and user
        if (!this.authService.isAuthenticated()) {
          console.error('Authentication not complete after login');
          this.error = 'Authentication failed. Please try again.';
          return;
        }
        
        // Navigate immediately - token and user are already stored
        // Check if student login - redirect to student dashboard
        if (user.role === 'student') {
          this.router.navigate(['/student/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
        // Check if teacher must change password
        else if ((user.role === 'teacher' || user.role === 'hod') && user.mustChangePassword) {
          // Navigate to manage account page
          this.router.navigate(['/teacher/manage-account']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
        // Check if teacher login - redirect to teacher dashboard
        else if (user.role === 'teacher' || user.role === 'hod') {
          // Navigate to teacher dashboard
          this.router.navigate(['/teacher/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
        // Check if parent needs to link students
        else if (user.role === 'parent' && user.parent) {
          // Check if parent has linked students
          this.authService.getParentStudents().subscribe({
            next: (students: any[]) => {
              if (students.length === 0) {
                // Navigate to student linking page
                this.router.navigate(['/parent/link-students']).catch(err => {
                  console.error('Navigation error:', err);
                  this.error = 'Failed to navigate. Please try again.';
                });
              } else {
                // Navigate to parent dashboard
                this.router.navigate(['/parent/dashboard']).catch(err => {
                  console.error('Navigation error:', err);
                  this.error = 'Failed to navigate. Please try again.';
                });
              }
            },
            error: (err) => {
              console.error('Error fetching parent students:', err);
              // Navigate to student linking page if error
              this.router.navigate(['/parent/link-students']).catch(navErr => {
                console.error('Navigation error:', navErr);
                this.error = 'Failed to navigate. Please try again.';
              });
            }
          });
        }
        // Check if student login - redirect to student dashboard
        else if (user.role === 'student') {
          this.router.navigate(['/student/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        } else {
          // Navigate to regular dashboard for other roles
          this.router.navigate(['/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
      },
      error: (err: any) => {
        const msg = err.error?.message || err.message;
        console.error('Login failed:', msg || err.status);
        console.error('Login error detail:', err);
        console.error('Error status:', err.status);
        console.error('Error message:', msg);
        
        if (err.status === 0) {
          // Connection error - server not reachable
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.status === 401) {
          // Unauthorized - invalid credentials
          this.error = err.error?.message || 'Invalid username or password. Please try again.';
        } else if (err.status === 500) {
          // Server error
          this.error = 'Server error. Please try again later.';
        } else {
          // Other errors
          this.error = err.error?.message || err.message || 'Login failed. Please check your credentials.';
        }
        
        this.loading = false;
      }
    });
  }

  onSignUp() {
    // Validation
    const contactRequired = true;
    if (!this.signupRole || !this.signupUsername || !this.signupPassword || !this.signupConfirmPassword || 
        !this.signupFirstName || !this.signupLastName || (contactRequired && !this.signupContactNumber)) {
      this.error = 'Please fill in all fields';
      return;
    }

    if (this.signupRole === 'PARENT') {
      if (!this.signupEmail) {
        this.error = 'Please provide an email address';
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(this.signupEmail)) {
        this.error = 'Please enter a valid email address';
        return;
      }
    }

    if (this.signupRole === 'PARENT') {
      if (!this.signupParentGender) {
        this.error = 'Please select gender';
        return;
      }
    }

    if (this.signupRole === 'STUDENT') {
      if (!this.signupDateOfBirth) {
        this.error = 'Please enter your date of birth';
        return;
      }
      if (!this.signupGender) {
        this.error = 'Please select gender';
        return;
      }
    }

    if (this.signupPassword.length < 8) {
      this.error = 'Password must be at least 8 characters long';
      return;
    }

    if (this.signupPassword !== this.signupConfirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    const validRoles = ['STUDENT', 'PARENT'];
    if (!validRoles.includes(this.signupRole)) {
      this.error = 'Please select a valid role';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Convert role to lowercase for backend enum
    const roleLower = this.signupRole.toLowerCase();
    
    // Determine email per role (backend also enforces student.local for students)
    let generatedEmail = '';
    switch (this.signupRole) {
      case 'PARENT':
        generatedEmail = this.signupEmail.trim();
        break;
      case 'STUDENT':
        generatedEmail = `${this.signupUsername.trim()}@student.local`;
        break;
      default:
        this.error = 'Invalid role';
        return;
    }

    const registerData: any = {
      username: this.signupUsername.trim(),
      password: this.signupPassword,
      email: generatedEmail,
      role: roleLower,
      userRole: roleLower,
      signupRole: roleLower,
      firstName: this.signupFirstName.trim(),
      lastName: this.signupLastName.trim(),
      phoneNumber: this.signupContactNumber.trim() || null,
      contactNumber: this.signupContactNumber.trim() || null
    };

    if (this.signupRole === 'STUDENT') {
      registerData.dateOfBirth = this.signupDateOfBirth;
      registerData.gender = this.signupGender;
    }
    if (this.signupRole === 'PARENT') {
      registerData.gender = this.signupParentGender;
    }

    this.authService.register(registerData).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Account created successfully! Please sign in.';
        setTimeout(() => {
          this.setTab('signin');
        }, 2000);
      },
      error: (err: any) => {
        // Prefer backend-provided JSON error messages.
        const backendMsg =
          err?.error?.message ||
          (typeof err?.error === 'string' ? err.error : null) ||
          (err?.error ? JSON.stringify(err.error) : null);

        // Helpful console log for production issues (message first so it is visible without expanding).
        console.error('[SignUp] Registration failed:', backendMsg || err?.status || 'unknown');
        console.error('[SignUp] Registration error detail:', {
          status: err?.status,
          backendMsg,
          raw: err?.error ?? err,
        });

        this.error = backendMsg || 'Registration failed';
        this.loading = false;
      }
    });
  }

  /** Email-based reset (parents / staff with email on file) */
  onResetPasswordEmail() {
    if (!this.resetEmail) {
      this.error = 'Please enter your email';
      return;
    }

    this.loading = true;
    this.error = '';
    
    this.authService.requestPasswordReset(this.resetEmail).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'If the email exists, password reset instructions have been sent.';
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to send reset email';
        this.loading = false;
      }
    });
  }

  verifyStudentForReset() {
    if (!this.resetStudentId?.trim() || !this.resetStudentDob) {
      this.error = 'Please enter Student ID and Date of Birth';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.authService
      .verifyStudentPasswordReset(this.resetStudentId.trim(), this.resetStudentDob)
      .subscribe({
        next: (res: any) => {
          this.loading = false;
          if (res?.token) {
            this.resetPasswordToken = res.token;
            this.resetPasswordStep = 2;
            this.success = res.message || 'Enter your new password below.';
          } else {
            this.error = 'Could not verify your details. Please try again.';
          }
        },
        error: (err: any) => {
          this.loading = false;
          this.error = err.error?.message || 'Invalid Student ID or date of birth';
        },
      });
  }

  verifyTeacherForReset() {
    if (!this.resetTeacherEmployeeId?.trim()) {
      this.error = 'Please enter your Employee ID';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.authService.verifyTeacherPasswordReset(this.resetTeacherEmployeeId.trim()).subscribe({
      next: (res: any) => {
        this.loading = false;
        if (res?.token) {
          this.resetPasswordToken = res.token;
          this.resetPasswordStep = 2;
          this.success = res.message || 'Enter your new password below.';
        } else {
          this.error = 'Could not verify your details. Please try again.';
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Invalid Employee ID';
      },
    });
  }

  onResetPasswordSave() {
    if (!this.resetPasswordToken) {
      this.error = 'Please verify your identity first (go back to step 1).';
      return;
    }
    if (!this.resetNewPassword || !this.resetConfirmPassword) {
      this.error = 'Please enter and confirm your new password';
      return;
    }
    if (this.resetNewPassword !== this.resetConfirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }
    if (this.resetNewPassword.length < 8) {
      this.error = 'Password must be at least 8 characters long';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.authService.resetPassword(this.resetPasswordToken, this.resetNewPassword).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Password saved successfully. You can sign in with your new password.';
        this.resetPasswordStep = 1;
        this.resetPasswordToken = '';
        this.resetNewPassword = '';
        this.resetConfirmPassword = '';
        setTimeout(() => {
          this.setTab('signin');
        }, 2000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to save new password';
      },
    });
  }

  onStudentLogin(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!this.studentId || !this.dateOfBirth) {
      this.error = 'Please enter Student ID and Date of Birth';
      return;
    }

    console.log('[Student Login] Attempting login with:', { 
      studentId: this.studentId.trim(), 
      dateOfBirth: this.dateOfBirth,
      activeTab: this.activeTab 
    });

    this.loading = true;
    this.error = '';
    this.authService.studentLogin(this.studentId.trim(), this.dateOfBirth).subscribe({
      next: (response: any) => {
        this.loading = false;
        
        if (!response || !response.user) {
          this.error = 'Invalid response from server';
          return;
        }
        
        const user = response.user;
        
        // Ensure token is stored before navigation
        if (!response.token) {
          this.error = 'Authentication token not received';
          return;
        }
        
        // Verify authentication is complete before navigation
        if (!this.authService.isAuthenticated()) {
          console.error('Authentication not complete after login');
          this.error = 'Authentication failed. Please try again.';
          return;
        }
        
        // Navigate to student dashboard
        if (user.role === 'student') {
          this.router.navigate(['/student/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        } else {
          this.error = 'Invalid user role';
        }
      },
      error: (err: any) => {
        console.error('Student login error:', err);
        console.error('Error status:', err.status);
        console.error('Error message:', err.error?.message || err.message);
        
        if (err.status === 0) {
          // Connection error - server not reachable
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.status === 401) {
          // Unauthorized - invalid credentials
          this.error = err.error?.message || 'Invalid Student ID or Date of Birth. Please try again.';
        } else if (err.status === 500) {
          // Server error
          this.error = 'Server error. Please try again later.';
        } else {
          // Other errors
          this.error = err.error?.message || err.message || 'Login failed. Please check your credentials.';
        }
        
        this.loading = false;
      }
    });
  }
}

