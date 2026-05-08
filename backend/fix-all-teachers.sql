-- Fix All Teacher-User Links
-- This script applies the same logic used for Jimmy Makwanda to all teachers
-- It matches user.username with teacher.teacherId and fixes any mismatches

-- Step 1: Check current status - Find mismatches
SELECT 
  u.id as user_id,
  u.username,
  u.email,
  u.role,
  t_current.id as current_teacher_id,
  t_current."firstName" as current_first_name,
  t_current."lastName" as current_last_name,
  t_current."teacherId" as current_teacher_id_code,
  t_correct.id as correct_teacher_id,
  t_correct."firstName" as correct_first_name,
  t_correct."lastName" as correct_last_name,
  t_correct."teacherId" as correct_teacher_id_code,
  CASE 
    WHEN t_current.id IS NULL THEN '❌ No teacher linked'
    WHEN t_current.id = t_correct.id THEN '✅ Correctly linked'
    ELSE '⚠️ MISMATCH - Wrong teacher linked'
  END as status
FROM users u
LEFT JOIN teachers t_current ON t_current."userId" = u.id
LEFT JOIN teachers t_correct ON LOWER(t_correct."teacherId") = LOWER(u.username)
  AND t_correct."firstName" != 'Teacher'
  AND t_correct."lastName" != 'Account'
WHERE u.role = 'teacher'
ORDER BY u.username;

-- Step 2: Unlink wrong teachers (teachers linked to users but teacherId doesn't match username)
UPDATE teachers t_wrong
SET "userId" = NULL
FROM users u
WHERE t_wrong."userId" = u.id
  AND u.role = 'teacher'
  AND u.username IS NOT NULL
  AND LOWER(t_wrong."teacherId") != LOWER(u.username)
  AND EXISTS (
    SELECT 1 FROM teachers t_correct
    WHERE LOWER(t_correct."teacherId") = LOWER(u.username)
      AND t_correct."firstName" != 'Teacher'
      AND t_correct."lastName" != 'Account'
  );

-- Step 3: Link correct teachers to users (match username with teacherId)
UPDATE teachers t
SET "userId" = u.id
FROM users u
WHERE u.role = 'teacher'
  AND u.username IS NOT NULL
  AND LOWER(t."teacherId") = LOWER(u.username)
  AND t."firstName" != 'Teacher'
  AND t."lastName" != 'Account'
  AND (t."userId" IS NULL OR t."userId" != u.id);

-- Step 4: Remove incorrect class assignments from wrong teachers
-- (This should be done carefully - only remove if teacher is unlinked)
DELETE FROM teachers_classes_classes tcc
WHERE EXISTS (
  SELECT 1 FROM teachers t
  WHERE t.id = tcc."teachersId"
    AND t."userId" IS NULL
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.role = 'teacher'
        AND u.username IS NOT NULL
        AND LOWER(t."teacherId") != LOWER(u.username)
        AND EXISTS (
          SELECT 1 FROM teachers t_correct
          WHERE LOWER(t_correct."teacherId") = LOWER(u.username)
            AND t_correct."firstName" != 'Teacher'
            AND t_correct."lastName" != 'Account'
        )
    )
);

-- Step 5: Verify results
SELECT 
  u.username,
  u.email,
  t."firstName" || ' ' || t."lastName" as teacher_name,
  t."teacherId",
  CASE 
    WHEN LOWER(t."teacherId") = LOWER(u.username) THEN '✅ Match'
    ELSE '⚠️ Mismatch'
  END as match_status,
  (SELECT COUNT(*) FROM teachers_classes_classes WHERE "teachersId" = t.id) as class_count
FROM users u
JOIN teachers t ON t."userId" = u.id
WHERE u.role = 'teacher'
ORDER BY u.username;

-- Step 6: Check for unlinked teachers (valid teachers without user links)
SELECT 
  t.id,
  t."firstName" || ' ' || t."lastName" as teacher_name,
  t."teacherId",
  t."userId"
FROM teachers t
WHERE t."userId" IS NULL
  AND t."firstName" != 'Teacher'
  AND t."lastName" != 'Account'
ORDER BY t."teacherId";

-- Step 7: Check for teacher users without teacher profiles
SELECT 
  u.id,
  u.username,
  u.email,
  u.role
FROM users u
WHERE u.role = 'teacher'
  AND NOT EXISTS (
    SELECT 1 FROM teachers t WHERE t."userId" = u.id
  )
ORDER BY u.username;

