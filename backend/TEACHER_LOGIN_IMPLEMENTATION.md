# Teacher Login Implementation

## Overview

This document describes the implementation of teacher login functionality that authenticates teachers using username and password, then fetches their full name and all active classes they teach.

## Requirements

1. **Authentication**: Teachers log in with username (TeacherID) and password
2. **Teacher Lookup**: Find teacher record using `users.id` → `teachers.userId`
3. **Full Name**: Build full name from `firstName + lastName`
4. **Classes Fetch**: Query `teacher_classes` junction table joined with `classes` where `classes.isActive = TRUE`
5. **API Response**: Return token, teacher object with full name, and classes list

## Implementation

### Backend: Login Endpoint

**File:** `backend/src/controllers/auth.controller.ts`

**Flow:**

1. **Authenticate User**
   ```typescript
   const user = await userRepository.findOne({
     where: { username: loginIdentifier }
   });
   // Verify password with bcrypt
   ```

2. **Find Teacher by userId**
   ```typescript
   let teacher = await teacherRepository.findOne({
     where: { userId: user.id }
   });
   ```

3. **Build Full Name**
   ```typescript
   const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher';
   ```

4. **Fetch Active Classes from Junction Table**
   ```typescript
   const teacherClasses = await teacherClassRepository
     .createQueryBuilder('tc')
     .innerJoinAndSelect('tc.class', 'class')
     .where('tc.teacherId = :teacherId', { teacherId: teacher.id })
     .andWhere('class.isActive = :isActive', { isActive: true })
     .getMany();
   
   const classes = teacherClasses.map(tc => ({
     id: tc.class.id,
     name: tc.class.name,
     form: tc.class.form,
     description: tc.class.description,
     isActive: tc.class.isActive
   }));
   ```

5. **Build Response**
   ```typescript
   {
     token: "JWT_TOKEN",
     user: {
       id: user.id,
       username: user.username,
       role: user.role,
       teacher: {
         id: teacher.id,
         teacherId: teacher.teacherId,
         firstName: teacher.firstName,
         lastName: teacher.lastName,
         fullName: fullName,
         ...
       },
       classes: [
         { id, name, form, description, isActive },
         ...
       ]
     }
   }
   ```

### SQL Query Executed

```sql
SELECT 
    tc.id,
    tc."teacherId",
    tc."classId",
    c.id AS class_id,
    c.name AS class_name,
    c.form AS class_form,
    c.description AS class_description,
    c."isActive" AS class_isActive
FROM teacher_classes tc
INNER JOIN classes c ON c.id = tc."classId"
WHERE tc."teacherId" = :teacherId
  AND c."isActive" = TRUE
ORDER BY c.name;
```

## Database Schema

### Tables Used

1. **users**
   - `id` (UUID) - Primary key
   - `username` (VARCHAR) - TeacherID for teachers
   - `password` (VARCHAR) - Hashed password
   - `role` (VARCHAR) - 'teacher' for teachers

2. **teachers**
   - `id` (UUID) - Primary key
   - `userId` (UUID, FK) - References `users.id`
   - `teacherId` (VARCHAR) - Unique identifier (same as username)
   - `firstName` (VARCHAR)
   - `lastName` (VARCHAR)
   - `phoneNumber`, `address`, `dateOfBirth`, `isActive`

3. **classes**
   - `id` (UUID) - Primary key
   - `name` (VARCHAR) - Class name
   - `form` (VARCHAR) - Grade/Form
   - `description` (VARCHAR)
   - `isActive` (BOOLEAN) - Must be TRUE to be included

4. **teacher_classes** (Junction Table)
   - `id` (UUID) - Primary key
   - `teacherId` (UUID, FK) - References `teachers.id`
   - `classId` (UUID, FK) - References `classes.id`
   - UNIQUE constraint on (`teacherId`, `classId`)

## Frontend Usage

### Auth Service

**File:** `frontend/src/app/services/auth.service.ts`

The login response is stored in localStorage and the user object includes:
- `user.teacher` - Teacher object with full name
- `user.classes` - Array of classes assigned to the teacher

### Accessing Classes After Login

```typescript
// In any component
const user = this.authService.getCurrentUser();
if (user?.role === 'teacher') {
  const classes = user.classes || [];
  const teacherFullName = user.teacher?.fullName || 'Teacher';
  
  // Populate dropdown
  this.teacherClasses = classes;
}
```

### Example: Teacher Dashboard

```typescript
ngOnInit() {
  const user = this.authService.getCurrentUser();
  if (user?.teacher) {
    this.teacherName = user.teacher.fullName;
    this.teacherClasses = user.classes || [];
  }
}
```

## API Endpoint

**POST** `/api/auth/login`

**Request Body:**
```json
{
  "username": "jpst9397313",
  "password": "password123"
}
```

**Response (Success - 200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "jpst9397313",
    "role": "teacher",
    "mustChangePassword": false,
    "isTemporaryAccount": false,
    "teacher": {
      "id": "teacher-uuid-456",
      "teacherId": "jpst9397313",
      "firstName": "John",
      "lastName": "Doe",
      "fullName": "John Doe",
      "phoneNumber": "+1234567890",
      "address": "123 Main St",
      "dateOfBirth": "1980-01-01",
      "isActive": true
    },
    "classes": [
      {
        "id": "class-uuid-789",
        "name": "1A Diamond",
        "form": "Stage 1A",
        "description": null,
        "isActive": true
      },
      {
        "id": "class-uuid-790",
        "name": "2 Gold",
        "form": "Stage 2",
        "description": null,
        "isActive": true
      }
    ]
  }
}
```

**Response (Error - 404):**
```json
{
  "message": "Teacher profile not found. Please contact the administrator."
}
```

## Key Features

1. **Username-Only Login**: Teachers log in with username (TeacherID) and password only
2. **Active Classes Only**: Only classes where `isActive = TRUE` are returned
3. **Junction Table Query**: Uses explicit junction table for reliable class fetching
4. **Full Name Included**: Teacher object includes `fullName` property
5. **Complete Class Data**: Each class includes `id`, `name`, `form`, `description`, `isActive`

## Error Handling

- **401 Unauthorized**: Invalid credentials
- **404 Not Found**: Teacher profile not found
- **500 Internal Server Error**: Server/database error

If class fetching fails, an empty array is returned (login still succeeds).

## Testing

### Test Login Flow

1. Create a teacher account with username = TeacherID
2. Assign classes to teacher via `teacher_classes` junction table
3. Log in with username and password
4. Verify response includes:
   - Valid JWT token
   - Teacher object with full name
   - Array of active classes

### Example Test Data

```sql
-- User
INSERT INTO users (id, username, password, role) 
VALUES ('user-uuid', 'jpst9397313', '$2a$10$...', 'teacher');

-- Teacher
INSERT INTO teachers (id, "userId", "teacherId", "firstName", "lastName", "isActive")
VALUES ('teacher-uuid', 'user-uuid', 'jpst9397313', 'John', 'Doe', true);

-- Classes
INSERT INTO classes (id, name, form, "isActive")
VALUES 
  ('class-1', '1A Diamond', 'Stage 1A', true),
  ('class-2', '2 Gold', 'Stage 2', true);

-- Junction Table
INSERT INTO teacher_classes (id, "teacherId", "classId")
VALUES 
  ('junction-1', 'teacher-uuid', 'class-1'),
  ('junction-2', 'teacher-uuid', 'class-2');
```

## Notes

- The system prioritizes the junction table (`teacher_classes`) for fetching classes
- Only active classes (`isActive = TRUE`) are returned
- Full name is constructed as `firstName + lastName` (not `lastName + firstName`)
- If teacher profile is not found, login fails with 404 error (no auto-creation)

