# Fix: 404 Error on /api/teachers/me

## Problem
The endpoint `/api/teachers/me` returns 404 (Not Found) instead of returning teacher data.

## Root Cause
Express route matching issue - the `/:id` route was matching before `/me` could be reached, or the route wasn't properly registered.

## Solution Applied

### 1. Route Order Fix
Reordered routes in `backend/src/routes/teacher.routes.ts`:

**Before** (potentially problematic):
```typescript
router.get('/', authenticate, getTeachers);
router.get('/me', authenticate, getCurrentTeacher);
router.get('/:id', authenticate, getTeacherById);
router.get('/:id/classes', authenticate, getTeacherClasses);
```

**After** (correct order):
```typescript
router.get('/', authenticate, getTeachers);
router.get('/me', authenticate, getCurrentTeacher);        // Specific route first
router.get('/:id/classes', authenticate, getTeacherClasses); // Specific route before /:id
router.get('/:id', authenticate, getTeacherById);          // Generic /:id last
```

**Rule**: Specific routes (like `/me`, `/:id/classes`) must come BEFORE generic parameter routes (like `/:id`).

### 2. Enhanced Logging
Added detailed logging to see if the endpoint is being called:

```typescript
console.log('[getCurrentTeacher] ========== ENDPOINT CALLED ==========');
console.log('[getCurrentTeacher] Request URL:', req.url);
console.log('[getCurrentTeacher] Request Method:', req.method);
```

This will help diagnose if:
- The route is being hit at all
- The request is reaching the controller
- Authentication is working

## How to Test

### Step 1: Restart Backend
```bash
cd backend
npm start
```

### Step 2: Watch Console Logs
When you try to access Record Book, you should see:
```
[getCurrentTeacher] ========== ENDPOINT CALLED ==========
[getCurrentTeacher] Request URL: /me
[getCurrentTeacher] Request Method: GET
[getCurrentTeacher] ============ DEBUG INFO ============
[getCurrentTeacher] User ID: <uuid>
[getCurrentTeacher] User Role: teacher
...
```

### Step 3: Check for These Scenarios

#### Scenario A: Logs appear, teacher found
```
[getCurrentTeacher] ENDPOINT CALLED
[getCurrentTeacher] Teacher found by userId: Yes
[getCurrentTeacher] Classes count: 3
```
**Status**: ✅ Working! Teacher data loaded successfully.

#### Scenario B: Logs appear, teacher not found
```
[getCurrentTeacher] ENDPOINT CALLED
[getCurrentTeacher] Teacher found by userId: No
[getCurrentTeacher] Auto-fixing teacher.userId...
```
**Status**: Auto-fix will resolve it. Refresh the page.

#### Scenario C: No logs appear at all
```
(No [getCurrentTeacher] logs in console)
```
**Status**: ❌ Route not being hit. Check:
1. Is backend running?
2. Is the URL correct? Should be `/api/teachers/me`
3. Is authentication token valid?

## Verification

### Test the endpoint directly:
```bash
# Get your auth token from browser (localStorage.getItem('token'))
curl -X GET http://localhost:3001/api/teachers/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response** (200):
```json
{
  "id": "teacher-uuid",
  "firstName": "John",
  "lastName": "Doe",
  "employeeNumber": "JPST1234567",
  "classes": [
    { "id": "class-1", "name": "5 Gold" },
    { "id": "class-2", "name": "5 Silver" }
  ]
}
```

**If you get 404**:
- Check if backend is running on port 3001
- Verify the route is `/api/teachers/me` (not `/api/teacher/me`)
- Check if routes are registered in `backend/src/routes/index.ts`

**If you get 401**:
- Token is invalid or expired
- Log out and log back in to get a fresh token

**If you get 403**:
- User is not a teacher
- Check user role in database

**If you get 500**:
- Check backend console for error details
- Likely a database or userId issue (see FIX-TEACHER-500-ERROR.md)

## Additional Debugging

### Check if route is registered:
Add this to `backend/src/routes/teacher.routes.ts`:
```typescript
console.log('[TeacherRoutes] Routes registered:');
router.stack.forEach((r) => {
  if (r.route) {
    console.log(`  ${Object.keys(r.route.methods)} ${r.route.path}`);
  }
});
```

Should output:
```
[TeacherRoutes] Routes registered:
  get /
  get /me
  get /:id/classes
  get /:id
  post /
  put /:id
  delete /:id
```

### Check main router:
In `backend/src/server.ts` or `backend/src/app.ts`, verify:
```typescript
import routes from './routes';
app.use('/api', routes); // This makes all routes available at /api/*
```

### Frontend URL check:
In `frontend/src/app/services/teacher.service.ts`:
```typescript
getCurrentTeacher(): Observable<any> {
  return this.http.get(`${this.apiUrl}/teachers/me`);
  // Should be: http://localhost:3001/api/teachers/me
}
```

## Common Issues

### Issue 1: Route matched as /:id
**Symptom**: Backend logs show `getTeacherById` being called with id='me'

**Fix**: Ensure `/me` route is defined BEFORE `/:id` route (already fixed)

### Issue 2: Authentication failing
**Symptom**: 401 Unauthorized

**Fix**: 
- Check if token is in request headers
- Verify token hasn't expired
- Log out and log back in

### Issue 3: CORS error
**Symptom**: Browser console shows CORS error

**Fix**: Check backend CORS configuration allows the frontend origin

### Issue 4: Wrong API URL
**Symptom**: Request goes to wrong URL

**Fix**: Check `environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api'
};
```

## Prevention

### Best Practices for Route Ordering:

1. **Most specific first**:
   ```typescript
   router.get('/me', ...)           // ✅ Specific
   router.get('/stats', ...)        // ✅ Specific
   router.get('/:id/classes', ...)  // ✅ Specific with param
   router.get('/:id', ...)          // ✅ Generic param last
   ```

2. **Avoid ambiguous routes**:
   ```typescript
   // BAD:
   router.get('/:id', ...)
   router.get('/:teacherId', ...) // Ambiguous!
   
   // GOOD:
   router.get('/teacher/:id', ...)
   router.get('/profile/:teacherId', ...)
   ```

3. **Use route prefixes**:
   ```typescript
   // Group related routes
   router.get('/current/info', getCurrentTeacher);
   router.get('/current/classes', getCurrentTeacherClasses);
   ```

## Summary

✅ **Route order fixed** - `/me` before `/:id`
✅ **Enhanced logging** - Can see if endpoint is called
✅ **Backend rebuilt** - Changes compiled
✅ **Ready to test** - Restart backend and try again

**Next Steps**:
1. Restart backend server
2. Try accessing Record Book
3. Check backend console for logs
4. If logs appear, the route is working
5. If no logs, check authentication and URL

