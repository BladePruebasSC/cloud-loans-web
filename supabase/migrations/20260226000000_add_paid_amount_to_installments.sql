-- Migration: Add paid_amount column to installments table
-- This column tracks how much has been paid for each installment/charge
-- Useful for partial payments on charges

-- Add paid_amount column if it doesn't exist
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN installments.paid_amount IS 'Amount paid towards this installment or charge. Used to track partial payments.';

-- Create index for better query performance when filtering by paid_amount
CREATE INDEX IF NOT EXISTS idx_installments_paid_amount ON installments(paid_amount);

-- Update existing paid installments to set paid_amount equal to total_amount
-- This ensures existing paid installments are marked correctly
UPDATE installments 
SET paid_amount = total_amount 
WHERE is_paid = true AND paid_amount = 0;

-- Add check constraint to ensure paid_amount doesn't exceed total_amount
ALTER TABLE installments 
ADD CONSTRAINT check_paid_amount_not_exceeds_total 
CHECK (paid_amount <= total_amount);
