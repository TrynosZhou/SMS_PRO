# Fix All Teachers - User-Teacher Link Fix

This document explains how to fix teacher-user links for all teachers, applying the same logic that was used to fix Jimmy Makwanda's account.

## Problem

Some teachers may have:
- User accounts not linked to the correct teacher profile
- User accounts linked to wrong teacher profiles (placeholders or incorrect matches)
- Teacher profiles without user account links
- Incorrect class assignments due to wrong teacher-user links

## Solution

The fix matches `user.username` with `teacher.teacherId` (case-insensitive) and:
1. Finds the correct teacher for each user
2. Unlinks wrong teachers from users
3. Links correct teachers to users
4. Cleans up incorrect class assignments

## How to Run

### Option 1: TypeScript Script (Recommended)

Run the TypeScript script from the backend directory:

```bash
cd backend
npx ts-node src/scripts/fix-all-teachers.ts
```

Or if you have ts-node installed globally:

```bash
ts-node src/scripts/fix-all-teachers.ts
```

### Option 2: SQL Script

If you prefer SQL, you can run the SQL script directly on your database:

```bash
psql -d your_database_name -f fix-all-teachers.sql
```

Or execute it through your database management tool (pgAdmin, DBeaver, etc.).

**Note:** Review the SQL script before running, especially Step 4 which deletes class assignments. You may want to comment out Step 4 if you're unsure.

## What the Script Does

1. **Finds all teacher users** - Gets all users with `role = 'teacher'`

2. **Matches username with teacherId** - For each user, finds the teacher where:
   - `LOWER(teacher.teacherId) = LOWER(user.username)`
   - Excludes placeholder teachers (`firstName != 'Teacher'`, `lastName != 'Account'`)

3. **Unlinks wrong teachers** - If a user is linked to a different teacher, unlinks it

4. **Links correct teachers** - Links the user to the correct teacher based on the match

5. **Cleans up class assignments** - Removes incorrect class assignments from wrong teachers

6. **Verifies results** - Shows summary and any remaining issues

## Example Output

```
🔍 Starting comprehensive teacher-user link fix...

Found 15 teacher user accounts

--- Processing user: JPST9397313 (ID: abc-123) ---
✓ Found correct teacher: Jimmy Makwanda
  Teacher ID: JPST9397313
  Teacher UUID: xyz-789
  Current userId: NULL

⚠️  MISMATCH DETECTED!
  User is linked to wrong teacher: Teacher Account
  Should be linked to: Jimmy Makwanda
🔧 Unlinking wrong teacher...
✓ Wrong teacher unlinked
🔧 Linking user to correct teacher...
✓ User linked to correct teacher
✓ Verification: Teacher Jimmy Makwanda is linked
  Classes assigned: 3

============================================================
📊 FIX SUMMARY
============================================================
✓ Fixed (linked to correct teacher): 12
✓ Already correct: 2
⚠️  Teacher not found: 1
❌ Errors: 0
📝 Total processed: 15
============================================================
```

## Important Notes

- **Backup your database** before running the fix
- The script excludes placeholder teachers (firstName='Teacher', lastName='Account')
- Class assignments are only removed from wrong teachers that are being unlinked
- Teachers without matching usernames will be reported but not automatically fixed

## Troubleshooting

### Teacher not found
If a teacher user doesn't have a matching teacher profile:
- Check if the username matches the teacherId
- Verify the teacher profile exists in the database
- Check if the teacher has placeholder names (Teacher Account) - these are excluded

### Multiple teachers with same teacherId
If multiple teachers have the same teacherId, the script will match the one with a real name (not placeholder).

### Manual fixes needed
For edge cases, you may need to manually link teachers:
```sql
UPDATE teachers 
SET "userId" = 'user-id-here'
WHERE "teacherId" = 'TEACHER_ID_HERE';
```

## Related Files

- `backend/src/scripts/fix-all-teachers.ts` - TypeScript implementation
- `backend/fix-all-teachers.sql` - SQL implementation
- `backend/src/scripts/fix-teacher-link-permanent.ts` - Original fix for Jimmy Makwanda
- `backend/src/scripts/fix-teacher-issue.ts` - Diagnostic script

