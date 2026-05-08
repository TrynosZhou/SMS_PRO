# Teacher /me Endpoint - Debugging Guide

## Error: 500 Internal Server Error

The `/api/teachers/me` endpoint is returning a 500 error. Here's how to diagnose and fix it:

## Enhanced Logging

I've added detailed logging to the `getCurrentTeacher()` function to help identify the issue.

### Log Messages to Watch For:

```
[getCurrentTeacher] User ID: <uuid>
[getCurrentTeacher] User Role: teacher
[getCurrentTeacher] Teacher found: Yes/No
[getCurrentTeacher] Teacher ID: <uuid>
[getCurrentTeacher] Classes count: <number>
```

## Common Causes & Solutions

### 1. Teacher Record Has No `userId`

**Symptom**: "Teacher found: No"

**Cause**: The teacher record in the database doesn't have a `userId` field set.

**Solution**:
```sql
-- Check for teachers without userId
SELECT id, "firstName", "lastName", "employeeNumber", "userId" 
FROM teachers 
WHERE "userId" IS NULL;

-- If you find teachers without userId, you need to link them manually
-- Find the user account and link it:
UPDATE teachers 
SET "userId" = (SELECT id FROM users WHERE email = 'teacher@school.com')
WHERE "employeeNumber" = 'JPST001';
```

### 2. User Is Not a Teacher

**Symptom**: 403 Forbidden

**Cause**: The logged-in user doesn't have role='teacher'

**Check**:
```sql
SELECT id, email, username, role FROM users WHERE email = 'your@email.com';
```

### 3. Database Connection Issue

**Symptom**: Database error in logs

**Check**: Ensure backend is connected to the database correctly.

## Testing Steps

### 1. Check Backend Logs

Restart the backend and watch the console:
```bash
cd backend
npm start
```

Look for the `[getCurrentTeacher]` log messages when you access the Record Book.

### 2. Test the Endpoint Directly

Use curl or Postman:
```bash
curl -X GET http://localhost:3001/api/teachers/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Check Database

```sql
-- Get your user ID
SELECT id, email, role FROM users WHERE email = 'your@email.com';

-- Check if teacher record exists with that userId
SELECT * FROM teachers WHERE "userId" = 'YOUR_USER_ID';

-- Check if teacher has classes
SELECT t.id, t."firstName", t."lastName", COUNT(ct."teachersId") as class_count
FROM teachers t
LEFT JOIN teachers_classes_classes ct ON t.id = ct."teachersId"
WHERE t."userId" = 'YOUR_USER_ID'
GROUP BY t.id;
```

## Most Likely Issue: Missing `userId` Link

When teachers are created, the `userId` field might not always be set. Here's how to fix it:

### Step 1: Find Unlinked Teachers
```sql
SELECT 
  t.id as teacher_id,
  t."firstName",
  t."lastName", 
  t."employeeNumber",
  t."userId" as current_user_id,
  u.id as user_id,
  u.email,
  u.role
FROM teachers t
LEFT JOIN users u ON u.id = t."userId"
WHERE t."userId" IS NULL;
```

### Step 2: Link Teacher to User

For each teacher, find their user account by email or employeeNumber, then update:

```sql
-- Example: Link teacher John Doe to his user account
UPDATE teachers 
SET "userId" = (
  SELECT id FROM users 
  WHERE email = 'john.doe@school.com' 
  AND role = 'teacher'
)
WHERE "employeeNumber" = 'JPST001';
```

Or if you know both IDs:
```sql
UPDATE teachers 
SET "userId" = 'user-uuid-here'
WHERE id = 'teacher-uuid-here';
```

## Quick Fix Script

Save this as `fix-teacher-links.sql`:

```sql
-- Find all teachers with user accounts but no userId link
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  u.id as user_id,
  u.email,
  'UPDATE teachers SET "userId" = ''' || u.id || ''' WHERE id = ''' || t.id || ''';' as fix_query
FROM teachers t
CROSS JOIN users u
WHERE u.role = 'teacher'
  AND t."userId" IS NULL
  AND (
    -- Match by email pattern (firstName.lastName@school.com)
    u.email LIKE LOWER(t."firstName" || '.' || t."lastName" || '%')
    OR
    -- Or match if user's teacher relationship points to this teacher
    u.id IN (SELECT "userId" FROM teachers WHERE id = t.id)
  );
```

## After Fixing

1. **Restart the backend**: `npm start`
2. **Clear browser cache** or do a hard refresh (Ctrl+Shift+R)
3. **Log out and log back in** to get a fresh token
4. **Try accessing Record Book** again

## Prevention

To prevent this issue when creating new teachers, ensure the `userId` is always set:

```typescript
// In teacher.controller.ts, after creating user:
teacher.userId = user.id;
await teacherRepository.save(teacher);
```

This should already be in the code (line 100 in registerTeacher), but verify it's being executed.

## Still Not Working?

If the issue persists after linking userId:

1. **Check the logs** for the specific error message
2. **Verify the relations** in Teacher entity match the database structure
3. **Check for TypeORM sync issues** - the entity might not match the database schema
4. **Try re-running migrations**:
   ```bash
   cd backend
   npm run typeorm migration:run
   ```

## Contact Information

If you need help, provide:
- The exact error message from browser console
- Backend console logs (especially `[getCurrentTeacher]` lines)
- Output of: `SELECT COUNT(*) FROM teachers WHERE "userId" IS NOT NULL;`
- Your teacher's employee number or email

