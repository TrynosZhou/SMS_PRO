-- Add schoolMotto column to settings table
-- Run this SQL script to fix the 500 error immediately

ALTER TABLE "settings" 
ADD COLUMN IF NOT EXISTS "schoolMotto" text;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'settings' AND column_name = 'schoolMotto';

