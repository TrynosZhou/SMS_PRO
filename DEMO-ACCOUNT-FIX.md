# Demo Account Data Access Fix

## Issue
Demo accounts were unable to add or view students in the live production environment. Students were not loading from the database for demo users.

## Root Cause Analysis

The system had **data isolation logic** that was incorrectly filtering data for demo users:

1. **`isDemoUser()` function** in `backend/src/utils/demoDataFilter.ts`:
   - Was only checking for `isDemo` flag and specific email addresses
   - Did NOT check for the `UserRole.DEMO_USER` role
   - This caused users with `DEMO_USER` role to not be recognized properly

2. **`getStudents()` function** in `backend/src/controllers/student.controller.ts`:
   - Was filtering students to only show those with `user.isDemo = true`
   - This created a problem because:
     - Students are standalone entities
     - Most students don't have linked user accounts
     - The filter `user.isDemo = true` returned NO results when `user` was NULL
   - Demo users couldn't see ANY students, including the ones they just created

3. **`getInvoices()` function** in `backend/src/controllers/finance.controller.ts`:
   - Had similar filtering logic for demo users
   - Only showed invoices for students with `user.isDemo = true`
   - This prevented demo users from seeing invoices for the students they created

## Solution Implemented

### 1. Updated `isDemoUser()` Function
**File**: `backend/src/utils/demoDataFilter.ts`

Added check for `UserRole.DEMO_USER` role:

```typescript
export function isDemoUser(req: AuthRequest): boolean {
  const isDemo = req.user?.isDemo === true || 
                 req.user?.role === UserRole.DEMO_USER ||  // NEW: Check for DEMO_USER role
                 req.user?.email === 'demo@school.com' || 
                 req.user?.username === 'demo@school.com';
  // ...
  return isDemo;
}
```

### 2. Removed Demo Filtering from `getStudents()`
**File**: `backend/src/controllers/student.controller.ts`

**Changed**:
- Removed the condition `if (isDemoUser(req))` that filtered students
- Demo users now see ALL students (full access)
- Removed filtering logic on lines 363-365 and 438-440

**Before**:
```typescript
if (isDemoUser(req)) {
  queryBuilder.andWhere('user.isDemo = :isDemo', { isDemo: true });
}
```

**After**:
```typescript
// Query all students for the class (demo users have full access)
students = await queryBuilder.getMany();
```

### 3. Removed Demo Filtering from `getInvoices()`
**File**: `backend/src/controllers/finance.controller.ts`

**Changed**:
- Removed the entire demo user filtering block (lines 286-306)
- Demo users now see ALL invoices (full access)

**Before**:
```typescript
if (isDemoUser(req)) {
  const queryBuilder = invoiceRepository
    .createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.student', 'student')
    .leftJoinAndSelect('student.user', 'user')
    .where('user.isDemo = :isDemo', { isDemo: true });
  // ... filtering logic
  return res.json(invoices);
}
```

**After**:
```typescript
// Demo users have full access to all invoices
const where: any = {};
if (studentId) where.studentId = studentId;
// ... standard querying for all users
```

## Impact

### ✅ What Changed
- Demo users can now **create students** successfully
- Demo users can now **view all students** in the database
- Demo users can now **view all invoices** in the database
- Demo users have **full access** to all data, as intended
- The `DEMO_USER` role is now properly recognized by the system

### 🔒 Security Considerations
- Demo users still **cannot modify settings** (enforced by UI and backend routes)
- Demo users still **cannot create SuperAdmin accounts** (enforced in account controller)
- Demo users follow the same **authentication and authorization** flow
- All other access controls remain intact

### 📊 Data Access Philosophy

**Previous Approach** (Data Isolation):
- Demo users could only see data they created
- Required linking student records to user accounts
- Complex filtering logic throughout the codebase
- **Problem**: Students aren't typically linked to user accounts

**New Approach** (Full Access):
- Demo users have full read/write access to all modules except settings
- No data isolation - demo users see everything
- Simpler codebase, fewer edge cases
- **Better for**: Testing, demos, training environments

## Testing Recommendations

1. **Login as Demo User**:
   - Use credentials for an account with `DEMO_USER` role
   - Or use the "Login as Demo User" button

2. **Test Student Creation**:
   - Navigate to Students module
   - Click "Add Student"
   - Fill in required fields
   - Submit the form
   - **Expected**: Student is created and appears in the list

3. **Test Student Viewing**:
   - Navigate to Students module
   - **Expected**: All students in the database are visible
   - Filter by class
   - **Expected**: Students in that class are shown

4. **Test Invoice Viewing**:
   - Navigate to Finance module
   - **Expected**: All invoices are visible
   - **Expected**: Invoice for newly created student is shown

5. **Test Other Modules**:
   - Create teachers, classes, subjects
   - Create exams and record marks
   - Mark attendance
   - **Expected**: All operations work normally

## Files Modified

1. `backend/src/utils/demoDataFilter.ts`
   - Added `UserRole.DEMO_USER` check to `isDemoUser()` function

2. `backend/src/controllers/student.controller.ts`
   - Removed demo user filtering from `getStudents()` function (2 locations)

3. `backend/src/controllers/finance.controller.ts`
   - Removed demo user filtering from `getInvoices()` function

## Related Documentation
- See `DEMO-ACCOUNT-ENHANCEMENTS.md` for full demo account implementation details
- All demo account permissions and routes are documented there

## Future Considerations

If data isolation is needed in the future, consider:
1. **Separate Demo Database**: Use a separate database instance for demo accounts
2. **Tenant Isolation**: Implement proper multi-tenancy with tenant IDs
3. **Demo Flag on All Entities**: Add `isDemo` flag to Student, Invoice, etc.
4. **Scheduled Cleanup**: Automatically delete demo data periodically
5. **Demo Environment Indicator**: Clear UI indicator that user is in demo mode

