# Creating Administrator Account

## Method 1: Using Script (Recommended)

After setting up the database and starting the backend, run:

```bash
cd backend
npm run create-admin <username> <password> <email>
```

**Example:**
```bash
npm run create-admin admin admin123 admin@school.com
```

This will create an admin account with:
- **Username**: admin
- **Password**: admin123
- **Email**: admin@school.com
- **Role**: Admin

## Method 2: Using API

1. Start the backend server:
```bash
npm run dev
```

2. Register a user via API:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@school.com",
    "password": "admin123",
    "role": "admin"
  }'
```

3. The user will be created with admin role.

## Method 3: Direct Database (Not Recommended)

Only use if other methods don't work:

1. Register any user via API (without role, defaults to student)
2. Connect to database:
```sql
UPDATE users 
SET role = 'admin', username = 'admin' 
WHERE email = 'your_email@example.com';
```

## Login

After creating the admin account, you can login with:
- **Username**: admin (or whatever you set)
- **Password**: admin123 (or whatever you set)

OR

- **Email**: admin@school.com
- **Password**: admin123

Both username and email work for login!

