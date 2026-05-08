# Actual SQL Queries Executed During Teacher Login

## Scenario: Teacher logs in with TeacherID as Username

**Input:**
- Username: `jpst9397313` (TeacherID)
- Password: `[password]`

---

## Query Sequence

### 1. Find User by Username (TeacherID)

**TypeORM Code:**
```typescript
const user = await userRepository.findOne({
  where: { username: 'jpst9397313' }
});
```

**Actual SQL Generated:**
```sql
SELECT 
    "User"."id" AS "User_id",
    "User"."email" AS "User_email",
    "User"."username" AS "User_username",
    "User"."password" AS "User_password",
    "User"."role" AS "User_role",
    "User"."mustChangePassword" AS "User_mustChangePassword",
    "User"."isTemporaryAccount" AS "User_isTemporaryAccount",
    "User"."isDemo" AS "User_isDemo"
FROM "users" "User"
WHERE "User"."username" = $1
LIMIT 1
-- Parameter: $1 = 'jpst9397313'
```

**Result Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "jpst9397313",
  "role": "teacher",
  "email": null
}
```

---

### 2. Find Teacher by userId

**TypeORM Code:**
```typescript
let teacher = await teacherRepository.findOne({
  where: { userId: user.id },
  relations: ['classes', 'subjects']
});
```

**Actual SQL Generated:**
```sql
-- First query: Get teacher
SELECT 
    "Teacher"."id" AS "Teacher_id",
    "Teacher"."firstName" AS "Teacher_firstName",
    "Teacher"."lastName" AS "Teacher_lastName",
    "Teacher"."teacherId" AS "Teacher_teacherId",
    "Teacher"."phoneNumber" AS "Teacher_phoneNumber",
    "Teacher"."address" AS "Teacher_address",
    "Teacher"."dateOfBirth" AS "Teacher_dateOfBirth",
    "Teacher"."isActive" AS "Teacher_isActive",
    "Teacher"."userId" AS "Teacher_userId"
FROM "teachers" "Teacher"
WHERE "Teacher"."userId" = $1
LIMIT 1
-- Parameter: $1 = '550e8400-e29b-41d4-a716-446655440000'

-- Second query: Get classes via ManyToMany (if relations are loaded)
SELECT 
    "classes"."id" AS "classes_id",
    "classes"."name" AS "classes_name",
    "classes"."form" AS "classes_form",
    "classes"."description" AS "classes_description",
    "classes"."isActive" AS "classes_isActive",
    "Teacher_classes"."teachersId" AS "Teacher_classes_teachersId",
    "Teacher_classes"."classesId" AS "Teacher_classes_classesId"
FROM "classes" "classes"
INNER JOIN "teachers_classes_mtm" "Teacher_classes" 
    ON "Teacher_classes"."classesId" = "classes"."id"
WHERE "Teacher_classes"."teachersId" = $1
-- Parameter: $1 = 'teacher-uuid-here'
```

**If teacher not found by userId, try by teacherId:**
```sql
SELECT * FROM "teachers" "Teacher"
WHERE "Teacher"."teacherId" = $1
LIMIT 1
-- Parameter: $1 = 'jpst9397313'
```

---

### 3. Fetch Classes from Junction Table (PRIMARY METHOD)

**TypeORM Code:**
```typescript
const { TeacherClass } = await import('../entities/TeacherClass');
const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

const teacherClasses = await teacherClassRepository.find({
  where: { teacherId: teacher.id },
  relations: ['class']
});
```

**Actual SQL Generated:**
```sql
SELECT 
    "TeacherClass"."id" AS "TeacherClass_id",
    "TeacherClass"."teacherId" AS "TeacherClass_teacherId",
    "TeacherClass"."classId" AS "TeacherClass_classId",
    "TeacherClass_class"."id" AS "TeacherClass_class_id",
    "TeacherClass_class"."name" AS "TeacherClass_class_name",
    "TeacherClass_class"."form" AS "TeacherClass_class_form",
    "TeacherClass_class"."description" AS "TeacherClass_class_description",
    "TeacherClass_class"."isActive" AS "TeacherClass_class_isActive"
FROM "teacher_classes" "TeacherClass"
LEFT JOIN "classes" "TeacherClass_class" 
    ON "TeacherClass_class"."id" = "TeacherClass"."classId"
WHERE "TeacherClass"."teacherId" = $1
-- Parameter: $1 = 'teacher-uuid-here' (teacher.id)
```

**Result Example:**
```json
[
  {
    "id": "junction-uuid-1",
    "teacherId": "teacher-uuid-456",
    "classId": "class-uuid-789",
    "class": {
      "id": "class-uuid-789",
      "name": "1A Diamond",
      "form": "Stage 1A",
      "description": null,
      "isActive": true
    }
  },
  {
    "id": "junction-uuid-2",
    "teacherId": "teacher-uuid-456",
    "classId": "class-uuid-790",
    "class": {
      "id": "class-uuid-790",
      "name": "2 Gold",
      "form": "Stage 2",
      "description": null,
      "isActive": true
    }
  }
]
```

**Processing:**
```typescript
const classes = teacherClasses.map(tc => tc.class);
teacher.classes = classes;
```

---

### 4. Fallback: Fetch via ManyToMany Relation

**TypeORM Code:**
```typescript
const teacherWithClasses = await teacherRepository.findOne({
  where: { id: teacher.id },
  relations: ['classes']
});
```

**Actual SQL Generated:**
```sql
-- Query 1: Get teacher
SELECT 
    "Teacher"."id" AS "Teacher_id",
    "Teacher"."firstName" AS "Teacher_firstName",
    "Teacher"."lastName" AS "Teacher_lastName",
    "Teacher"."teacherId" AS "Teacher_teacherId",
    "Teacher"."phoneNumber" AS "Teacher_phoneNumber",
    "Teacher"."address" AS "Teacher_address",
    "Teacher"."dateOfBirth" AS "Teacher_dateOfBirth",
    "Teacher"."isActive" AS "Teacher_isActive",
    "Teacher"."userId" AS "Teacher_userId"
FROM "teachers" "Teacher"
WHERE "Teacher"."id" = $1
LIMIT 1

-- Query 2: Get classes via ManyToMany join table
SELECT 
    "classes"."id" AS "classes_id",
    "classes"."name" AS "classes_name",
    "classes"."form" AS "classes_form",
    "classes"."description" AS "classes_description",
    "classes"."isActive" AS "classes_isActive",
    "Teacher_classes"."teachersId" AS "Teacher_classes_teachersId",
    "Teacher_classes"."classesId" AS "Teacher_classes_classesId"
FROM "classes" "classes"
INNER JOIN "teachers_classes_mtm" "Teacher_classes" 
    ON "Teacher_classes"."classesId" = "classes"."id"
WHERE "Teacher_classes"."teachersId" = $1
-- Parameter: $1 = 'teacher-uuid-here'
```

**Note:** TypeORM creates a ManyToMany join table named `teachers_classes_mtm` automatically.

---

### 5. Alternative: Query Builder Approach (if needed)

**TypeORM Code:**
```typescript
const classesWithTeacher = await classRepository
  .createQueryBuilder('class')
  .leftJoinAndSelect('class.teachers', 'teacher')
  .where('teacher.id = :teacherId', { teacherId: teacher.id })
  .getMany();
```

**Actual SQL Generated:**
```sql
SELECT 
    "class"."id" AS "class_id",
    "class"."name" AS "class_name",
    "class"."form" AS "class_form",
    "class"."description" AS "class_description",
    "class"."isActive" AS "class_isActive",
    "teacher"."id" AS "teacher_id",
    "teacher"."firstName" AS "teacher_firstName",
    "teacher"."lastName" AS "teacher_lastName",
    "teacher"."teacherId" AS "teacher_teacherId",
    "teacher"."phoneNumber" AS "teacher_phoneNumber",
    "teacher"."address" AS "teacher_address",
    "teacher"."dateOfBirth" AS "teacher_dateOfBirth",
    "teacher"."isActive" AS "teacher_isActive",
    "teacher"."userId" AS "teacher_userId"
FROM "classes" "class"
LEFT JOIN "teachers_classes_mtm" "class_teachers" 
    ON "class_teachers"."classesId" = "class"."id"
LEFT JOIN "teachers" "teacher" 
    ON "teacher"."id" = "class_teachers"."teachersId"
WHERE "teacher"."id" = $1
-- Parameter: $1 = 'teacher-uuid-here'
```

---

## Complete Login Flow with Actual Queries

### Step-by-Step Execution:

1. **User Authentication:**
   ```sql
   SELECT * FROM users WHERE username = 'jpst9397313';
   ```
   → Returns: `{ id: 'user-uuid-123', username: 'jpst9397313', role: 'teacher' }`

2. **Teacher Lookup:**
   ```sql
   SELECT * FROM teachers WHERE "userId" = 'user-uuid-123';
   ```
   → Returns: `{ id: 'teacher-uuid-456', teacherId: 'jpst9397313', firstName: 'John', lastName: 'Doe' }`

3. **Classes Fetch (Junction Table - PRIMARY):**
   ```sql
   SELECT tc.*, c.*
   FROM teacher_classes tc
   INNER JOIN classes c ON c.id = tc."classId"
   WHERE tc."teacherId" = 'teacher-uuid-456';
   ```
   → Returns: Array of classes assigned to teacher

4. **Full Name Construction:**
   ```typescript
   fullName = `${teacher.lastName} ${teacher.firstName}`;
   // Result: "Doe John"
   ```

---

## Table Relationships Diagram

```
users
  ├── id (UUID) ──────────┐
  └── username (VARCHAR)  │
                          │
teachers                  │
  ├── id (UUID) ──────────┼──┐
  ├── teacherId (VARCHAR) │  │
  ├── firstName           │  │
  ├── lastName            │  │
  └── userId (FK) ────────┘  │
                             │
teacher_classes (Junction)   │
  ├── teacherId (FK) ────────┘
  └── classId (FK) ────────┐
                            │
classes                     │
  └── id (UUID) ────────────┘
```

---

## Key SQL Patterns

### Pattern 1: Find Teacher by Username (TeacherID)
```sql
SELECT t.*
FROM teachers t
INNER JOIN users u ON u.id = t."userId"
WHERE u.username = 'jpst9397313';
```

### Pattern 2: Get All Classes for Teacher (Junction Table)
```sql
SELECT c.id, c.name, c.form, c.description, c."isActive"
FROM classes c
INNER JOIN teacher_classes tc ON tc."classId" = c.id
WHERE tc."teacherId" = 'teacher-uuid-here'
ORDER BY c.name;
```

### Pattern 3: Get All Classes for Teacher (ManyToMany)
```sql
SELECT c.id, c.name, c.form, c.description, c."isActive"
FROM classes c
INNER JOIN teachers_classes_mtm tcm ON tcm."classesId" = c.id
WHERE tcm."teachersId" = 'teacher-uuid-here'
ORDER BY c.name;
```

---

## Performance Notes

1. **Junction Table is Faster:** The `teacher_classes` junction table has indexes on both `teacherId` and `classId`, making queries very fast.

2. **Indexes Used:**
   - `IDX_teacher_classes_teacherId` - for finding all classes for a teacher
   - `IDX_teacher_classes_classId` - for finding all teachers for a class
   - `UQ_teacher_classes` - unique constraint prevents duplicates

3. **Query Optimization:**
   - Junction table queries use indexed lookups
   - JOIN operations are efficient with proper indexes
   - Results are cached in memory after first fetch

