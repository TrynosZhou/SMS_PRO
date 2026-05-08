# Fix: Teacher 500 Error on /api/teachers/me

## Problem
The `/api/teachers/me` endpoint returns a 500 Internal Server Error, preventing teachers from accessing the Record Book.

## Root Cause
The `teachers` table has records, but the `userId` field is `NULL`. This happens when:
1. Teachers were created before user accounts
2. User accounts were created but not linked to teacher profiles
3. Database migration didn't set the userId field

## Solution

### Quick Fix Option 1: Run SQL Script

I've created a SQL script that automatically fixes the issue.

**File**: `backend/fix-teacher-userid.sql`

**Run it**:
```bash
# Using psql
psql -U your_username -d your_database -f backend/fix-teacher-userid.sql

# Or connect to your database and run the script
```

The script will:
1. Show current teacher-user links
2. Find teachers without userId
3. Auto-link teachers to users based on email patterns
4. Show results and any remaining issues

### Quick Fix Option 2: Manual SQL

If you know the teacher's email:

```sql
-- Replace with actual email and teacher ID
UPDATE teachers 
SET "userId" = (
  SELECT id FROM users 
  WHERE email = 'john.doe@school.com' 
  AND role = 'teacher'
)
WHERE "employeeNumber" = 'JPST1234567';
```

### Quick Fix Option 3: Use the Auto-Fix Feature

I've added an **auto-fix feature** to the backend! It will:
- Try to find the teacher via User relationship
- Automatically set the `userId` if it's missing
- Log the fix in the console

**How to use**:
1. Restart the backend
2. Teacher tries to login/access Record Book
3. Backend automatically fixes the issue
4. Check backend console for `[getCurrentTeacher] Auto-fixing teacher.userId...`

## Step-by-Step Diagnostic

### Step 1: Check Backend Logs

After restarting the backend, watch for these logs when teacher accesses Record Book:

```
[getCurrentTeacher] ============ DEBUG INFO ============
[getCurrentTeacher] User ID: <uuid>
[getCurrentTeacher] User Role: teacher
[getCurrentTeacher] User Email: teacher@school.com
[getCurrentTeacher] Teacher found by userId: Yes/No
[getCurrentTeacher] Total teachers in DB: X
[getCurrentTeacher] Teachers without userId: X
[getCurrentTeacher] =====================================
```

### Step 2: Identify the Issue

Look for these specific lines:

#### If you see:
```
[getCurrentTeacher] Teacher found by userId: No
[getCurrentTeacher] Teachers without userId: 1 (or more)
```

**Problem**: Teacher record exists but `userId` is NULL

**Fix**: Run the SQL script or use manual SQL above

#### If you see:
```
[getCurrentTeacher] User.teacher exists: Yes
[getCurrentTeacher] Found teacher via User relationship: <teacher-id>
[getCurrentTeacher] Auto-fixing teacher.userId...
[getCurrentTeacher] Teacher.userId fixed!
```

**Status**: ✅ Auto-fix worked! Refresh the page and it should work now.

#### If you see:
```
[getCurrentTeacher] Total teachers in DB: 0
```

**Problem**: No teacher records in database

**Fix**: Create teacher via Teachers page

### Step 3: Verify the Fix

After running the SQL or after auto-fix:

```sql
-- Check if userId is now set
SELECT 
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId",
  u.email
FROM teachers t
LEFT JOIN users u ON u.id = t."userId"
WHERE t."employeeNumber" = 'JPST1234567';
```

Should show:
- userId: <some-uuid> (NOT NULL)
- email: teacher@school.com

### Step 4: Test Login Again

1. Clear browser cache (Ctrl+Shift+Delete)
2. Log out and log back in
3. Try accessing Record Book
4. Should work now! ✅

## Detailed SQL Diagnostic Queries

### Query 1: Find ALL teachers and their user links
```sql
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  t."firstName" || ' ' || t."lastName" as name,
  t."userId",
  u.email,
  u.role,
  CASE 
    WHEN t."userId" IS NULL THEN '❌ NOT LINKED'
    WHEN u.id IS NULL THEN '❌ USER MISSING'
    ELSE '✅ LINKED'
  END as status
FROM teachers t
LEFT JOIN users u ON u.id = t."userId"
ORDER BY t."employeeNumber";
```

### Query 2: Find teachers without userId
```sql
SELECT 
  t.id,
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId"
FROM teachers t
WHERE t."userId" IS NULL;
```

### Query 3: Find users with teacher role but no teacher profile
```sql
SELECT 
  u.id,
  u.email,
  u.role
FROM users u
LEFT JOIN teachers t ON t."userId" = u.id
WHERE u.role = 'teacher'
  AND t.id IS NULL;
```

### Query 4: Match teachers to users by email pattern
```sql
SELECT 
  t."employeeNumber",
  t."firstName" || ' ' || t."lastName" as teacher_name,
  u.id as user_id,
  u.email,
  'UPDATE teachers SET "userId" = ''' || u.id || ''' WHERE id = ''' || t.id || ''';' as fix_sql
FROM teachers t
CROSS JOIN users u
WHERE t."userId" IS NULL
  AND u.role = 'teacher'
  AND (
    LOWER(u.email) LIKE '%' || LOWER(t."firstName") || '%'
    OR LOWER(u.email) LIKE '%' || LOWER(t."lastName") || '%'
  );
```

Copy the `fix_sql` output and run it to link teachers to users.

## Prevention

To prevent this issue in the future:

### When Creating a New Teacher:

**In the backend code** (`teacher.controller.ts` line ~100):
```typescript
// After creating user, ALWAYS set userId
teacher.userId = user.id;
await teacherRepository.save(teacher);
```

This should already be in the code, but verify it's being executed.

### When Creating Teacher Account:

Ensure the `createTeacherAccount` function properly links the user:
```typescript
// Link user to teacher
teacher.userId = user.id;
await teacherRepository.save(teacher);
```

### Database Constraint:

Consider adding a check to warn about NULL userId:
```sql
-- Add this to your migrations (optional)
ALTER TABLE teachers 
ADD CONSTRAINT check_userId_not_null_for_active
CHECK ("isActive" = false OR "userId" IS NOT NULL);
```

## Enhanced Error Response

The backend now returns helpful diagnostic information in the error response:

```json
{
  "message": "Teacher profile not found. Please contact administrator.",
  "debug": {
    "userId": "user-uuid-here",
    "userEmail": "teacher@school.com",
    "totalTeachers": 5,
    "teachersWithoutUserId": 1,
    "suggestion": "Run: UPDATE teachers SET \"userId\" = 'user-uuid' WHERE \"employeeNumber\" = 'YOUR_TEACHER_ID';"
  }
}
```

This tells you:
- How many teachers exist
- How many are missing userId
- Exact SQL command to fix it

## Common Scenarios

### Scenario A: Fresh Installation
**Symptoms**:
- Just set up the system
- Created teachers first
- Then created user accounts
- Teachers can't login

**Fix**:
```sql
-- Link all teachers to users by email pattern
UPDATE teachers t
SET "userId" = u.id
FROM users u
WHERE t."userId" IS NULL
  AND u.role = 'teacher'
  AND (
    LOWER(u.email) LIKE '%' || LOWER(t."firstName") || '%' || LOWER(t."lastName") || '%'
  );
```

### Scenario B: Migrated from Old System
**Symptoms**:
- Imported teacher data
- Users exist
- Teachers can't access Record Book

**Fix**:
Run the SQL script: `backend/fix-teacher-userid.sql`

### Scenario C: Single Teacher Issue
**Symptoms**:
- Most teachers work fine
- One specific teacher gets 500 error

**Fix**:
```sql
-- Get the specific teacher
SELECT * FROM teachers WHERE "employeeNumber" = 'JPST1234567';

-- Get the user
SELECT * FROM users WHERE email = 'teacher@school.com';

-- Link them
UPDATE teachers 
SET "userId" = (SELECT id FROM users WHERE email = 'teacher@school.com')
WHERE "employeeNumber" = 'JPST1234567';
```

## Verification Checklist

After applying the fix:

- [ ] SQL shows userId is set (not NULL)
- [ ] User exists with role='teacher'
- [ ] Email matches between user and teacher
- [ ] Backend logs show "Teacher found by userId: Yes"
- [ ] No "Auto-fixing" messages (means it's already fixed)
- [ ] Teacher can login successfully
- [ ] Record Book loads without errors
- [ ] Classes dropdown shows teacher's classes
- [ ] Can select class and see students

## Still Not Working?

If the issue persists:

1. **Check the exact error message** in backend console
2. **Verify database connection** is working
3. **Confirm TypeORM migrations** have run
4. **Check User.teacher relationship** in User entity
5. **Verify Teacher.userId field** exists in database schema

Run this diagnostic:
```sql
-- Check if userId column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'teachers'
  AND column_name = 'userId';
```

Should return:
```
 column_name | data_type | is_nullable 
-------------+-----------+-------------
 userId      | uuid      | YES
```

## Summary

✅ **Enhanced diagnostics** - Detailed logging shows exact issue
✅ **Auto-fix feature** - Backend automatically fixes missing userId
✅ **SQL script provided** - Easy batch fix for all teachers
✅ **Clear error messages** - Tells you exactly what to do
✅ **Prevention tips** - Avoid the issue in future

**Restart the backend and try again!** The auto-fix should resolve it automatically.

