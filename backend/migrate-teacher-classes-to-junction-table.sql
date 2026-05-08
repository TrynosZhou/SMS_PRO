-- Migration script to populate teacher_classes junction table from existing ManyToMany relationships
-- This assumes TypeORM created a join table named 'teachers_classes' (default naming)

-- First, check if the old join table exists and migrate data
DO $$
BEGIN
    -- Check if old TypeORM join table exists (teachers_classes with columns teachersId and classesId)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'teachers_classes' 
        AND table_schema = 'public'
    ) THEN
        -- Migrate data from old join table to new junction table
        INSERT INTO "teacher_classes" ("teacherId", "classId")
        SELECT DISTINCT 
            "teachersId" as "teacherId",
            "classesId" as "classId"
        FROM "teachers_classes" tc_old
        WHERE NOT EXISTS (
            SELECT 1 FROM "teacher_classes" tc_new 
            WHERE tc_new."teacherId" = tc_old."teachersId" 
            AND tc_new."classId" = tc_old."classesId"
        )
        ON CONFLICT ("teacherId", "classId") DO NOTHING;
        
        RAISE NOTICE 'Migrated data from teachers_classes to teacher_classes';
    END IF;
    
    -- Also check for alternative naming (teachers_classes_teachers_classes)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'teachers_classes_teachers_classes' 
        AND table_schema = 'public'
    ) THEN
        INSERT INTO "teacher_classes" ("teacherId", "classId")
        SELECT DISTINCT 
            "teachersId" as "teacherId",
            "classesId" as "classId"
        FROM "teachers_classes_teachers_classes" tc_old
        WHERE NOT EXISTS (
            SELECT 1 FROM "teacher_classes" tc_new 
            WHERE tc_new."teacherId" = tc_old."teachersId" 
            AND tc_new."classId" = tc_old."classesId"
        )
        ON CONFLICT ("teacherId", "classId") DO NOTHING;
        
        RAISE NOTICE 'Migrated data from teachers_classes_teachers_classes to teacher_classes';
    END IF;
END $$;

-- Verify migration
SELECT 
    COUNT(*) as total_links,
    COUNT(DISTINCT "teacherId") as unique_teachers,
    COUNT(DISTINCT "classId") as unique_classes
FROM "teacher_classes";

