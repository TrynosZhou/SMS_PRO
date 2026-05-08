# Demo Account Enhancements

## Overview
This document outlines the changes made to enhance the demo account functionality, allowing demo users to have full access to all modules except settings, with the ability to add new data.

## Changes Made

### 1. Backend Changes

#### A. User Entity (`backend/src/entities/User.ts`)
- Added `DEMO_USER` role to the `UserRole` enum
- This allows demo accounts to have a distinct role in the system

#### B. Settings Entity (`backend/src/entities/Settings.ts`)
- Extended `demoAccount` module access to include:
  - `assignments`
  - `messages`
  - `accounts`
- These modules are now controllable from the settings page

#### C. Settings Controller (`backend/src/controllers/settings.controller.ts`)
- Updated `DEFAULT_MODULE_ACCESS` for demo accounts to include:
  - All existing modules (dashboard, students, teachers, classes, subjects, exams, reportCards, rankings, finance, attendance)
  - New modules: assignments, messages, accounts
  - Settings remains `false` (read-only)

#### D. Account Controller (`backend/src/controllers/account.controller.ts`)
- Enhanced `createUserAccount` function to automatically set `isDemo` flag when creating a user with `DEMO_USER` role
- Demo users don't need to change their password on first login
- Demo users are not marked as temporary accounts

#### E. Route Authorization Updates
Updated the following routes to include `UserRole.DEMO_USER`:

**Student Routes** (`backend/src/routes/student.routes.ts`):
- POST `/` - Register student
- POST `/enroll` - Enroll student
- POST `/promote` - Promote students
- PUT `/:id` - Update student
- DELETE `/:id` - Delete student

**Teacher Routes** (`backend/src/routes/teacher.routes.ts`):
- POST `/` - Register teacher
- POST `/:id/create-account` - Create teacher account
- PUT `/:id` - Update teacher
- DELETE `/:id` - Delete teacher

**Class Routes** (`backend/src/routes/class.routes.ts`):
- POST `/` - Create class
- PUT `/:id` - Update class
- DELETE `/:id` - Delete class

**Subject Routes** (`backend/src/routes/subject.routes.ts`):
- POST `/` - Create subject
- PUT `/:id` - Update subject
- DELETE `/:id` - Delete subject

**Exam Routes** (`backend/src/routes/exam.routes.ts`):
- POST `/` - Create exam
- POST `/publish` - Publish exam
- POST `/publish-by-type` - Publish exam by type
- POST `/marks` - Capture marks
- POST `/report-card/remarks` - Save remarks
- GET `/mark-sheet` - Generate mark sheet
- GET `/mark-sheet/pdf` - Generate mark sheet PDF
- DELETE `/all` - Delete all exams
- DELETE `/:id` - Delete exam

**Finance Routes** (`backend/src/routes/finance.routes.ts`):
- POST `/` - Create invoice
- POST `/bulk` - Create bulk invoices
- PUT `/:id/payment` - Update invoice payment
- POST `/calculate-balance` - Calculate next term balance

**Attendance Routes** (`backend/src/routes/attendance.routes.ts`):
- POST `/` - Mark attendance
- GET `/` - Get attendance records
- GET `/report` - Get attendance report

**Promotion Rule Routes** (`backend/src/routes/promotion-rule.routes.ts`):
- POST `/` - Create promotion rule
- PUT `/:id` - Update promotion rule
- DELETE `/:id` - Delete promotion rule

### 2. Frontend Changes

#### A. Settings Component TypeScript (`frontend/src/app/components/settings/settings.component.ts`)
- Updated default `demoAccount` module access to include:
  - `assignments: true`
  - `messages: true`
  - `accounts: true`

#### B. Settings Component HTML (`frontend/src/app/components/settings/settings.component.html`)
- Added checkboxes for new demo account modules:
  - Assignments
  - Messages
  - Accounts
- These appear in the "Demo Account Access" section of the Module Access Control area

#### C. Settings Component CSS (`frontend/src/app/components/settings/settings.component.css`)
- Added styles for demo mode indicators:
  - `.demo-warning-banner` - Yellow banner at top of page
  - `.demo-readonly-notice` - Notice within form sections
  - Disabled state styling for read-only mode

## Demo Account Permissions Summary

### ✅ Full Access (Can View and Modify)
- Dashboard
- Students (add, edit, delete)
- Teachers (add, edit, delete)
- Classes (add, edit, delete)
- Subjects (add, edit, delete)
- Exams (create, publish, add marks)
- Report Cards (view, generate, add remarks)
- Rankings (view all types)
- Finance (create invoices, record payments)
- Attendance (mark, view reports)
- Assignments (if implemented)
- Messages (if implemented)
- Accounts (view, limited creation)

### ❌ Read-Only Access
- Settings (can view but cannot modify)

## Testing Recommendations

1. **Create a Demo User**:
   - Login as Admin or SuperAdmin
   - Go to Manage Accounts
   - Create a new user with role "Demo User"
   - Verify the account is created with `isDemo: true`

2. **Test Module Access**:
   - Login as the demo user
   - Verify all modules are accessible except Settings
   - Try to modify settings (should be blocked)

3. **Test Data Creation**:
   - As demo user, try to:
     - Add a new student
     - Add a new teacher
     - Create a new class
     - Add a new subject
     - Create an exam
     - Record attendance
     - Generate invoices
   - All operations should succeed

4. **Test Settings Read-Only**:
   - As demo user, navigate to Settings
   - Verify the page shows "Demo Mode — Read Only" banner
   - Verify all form fields are disabled
   - Verify the save button is disabled

## Security Notes

- Demo users cannot access or modify system settings
- Demo users cannot create Super Admin accounts
- Demo users follow the same authentication and authorization flow as other users
- The `isDemo` flag is automatically set when creating users with the `DEMO_USER` role
- Demo users don't need to change their password (no forced password change)

## Future Enhancements

Consider implementing:
1. Data isolation for demo accounts (separate demo data from production)
2. Automatic data reset for demo accounts (scheduled cleanup)
3. Rate limiting for demo accounts to prevent abuse
4. Demo account activity logging for analytics
5. Time-based demo account expiration

