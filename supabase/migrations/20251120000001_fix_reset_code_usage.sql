/*
  # Fix: Mark registration codes as used when used for company reset
  
  This migration ensures that when a registration code is used to reset
  company data, it is properly marked as used in the database.
  
  Note: The application code has been updated to mark codes as used,
  but this migration serves as documentation and ensures consistency.
*/

-- No database changes needed as the application code handles this
-- This migration is for documentation purposes only

-- The application code in CompanySettings.tsx now:
-- 1. Validates the code
-- 2. Checks if it's expired
-- 3. Marks it as used before resetting company data
-- 4. Only allows codes that are not already used (is_used = false)

-- Verification query to check codes used for resets:
-- SELECT * FROM registration_codes 
-- WHERE is_used = true 
-- ORDER BY used_at DESC;

