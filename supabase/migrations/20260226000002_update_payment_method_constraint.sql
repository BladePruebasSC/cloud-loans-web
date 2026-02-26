-- Migration: Update payment_method constraint to accept 'transfer' as alias for 'bank_transfer'
-- This allows both values for backward compatibility

-- First, update any existing payments with 'transfer' to 'bank_transfer'
UPDATE payments 
SET payment_method = 'bank_transfer' 
WHERE payment_method = 'transfer';

-- Drop the old constraint
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS payments_payment_method_check;

-- Add new constraint that accepts both 'transfer' and 'bank_transfer'
ALTER TABLE payments 
ADD CONSTRAINT payments_payment_method_check 
CHECK (payment_method IN ('cash', 'bank_transfer', 'transfer', 'check', 'card', 'online'));

-- Add comment explaining the alias
COMMENT ON COLUMN payments.payment_method IS 'Payment method: cash, bank_transfer (or transfer), check, card, online';
