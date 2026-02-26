-- Migration: Add company_id column to payments table
-- This column is needed to track which company the payment belongs to

-- Add company_id column if it doesn't exist
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS company_id UUID;

-- Add foreign key constraint to company_settings table
ALTER TABLE payments
ADD CONSTRAINT fk_payments_company
FOREIGN KEY (company_id) 
REFERENCES company_settings(id) 
ON DELETE CASCADE;

-- Add comment to explain the column
COMMENT ON COLUMN payments.company_id IS 'Reference to the company this payment belongs to';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);

-- Update existing payments to set company_id from the loan's company
UPDATE payments p
SET company_id = l.company_id
FROM loans l
WHERE p.loan_id = l.id AND p.company_id IS NULL;

-- Make company_id NOT NULL after backfilling existing records
ALTER TABLE payments 
ALTER COLUMN company_id SET NOT NULL;
