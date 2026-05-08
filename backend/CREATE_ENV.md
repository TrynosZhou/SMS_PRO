# Creating the .env File

If the `.env` file doesn't exist, you can create it in one of these ways:

## Option 1: Copy from Example (Windows)
```powershell
cd backend
Copy-Item .env.example .env
```

## Option 2: Copy from Example (Linux/Mac)
```bash
cd backend
cp .env.example .env
```

## Option 3: Manual Creation

Create a file named `.env` in the `backend` directory with this content:

```env
# Server Configuration
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=sms_db

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_min_32_characters
JWT_EXPIRES_IN=7d
```

## Important Notes

- The `.env` file is in `.gitignore` (for security)
- Default password is `postgres` (works with Docker)
- Change `DB_PASSWORD` if using local PostgreSQL with different password
- Change `JWT_SECRET` to a secure random string in production

## Location

The `.env` file should be located at:
```
backend/.env
```

