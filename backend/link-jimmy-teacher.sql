-- Link jimmy2025 user to a teacher profile
-- Run this script to connect the user account to a teacher record

-- Step 1: Find the user's ID
SELECT id, email, role, username 
FROM users 
WHERE email = 'jimmy2025' OR username = 'jimmy2025';

-- Expected output: Shows the user's UUID and confirms role is 'teacher'

-- Step 2: Find available teachers (those without a userId)
SELECT id, "firstName", "lastName", "teacherId", "userId"
FROM teachers
WHERE "userId" IS NULL
ORDER BY "firstName", "lastName";

-- Step 3: Find all teachers to see which one should be linked
SELECT id, "firstName", "lastName", "teacherId", "userId"
FROM teachers
ORDER BY "firstName", "lastName";

-- Step 4: Link the user to a teacher (REPLACE THE IDs BELOW)
-- Replace <USER_ID> with the actual user ID from Step 1
-- Replace <TEACHER_ID> with the actual teacher ID from Step 2 or 3

-- Example (DO NOT RUN AS-IS, UPDATE THE IDs):
-- UPDATE teachers
-- SET "userId" = '<USER_ID_FROM_STEP_1>'
-- WHERE id = '<TEACHER_ID_FROM_STEP_2_OR_3>';

-- Step 5: Verify the link
-- SELECT t.id, t."firstName", t."lastName", t."teacherId", t."userId", u.email, u.username
-- FROM teachers t
-- JOIN users u ON u.id = t."userId"
-- WHERE u.email = 'jimmy2025' OR u.username = 'jimmy2025';

-- Step 6: Check assigned classes
-- SELECT t."teacherId", t."firstName", t."lastName", c.name as class_name
-- FROM teachers t
-- LEFT JOIN teacher_classes_class tcc ON tcc."teachersId" = t.id
-- LEFT JOIN classes c ON c.id = tcc."classId"
-- WHERE t."userId" = '<USER_ID_FROM_STEP_1>';

-- ============================================
-- EXAMPLE: If you want to create a NEW teacher for jimmy2025
-- ============================================

-- Get the user ID first
DO $$
DECLARE
    v_user_id uuid;
    v_teacher_id uuid;
BEGIN
    -- Find the user
    SELECT id INTO v_user_id
    FROM users
    WHERE email = 'jimmy2025' OR username = 'jimmy2025'
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User jimmy2025 not found!';
    ELSE
        RAISE NOTICE 'User found: %', v_user_id;
        
        -- Check if teacher already exists for this user
        SELECT id INTO v_teacher_id
        FROM teachers
        WHERE "userId" = v_user_id;
        
        IF v_teacher_id IS NOT NULL THEN
            RAISE NOTICE 'Teacher already exists for this user: %', v_teacher_id;
        ELSE
            -- Create a new teacher profile
            -- MODIFY THE VALUES BELOW AS NEEDED
            INSERT INTO teachers (
                id,
                "firstName",
                "lastName",
                "teacherId",
                "phoneNumber",
                "address",
                "dateOfBirth",
                "isActive",
                "userId"
            ) VALUES (
                gen_random_uuid(),
                'Jimmy',              -- CHANGE THIS
                'Teacher',            -- CHANGE THIS
                'JPST' || LPAD(FLOOR(RANDOM() * 10000000)::text, 7, '0'), -- Auto-generate Teacher ID
                '+254700000000',      -- CHANGE THIS
                'Teacher Address',    -- CHANGE THIS
                '1990-01-01',         -- CHANGE THIS
                true,
                v_user_id
            ) RETURNING id INTO v_teacher_id;
            
            RAISE NOTICE 'New teacher created: %', v_teacher_id;
        END IF;
    END IF;
END $$;

-- Verify the result
SELECT t.id, t."firstName", t."lastName", t."teacherId", t."userId", u.email, u.username
FROM teachers t
JOIN users u ON u.id = t."userId"
WHERE u.email = 'jimmy2025' OR u.username = 'jimmy2025';

