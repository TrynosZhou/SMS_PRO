-- Create teacher_classes junction table
CREATE TABLE IF NOT EXISTS "teacher_classes" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "teacherId" uuid NOT NULL,
    "classId" uuid NOT NULL
);

-- Add unique constraint on (teacherId, classId) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_teacher_classes_teacher_class" 
ON "teacher_classes" ("teacherId", "classId");

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_teacherId" 
ON "teacher_classes" ("teacherId");

CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_classId" 
ON "teacher_classes" ("classId");

-- Add foreign key constraints
ALTER TABLE "teacher_classes"
ADD CONSTRAINT "FK_teacher_classes_teacher" 
FOREIGN KEY ("teacherId") 
REFERENCES "teachers"("id") 
ON DELETE CASCADE;

ALTER TABLE "teacher_classes"
ADD CONSTRAINT "FK_teacher_classes_class" 
FOREIGN KEY ("classId") 
REFERENCES "classes"("id") 
ON DELETE CASCADE;

-- Migrate existing ManyToMany relationships to the junction table
-- This assumes the existing join table is named 'teachers_classes' (TypeORM default)
-- If your existing join table has a different name, adjust accordingly
INSERT INTO "teacher_classes" ("teacherId", "classId")
SELECT DISTINCT "teachersId", "classesId"
FROM "teachers_classes" tc_old
WHERE NOT EXISTS (
    SELECT 1 FROM "teacher_classes" tc_new 
    WHERE tc_new."teacherId" = tc_old."teachersId" 
    AND tc_new."classId" = tc_old."classesId"
)
ON CONFLICT DO NOTHING;

-- Note: After migration, you may want to drop the old TypeORM-generated join table
-- DROP TABLE IF EXISTS "teachers_classes_old";

