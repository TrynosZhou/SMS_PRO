# Teacher-Class Assignment Guide

## Overview
The system already supports linking teachers to multiple classes! This guide explains how it works and how to use it.

## ✅ Features Already Implemented

### 1. **Teacher Form - Class Assignment**
**Location**: Teachers → Add/Edit Teacher

**Features**:
- ✅ Multi-select class assignment
- ✅ Search functionality to find classes
- ✅ Visual badges showing count of selected classes
- ✅ Checkbox interface for easy selection
- ✅ Works for both new and existing teachers

### 2. **Backend - Class Relationship Management**
**Location**: `backend/src/controllers/teacher.controller.ts`

**Features**:
- ✅ Creates teacher-class many-to-many relationships
- ✅ Updates class assignments when teacher is edited
- ✅ Fetches teacher with all assigned classes
- ✅ Proper TypeORM relationship handling

### 3. **Record Book - Class Selection**
**Location**: My Record Book page

**Features**:
- ✅ Dropdown shows all classes assigned to logged-in teacher
- ✅ Displays class name (e.g., "5 Gold", "Grade 3 Blue")
- ✅ When class selected, loads all students in that class
- ✅ Students sorted alphabetically by LastName

## 📋 How to Assign Classes to a Teacher

### Step 1: Navigate to Teachers Page
1. Login as Admin or SuperAdmin
2. Click "Teachers" in the navigation menu
3. Click "Add New Teacher" or click "Edit" on an existing teacher

### Step 2: Fill in Teacher Information
1. Enter **First Name** and **Last Name** (required)
2. Fill in optional fields: Phone Number, Address, Date of Birth

### Step 3: Assign Classes
1. Scroll to **"Teaching Assignments"** section
2. In the **"Classes"** section:
   - You'll see a search box
   - Below it, all available classes with checkboxes
3. **Select classes**:
   - Click checkboxes for classes this teacher will teach
   - You can select multiple classes
   - The badge shows count: "5 selected"
4. Use search box to filter classes if you have many

### Step 4: Assign Subjects (Optional)
- Also assign subjects the teacher teaches
- Works the same way as classes

### Step 5: Save
- Click "Register Teacher" (new) or "Update Teacher" (edit)
- Success message appears
- Classes are now linked to the teacher

## 🎯 How Teachers Use the Record Book

### When Teacher Logs In:

1. **Navigate to Record Book**
   - Click "📚 My Record Book" in the navigation menu

2. **Select a Class**
   - A dropdown appears showing all classes assigned to you
   - Example: "5 Gold", "Grade 3 Blue", "Form 1A"
   - Select the class you want to enter marks for

3. **View Students**
   - All students in the selected class are displayed
   - Students sorted alphabetically by LastName
   - Table shows: Student ID, LastName, FirstName

4. **Enter Marks**
   - Enter marks for Test 1-10 (you can add/remove columns)
   - Enter topics for each test
   - Marks auto-save when you move to next field
   - Or click "Save All Marks" to save everything

## 📊 Example Workflow

### Admin assigns teacher to classes:
```
Admin → Teachers → Edit "John Doe"
  ✅ Select "5 Gold"
  ✅ Select "5 Silver"
  ✅ Select "6 Gold"
  → Save
```

### Teacher uses Record Book:
```
Login as John Doe (Teacher)
  → Click "My Record Book"
  → Dropdown shows:
     - 5 Gold
     - 5 Silver
     - 6 Gold
  → Select "5 Gold"
  → See all students in 5 Gold
  → Enter marks for Test 1, 2, 3, 4...
  → Marks saved automatically
```

## 🔧 Technical Details

### Database Relationship

**Many-to-Many**: One teacher can teach many classes, one class can have many teachers.

**Junction Table**: `teachers_classes_classes`

```sql
-- Check which classes a teacher teaches
SELECT 
  t.id as teacher_id,
  t."firstName",
  t."lastName",
  c.id as class_id,
  c.name as class_name
FROM teachers t
JOIN teachers_classes_classes tcc ON t.id = tcc."teachersId"
JOIN classes c ON c.id = tcc."classesId"
WHERE t.id = 'teacher-uuid-here';
```

### API Endpoints

**Get Current Teacher with Classes**:
```http
GET /api/teachers/me
Authorization: Bearer <token>

Response:
{
  "id": "teacher-uuid",
  "firstName": "John",
  "lastName": "Doe",
  "classes": [
    { "id": "class-1", "name": "5 Gold" },
    { "id": "class-2", "name": "5 Silver" }
  ]
}
```

**Update Teacher Classes**:
```http
PUT /api/teachers/:id
Content-Type: application/json

{
  "classIds": ["class-1", "class-2", "class-3"]
}
```

**Get Record Book for a Class**:
```http
GET /api/record-book/class/:classId
Authorization: Bearer <token>

Response:
{
  "students": [...],
  "term": "Term 1",
  "year": "2025"
}
```

## 🚨 Common Issues & Solutions

### Issue 1: Teacher sees "No classes assigned"

**Cause**: Teacher has no classes assigned in their profile

**Solution**:
1. Admin goes to Teachers page
2. Edits the teacher
3. Assigns at least one class
4. Saves

### Issue 2: Teacher can't see Record Book menu

**Cause**: User is not logged in as a teacher

**Solution**:
- Only users with role="teacher" can see "My Record Book"
- Verify user has correct role in Users/Accounts page

### Issue 3: Classes dropdown is empty

**Causes**:
- Teacher has no classes assigned
- Teacher's `userId` is not properly linked

**Solution**:
```sql
-- Check if teacher has userId
SELECT id, "firstName", "lastName", "userId" 
FROM teachers 
WHERE "employeeNumber" = 'JPST001';

-- If userId is NULL, link it:
UPDATE teachers 
SET "userId" = (SELECT id FROM users WHERE email = 'teacher@school.com')
WHERE "employeeNumber" = 'JPST001';
```

### Issue 4: Students not loading when class selected

**Causes**:
- No students enrolled in that class
- Students are marked as inactive

**Solution**:
```sql
-- Check students in a class
SELECT "studentNumber", "firstName", "lastName", "isActive"
FROM students
WHERE "classId" = 'class-uuid-here';

-- If students are inactive, reactivate:
UPDATE students 
SET "isActive" = true 
WHERE "classId" = 'class-uuid-here';
```

## 📱 UI Screenshots Description

### Teacher Form - Class Assignment Section:
```
┌─────────────────────────────────────┐
│ 📚 Teaching Assignments             │
│ Select subjects and classes...      │
├─────────────────────────────────────┤
│ Classes [3 selected]                │
│ 🔍 [Search classes...]              │
│                                     │
│ ☑ 5 Gold                            │
│ ☑ 5 Silver                          │
│ ☑ 6 Gold                            │
│ ☐ Grade 3 Blue                      │
│ ☐ Form 1A                           │
│                                     │
│ Select all classes this teacher     │
│ will be assigned to                 │
└─────────────────────────────────────┘
```

### Record Book - Class Selection:
```
┌─────────────────────────────────────┐
│ 📚 My Record Book                   │
├─────────────────────────────────────┤
│ Select Class                        │
│ Your Classes ▼                      │
│   ├─ 5 Gold                         │
│   ├─ 5 Silver                       │
│   └─ 6 Gold                         │
└─────────────────────────────────────┘

When class selected:

School name: Junior Primary School
Class: 5 Gold
Teacher Name: John Doe
Term: Term 1 2025

┌─────────────────────────────────────────┐
│ Student ID │ LastName │ FirstName │ ... │
├────────────┼──────────┼───────────┼─────┤
│ S001       │ Adams    │ Alice     │ ... │
│ S002       │ Brown    │ Bob       │ ... │
│ S003       │ Clark    │ Carol     │ ... │
└─────────────────────────────────────────┘
```

## ✅ Testing Checklist

- [ ] Admin can add new teacher
- [ ] Admin can select multiple classes for teacher
- [ ] Admin can edit teacher and change class assignments
- [ ] Teacher can login
- [ ] Teacher sees "My Record Book" in navigation
- [ ] Teacher opens Record Book
- [ ] Dropdown shows all assigned classes
- [ ] Selecting a class loads students
- [ ] Students are sorted alphabetically
- [ ] Teacher can enter marks for students
- [ ] Marks save successfully
- [ ] Teacher can switch between different classes
- [ ] Each class shows its own students

## 🎓 Best Practices

1. **Assign Classes During Teacher Creation**
   - Assign classes when first creating the teacher
   - Easier than editing later

2. **Regular Updates**
   - Update class assignments at the start of each term/year
   - Remove teachers from classes they no longer teach

3. **Clear Class Names**
   - Use descriptive class names (e.g., "Grade 5 Gold", "Form 3 Science")
   - Makes it easier for teachers to find their classes

4. **Multiple Teachers Per Class**
   - It's okay to assign multiple teachers to one class
   - Example: Math teacher and English teacher both assigned to "5 Gold"

5. **Subject-Class Alignment**
   - Assign subjects that match the classes
   - Example: If teacher teaches Math, assign them to classes where they teach Math

## 📞 Support

If you encounter issues:
1. Check backend console for `[getCurrentTeacher]` logs
2. Verify teacher has `userId` set in database
3. Confirm classes are properly assigned
4. Check that students exist in the selected class
5. Ensure teacher is logged in with correct account

## Summary

✅ **Teacher-class assignment is fully functional!**

- Admins can assign teachers to multiple classes
- Teachers see only their assigned classes
- Record Book works with class selection
- Students displayed for each class
- Marks can be entered per class

**No additional implementation needed** - just use the existing features!

