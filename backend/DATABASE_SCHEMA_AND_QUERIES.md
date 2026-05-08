# Database Schema and Login Query Flow

## Table Schemas

### 1. `teachers` Table

```sql
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "firstName" VARCHAR NOT NULL,
    "lastName" VARCHAR NOT NULL,
    "teacherId" VARCHAR NOT NULL UNIQUE,
    "phoneNumber" VARCHAR,
    "address" VARCHAR,
    "dateOfBirth" DATE,
    "isActive" BOOLEAN DEFAULT true,
    "userId" UUID,
    CONSTRAINT "FK_teachers_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX "IDX_teachers_teacherId" ON teachers("teacherId");
```

**Key Fields:**
- `id` (UUID): Primary key
- `teacherId` (VARCHAR): Unique identifier (e.g., "jpst9397313") - used as username for login
- `firstName` (VARCHAR): Teacher's first name
- `lastName` (VARCHAR): Teacher's last name
- `userId` (UUID): Foreign key to `users` table

### 2. `classes` Table

```sql
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE,
    form VARCHAR NOT NULL,
    description VARCHAR,
    "isActive" BOOLEAN DEFAULT true
);

CREATE UNIQUE INDEX "IDX_classes_name" ON classes(name);
```

**Key Fields:**
- `id` (UUID): Primary key
- `name` (VARCHAR): Class name (e.g., "1A Diamond")
- `form` (VARCHAR): Grade/Form (e.g., "Stage 1A")
- `description` (VARCHAR): Optional description

### 3. `teacher_classes` Junction Table

```sql
CREATE TABLE teacher_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "teacherId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    CONSTRAINT "FK_teacher_classes_teacher" FOREIGN KEY ("teacherId") REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT "FK_teacher_classes_class" FOREIGN KEY ("classId") REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT "UQ_teacher_classes" UNIQUE ("teacherId", "classId")
);

CREATE INDEX "IDX_teacher_classes_teacherId" ON teacher_classes("teacherId");
CREATE INDEX "IDX_teacher_classes_classId" ON teacher_classes("classId");
```

**Key Fields:**
- `id` (UUID): Primary key
- `teacherId` (UUID): Foreign key to `teachers.id`
- `classId` (UUID): Foreign key to `classes.id`
- **Unique constraint** on (`teacherId`, `classId`) prevents duplicate assignments

### 4. `users` Table (for reference)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR,
    username VARCHAR NOT NULL,
    password VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    "mustChangePassword" BOOLEAN DEFAULT false,
    "isTemporaryAccount" BOOLEAN DEFAULT false,
    "isDemo" BOOLEAN DEFAULT false
);
```

**For Teachers:**
- `username` = `teacherId` (e.g., "jpst9397313")
- `email` = NULL (not required for teachers)
- `role` = 'teacher'

---

## Query Flow When Teacher Logs In

### Step 1: User Authentication (Login Endpoint)

**Location:** `backend/src/controllers/auth.controller.ts` - `login` function

**Query 1: Find User by Username (TeacherID)**
```typescript
// TypeORM Query (equivalent SQL shown below)
const user = await userRepository.findOne({
  where: { username: teacherId } // teacherId is the username entered
});
```

**Equivalent SQL:**
```sql
SELECT * FROM users 
WHERE username = 'jpst9397313'  -- The TeacherID entered as username
LIMIT 1;
```

**Query 2: Find Teacher by userId**
```typescript
// TypeORM Query
let teacher = await teacherRepository.findOne({
  where: { userId: user.id },
  relations: ['classes', 'subjects']
});
```

**Equivalent SQL:**
```sql
SELECT t.*, 
       c.id as class_id, c.name as class_name, c.form as class_form,
       s.id as subject_id, s.name as subject_name
FROM teachers t
LEFT JOIN teacher_classes tc ON tc."teacherId" = t.id
LEFT JOIN classes c ON c.id = tc."classId"
LEFT JOIN teacher_subjects ts ON ts."teacherId" = t.id
LEFT JOIN subjects s ON s.id = ts."subjectId"
WHERE t."userId" = 'USER_UUID_HERE'
LIMIT 1;
```

**If teacher not found by userId, try by teacherId:**
```typescript
// TypeORM Query
teacher = await teacherRepository.findOne({
  where: { teacherId: user.username } // user.username is the TeacherID
});
```

**Equivalent SQL:**
```sql
SELECT * FROM teachers 
WHERE "teacherId" = 'jpst9397313'  -- The username (TeacherID)
LIMIT 1;
```

### Step 2: Fetch Classes from Junction Table (Primary Method)

**Location:** `backend/src/controllers/auth.controller.ts` - Lines 228-243

**Query 3: Fetch Classes from Junction Table**
```typescript
// TypeORM Query
const { TeacherClass } = await import('../entities/TeacherClass');
const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

const teacherClasses = await teacherClassRepository.find({
  where: { teacherId: teacher.id },  // teacher.id is the UUID
  relations: ['class']
});
```

**Equivalent SQL:**
```sql
SELECT 
    tc.id,
    tc."teacherId",
    tc."classId",
    c.id as class_id,
    c.name as class_name,
    c.form as class_form,
    c.description as class_description,
    c."isActive" as class_isActive
FROM teacher_classes tc
INNER JOIN classes c ON c.id = tc."classId"
WHERE tc."teacherId" = 'TEACHER_UUID_HERE'  -- teacher.id (UUID)
ORDER BY c.name;
```

**Result Processing:**
```typescript
// Extract class entities from junction table
const classes = teacherClasses.map(tc => tc.class);
teacher.classes = classes;
```

### Step 3: Fallback to ManyToMany Relation (if junction table is empty)

**Location:** `backend/src/controllers/auth.controller.ts` - Lines 245-275

**Query 4: Fallback - Fetch via ManyToMany**
```typescript
// TypeORM Query
const teacherWithClasses = await teacherRepository.findOne({
  where: { id: teacher.id },
  relations: ['classes']
});
```

**Equivalent SQL:**
```sql
SELECT 
    t.*,
    c.id as classes_id,
    c.name as classes_name,
    c.form as classes_form,
    c.description as classes_description,
    c."isActive" as classes_isActive
FROM teachers t
LEFT JOIN teachers_classes_mtm tc_mtm ON tc_mtm."teachersId" = t.id
LEFT JOIN classes c ON c.id = tc_mtm."classesId"
WHERE t.id = 'TEACHER_UUID_HERE';
```

**Note:** If classes are found via ManyToMany, they are automatically synced to the junction table for future queries.

---

## Complete Login Flow Summary

### When Teacher Logs In with TeacherID as Username:

1. **User Lookup:**
   ```sql
   SELECT * FROM users WHERE username = 'jpst9397313';
   ```

2. **Teacher Lookup:**
   ```sql
   SELECT * FROM teachers WHERE "userId" = '<user.id>' 
   OR "teacherId" = 'jpst9397313';
   ```

3. **Classes Fetch (Primary - Junction Table):**
   ```sql
   SELECT c.* 
   FROM teacher_classes tc
   INNER JOIN classes c ON c.id = tc."classId"
   WHERE tc."teacherId" = '<teacher.id>'
   ORDER BY c.name;
   ```

4. **Classes Fetch (Fallback - ManyToMany):**
   ```sql
   SELECT c.* 
   FROM teachers t
   LEFT JOIN teachers_classes_mtm tc_mtm ON tc_mtm."teachersId" = t.id
   LEFT JOIN classes c ON c.id = tc_mtm."classesId"
   WHERE t.id = '<teacher.id>';
   ```

5. **Full Name Construction:**
   ```typescript
   fullName = `${teacher.lastName} ${teacher.firstName}`.trim();
   // Example: "Doe John" (LastName + FirstName)
   ```

---

## Example Data Flow

### Input:
- **Username:** `jpst9397313` (TeacherID)
- **Password:** `[password]`

### Database Queries:

1. **Find User:**
   ```sql
   SELECT * FROM users WHERE username = 'jpst9397313';
   ```
   **Result:** User record with `id = 'user-uuid-123'`

2. **Find Teacher:**
   ```sql
   SELECT * FROM teachers WHERE "userId" = 'user-uuid-123';
   ```
   **Result:** Teacher record with:
   - `id = 'teacher-uuid-456'`
   - `teacherId = 'jpst9397313'`
   - `firstName = 'John'`
   - `lastName = 'Doe'`

3. **Fetch Classes:**
   ```sql
   SELECT c.* 
   FROM teacher_classes tc
   INNER JOIN classes c ON c.id = tc."classId"
   WHERE tc."teacherId" = 'teacher-uuid-456';
   ```
   **Result:** Array of classes assigned to this teacher

### Output:
- **Full Name:** `Doe John` (LastName + FirstName)
- **Classes:** Array of class objects assigned to the teacher

---

## Key Points

1. **TeacherID as Username:** The `teacherId` field (e.g., "jpst9397313") is used as the `username` in the `users` table.

2. **Junction Table Priority:** The system first tries to fetch classes from the `teacher_classes` junction table, which is the primary method.

3. **Fallback Mechanism:** If the junction table is empty, it falls back to the ManyToMany relation and automatically syncs data to the junction table.

4. **Full Name Format:** Full name is constructed as `LastName + FirstName` (e.g., "Doe John").

5. **UUID vs String:** 
   - `teacher.id` = UUID (used for database relationships)
   - `teacher.teacherId` = String (e.g., "jpst9397313", used as username)

