-- Fix Teacher userId Links
-- This script links teacher records to their user accounts

-- Step 1: Check current status
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId" as current_userId,
  u.id as user_id,
  u.email,
  u.role
FROM teachers t
LEFT JOIN users u ON u.id = t."userId"
ORDER BY t."employeeNumber";

-- Step 2: Find teachers without userId but with matching users
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId" as current_userId,
  u.id as matching_user_id,
  u.email,
  u.role
FROM teachers t
LEFT JOIN users u ON u.role = 'teacher' AND (
  u.email LIKE '%' || LOWER(t."firstName") || '%' || LOWER(t."lastName") || '%'
  OR u.email LIKE '%' || LOWER(t."lastName") || '%' || LOWER(t."firstName") || '%'
  OR u.username LIKE '%' || LOWER(t."firstName") || '%'
)
WHERE t."userId" IS NULL
ORDER BY t."employeeNumber";

-- Step 3: AUTO-FIX - Link teachers to users based on email pattern
-- This will attempt to match teachers to users automatically
UPDATE teachers t
SET "userId" = u.id
FROM users u
WHERE t."userId" IS NULL
  AND u.role = 'teacher'
  AND (
    LOWER(u.email) LIKE '%' || LOWER(t."firstName") || '%' || LOWER(t."lastName") || '%'
    OR LOWER(u.email) LIKE '%' || LOWER(t."lastName") || '%' || LOWER(t."firstName") || '%'
  );

-- Step 4: Check results - any teachers still without userId?
SELECT 
  t.id as teacher_id,
  t."employeeNumber",
  t."firstName",
  t."lastName",
  t."userId"
FROM teachers t
WHERE t."userId" IS NULL;

-- If there are still unlinked teachers, you need to link them manually:
-- Example:
-- UPDATE teachers 
-- SET "userId" = (SELECT id FROM users WHERE email = 'teacher@school.com')
-- WHERE "employeeNumber" = 'JPST1234567';

-- Step 5: Verify all teachers now have userId and user accounts exist
SELECT 
  t."employeeNumber",
  t."firstName" || ' ' || t."lastName" as teacher_name,
  u.email,
  u.role,
  COUNT(tcc."classesId") as class_count
FROM teachers t
JOIN users u ON u.id = t."userId"
LEFT JOIN teachers_classes_classes tcc ON t.id = tcc."teachersId"
GROUP BY t."employeeNumber", t."firstName", t."lastName", u.email, u.role
ORDER BY t."employeeNumber";

-- Step 6: If you know the specific teacher having issues, fix them directly:
-- Replace 'teacher@school.com' with the actual email
/*
UPDATE teachers 
SET "userId" = (
  SELECT id FROM users 
  WHERE email = 'teacher@school.com' 
  AND role = 'teacher'
)
WHERE "employeeNumber" = 'JPST1234567';
*/

