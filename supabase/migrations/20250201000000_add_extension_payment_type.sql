-- Add 'extension' as a valid payment type for pawn_payments
-- This allows tracking when pawn transactions are extended

-- Drop the existing CHECK constraint
ALTER TABLE public.pawn_payments
DROP CONSTRAINT IF EXISTS pawn_payments_payment_type_check;

-- Add the new CHECK constraint with 'extension' included
ALTER TABLE public.pawn_payments
ADD CONSTRAINT pawn_payments_payment_type_check 
CHECK (payment_type IN ('partial', 'full', 'interest', 'extension'));

-- Add comment to document the new payment type
COMMENT ON COLUMN public.pawn_payments.payment_type IS 'Tipo de pago: partial (parcial), full (completo), interest (interés), extension (extensión de plazo)';

