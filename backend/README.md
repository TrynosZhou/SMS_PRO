# Backend - School Management System

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file in the backend directory with the following:
   ```
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=your_password
   DB_NAME=sms_db
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d
   ```

3. **Create PostgreSQL Database**
   ```sql
   CREATE DATABASE sms_db;
   ```

4. **Run the Server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm run build
   npm start
   ```

The server will start on `http://localhost:3000`

## API Endpoints

All endpoints are prefixed with `/api`

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register new user

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get student by ID
- `POST /api/students` - Create student (Admin only)
- `PUT /api/students/:id` - Update student (Admin only)
- `POST /api/students/enroll` - Enroll student in class (Admin only)

### Teachers
- `GET /api/teachers` - Get all teachers
- `GET /api/teachers/:id` - Get teacher by ID
- `POST /api/teachers` - Create teacher (Admin only)
- `PUT /api/teachers/:id` - Update teacher (Admin only)

### Exams
- `GET /api/exams` - Get all exams
- `POST /api/exams` - Create exam (Admin/Teacher)
- `POST /api/exams/marks` - Capture marks (Teacher)
- `GET /api/exams/marks` - Get marks
- `GET /api/exams/rankings/class` - Get class rankings
- `GET /api/exams/rankings/subject` - Get subject rankings
- `GET /api/exams/rankings/form` - Get form rankings
- `GET /api/exams/report-card` - Get report card

### Finance
- `GET /api/finance` - Get all invoices
- `POST /api/finance` - Create invoice (Admin only)
- `PUT /api/finance/:id/payment` - Update payment (Admin only)
- `POST /api/finance/calculate-balance` - Calculate next term balance (Admin only)

### Classes & Subjects
- `GET /api/classes` - Get all classes
- `POST /api/classes` - Create class
- `GET /api/subjects` - Get all subjects
- `POST /api/subjects` - Create subject

