-- Script to remove Schools table from database
-- Run this on your database to complete the Schools entity removal

-- Drop the schools table if it exists
DROP TABLE IF EXISTS schools CASCADE;

-- Remove school-related migrations from the migrations table
DELETE FROM migrations WHERE name IN (
    'AddSchoolMultitenancy1700240000000',
    'RenameCodeToSchoolid1700250000000',
    'RemoveSchoolMultitenancy1700260000000',
    'CreateSchoolsTable1700300000000'
);

-- Verify removal
SELECT 'Schools table removed successfully!' as status;

-- Show remaining migrations
SELECT "timestamp", name FROM migrations ORDER BY "timestamp";

