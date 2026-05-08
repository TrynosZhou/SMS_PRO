-- Fix for User: jimmy2025 (ID: 3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4)
-- This user has role='teacher' but no teacher profile is linked

-- Step 1: Check the user
SELECT id, email, username, role FROM users 
WHERE id = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4';

-- Step 2: Find all teachers without a userId (should be 0 according to logs)
SELECT id, "employeeNumber", "firstName", "lastName", "userId"
FROM teachers
WHERE "userId" IS NULL;

-- Step 3: Find all teachers to see which one should be linked to jimmy2025
SELECT 
  id, 
  "employeeNumber", 
  "firstName", 
  "lastName", 
  "userId",
  CASE 
    WHEN "userId" IS NULL THEN '❌ No user linked'
    WHEN "userId" = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4' THEN '✅ THIS USER'
    ELSE '✓ Other user'
  END as link_status
FROM teachers
ORDER BY "employeeNumber";

-- Step 4: Find if there's a teacher with similar name to 'jimmy'
SELECT 
  id, 
  "employeeNumber", 
  "firstName", 
  "lastName", 
  "userId"
FROM teachers
WHERE LOWER("firstName") LIKE '%jimmy%' 
   OR LOWER("lastName") LIKE '%jimmy%'
   OR "employeeNumber" LIKE '%jimmy%';

-- Step 5: Check if there's a teacher that should belong to this user
-- Look for teachers created around the same time or with matching details
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId" as current_userId,
  t."createdAt" as teacher_created,
  u.id as user_id,
  u.email,
  u.username,
  u."createdAt" as user_created
FROM teachers t
CROSS JOIN users u
WHERE u.id = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4'
  AND t."userId" IS NULL
ORDER BY t."createdAt" DESC;

-- Step 6: MANUAL FIX - Once you identify which teacher should be linked
-- Replace 'TEACHER_ID_HERE' with the actual teacher ID or employee number

-- Option A: If you know the teacher's employee number (e.g., JPST1234567)
/*
UPDATE teachers 
SET "userId" = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4'
WHERE "employeeNumber" = 'JPST1234567';
*/

-- Option B: If you know the teacher's ID
/*
UPDATE teachers 
SET "userId" = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4'
WHERE id = 'teacher-uuid-here';
*/

-- Option C: If you know the teacher's name
/*
UPDATE teachers 
SET "userId" = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4'
WHERE "firstName" = 'Jimmy' AND "lastName" = 'Doe';
*/

-- Step 7: Verify the fix
SELECT 
  t."employeeNumber",
  t."firstName" || ' ' || t."lastName" as teacher_name,
  u.email,
  u.username,
  COUNT(tcc."classesId") as class_count
FROM teachers t
JOIN users u ON u.id = t."userId"
LEFT JOIN teachers_classes_classes tcc ON t.id = tcc."teachersId"
WHERE t."userId" = '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4'
GROUP BY t."employeeNumber", t."firstName", t."lastName", u.email, u.username;

-- Step 8: Alternative - Create a new teacher profile if none exists
-- Only use this if there's truly no teacher profile for this user
/*
INSERT INTO teachers (
  "firstName",
  "lastName",
  "employeeNumber",
  "userId",
  "isActive"
) VALUES (
  'Jimmy',           -- Replace with actual first name
  'Teacher',         -- Replace with actual last name
  'JPST' || LPAD(FLOOR(RANDOM() * 10000000)::TEXT, 7, '0'), -- Auto-generate employee number
  '3ee7ad4c-9849-45b7-a6b4-fe4d12aa8df4',
  true
);
*/

