-- Add 'extension' as a valid payment type for pawn_payments
-- This allows tracking when pawn transactions are extended

-- First, check if the constraint exists and drop it
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'pawn_payments_payment_type_check'
    ) THEN
        ALTER TABLE public.pawn_payments
        DROP CONSTRAINT pawn_payments_payment_type_check;
    END IF;
END $$;

-- Add the new CHECK constraint with 'extension' included
ALTER TABLE public.pawn_payments
ADD CONSTRAINT pawn_payments_payment_type_check 
CHECK (payment_type IN ('partial', 'full', 'interest', 'extension'));

-- Add comment to document the new payment type
COMMENT ON COLUMN public.pawn_payments.payment_type IS 'Tipo de pago: partial (parcial), full (completo), interest (interés), extension (extensión de plazo)';

