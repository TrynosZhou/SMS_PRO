# ⚠️ Database Migration Required

## Issue
The 500 Internal Server Error is occurring because the database migration to add the `subjectId` column to the `record_books` table has not been executed yet.

## Solution

### Option 1: Automatic Migration (Recommended)
The server should automatically run migrations on startup. If it hasn't run, restart your backend server:

```bash
cd backend
npm start
```

Check the console output for:
```
[Server] Running pending migrations (if any)...
[Server] ✓ Migrations executed
```

### Option 2: Manual Migration
If automatic migration doesn't work, run it manually:

```bash
cd backend
npx ts-node scripts/run-migration.ts
```

### Option 3: Direct SQL (If migrations fail)
If the migration script fails, you can run the SQL directly:

```sql
-- 1. Drop old unique index
DROP INDEX IF EXISTS "IDX_record_books_studentId_teacherId_classId_term_year";

-- 2. Add subjectId column (nullable initially)
ALTER TABLE record_books ADD COLUMN IF NOT EXISTS "subjectId" uuid;

-- 3. Delete existing records without subjectId
DELETE FROM record_books WHERE "subjectId" IS NULL;

-- 4. Add foreign key constraint
ALTER TABLE record_books 
ADD CONSTRAINT "FK_record_books_subject" 
FOREIGN KEY ("subjectId") REFERENCES subjects(id) ON DELETE CASCADE;

-- 5. Make subjectId required (non-nullable)
ALTER TABLE record_books ALTER COLUMN "subjectId" SET NOT NULL;

-- 6. Create new unique index with subjectId
CREATE UNIQUE INDEX "IDX_record_books_studentId_teacherId_classId_subjectId_term_year" 
ON record_books ("studentId", "teacherId", "classId", "subjectId", "term", "year");
```

## Verification

After running the migration, verify it worked:

```sql
-- Check if column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'record_books' AND column_name = 'subjectId';

-- Should return:
-- column_name | data_type | is_nullable
-- subjectId   | uuid      | NO
```

## Expected Result

After the migration:
- ✅ No more 500 errors
- ✅ Record book loads successfully
- ✅ Subject selection works
- ✅ Marks can be saved per subject

## Troubleshooting

If you still see errors after running the migration:

1. **Check migration status:**
   ```sql
   SELECT * FROM migrations WHERE name LIKE '%AddSubjectIdToRecordBook%';
   ```

2. **Check for existing records:**
   ```sql
   SELECT COUNT(*) FROM record_books WHERE "subjectId" IS NULL;
   ```
   (Should be 0 after migration)

3. **Check backend logs** for specific error messages

4. **Restart the backend server** after migration

