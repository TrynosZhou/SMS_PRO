-- Make email column nullable in users table
-- This allows teachers to have accounts without email addresses

-- Step 1: Drop the existing unique index on email
DROP INDEX IF EXISTS "IDX_users_email";

-- Step 2: Make the email column nullable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Step 3: Create a new unique index that allows NULL values (PostgreSQL allows multiple NULLs in unique indexes)
CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") 
WHERE "email" IS NOT NULL;

