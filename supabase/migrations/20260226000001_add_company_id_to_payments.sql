-- Migration: Add company_id column to payments table
-- This column is needed to track which company the payment belongs to

-- Add company_id column if it doesn't exist
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS company_id UUID;

-- Add comment to explain the column
COMMENT ON COLUMN payments.company_id IS 'Reference to the company this payment belongs to';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);

-- Update existing payments to set company_id from the client's company through the loan
UPDATE payments p
SET company_id = c.company_id
FROM loans l
JOIN clients c ON l.client_id = c.id
WHERE p.loan_id = l.id AND p.company_id IS NULL;

-- For payments where company_id is still NULL (if client doesn't have company_id),
-- set it to the created_by user (assuming the user belongs to a company)
UPDATE payments
SET company_id = created_by
WHERE company_id IS NULL AND created_by IS NOT NULL;

-- Make company_id NOT NULL after backfilling existing records
ALTER TABLE payments 
ALTER COLUMN company_id SET NOT NULL;

-- Add foreign key constraint to company_settings table (if needed)
-- Note: commenting this out as company_id references auth.users(id) in other tables
-- ALTER TABLE payments
-- ADD CONSTRAINT fk_payments_company
-- FOREIGN KEY (company_id) 
-- REFERENCES company_settings(id) 
-- ON DELETE CASCADE;
