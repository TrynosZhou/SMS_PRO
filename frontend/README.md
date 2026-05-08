# Frontend - School Management System

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure API URL**
   The API URL is set in the services. Default is `http://localhost:3000/api`
   If your backend runs on a different port, update the `apiUrl` in:
   - `src/app/services/auth.service.ts`
   - `src/app/services/student.service.ts`
   - `src/app/services/teacher.service.ts`
   - `src/app/services/exam.service.ts`
   - `src/app/services/finance.service.ts`
   - `src/app/services/class.service.ts`
   - `src/app/services/subject.service.ts`

3. **Start Development Server**
   ```bash
   npm start
   ```

   The application will open at `http://localhost:4200`

4. **Build for Production**
   ```bash
   npm run build
   ```

   The production build will be in the `dist/sms-frontend` directory.

## Features

- **Student Management**: View, create, edit, and enroll students
- **Teacher Management**: View, create, and edit teachers
- **Exam Management**: Create exams, enter marks, view rankings
- **Report Cards**: Generate and view report cards (role-based access)
- **Finance Management**: Create invoices, track payments, calculate balances

## User Roles

- **Admin**: Full access to all features
- **Teacher**: Can capture marks and view report cards for their classes
- **Parent**: Can only view report cards and invoices for their children
- **Student**: Basic access (can be extended)

