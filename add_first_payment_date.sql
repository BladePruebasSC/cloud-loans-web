-- Add first_payment_date column to loans table
-- This column stores the date of the first installment (base date that never changes)

ALTER TABLE public.loans 
ADD COLUMN IF NOT EXISTS first_payment_date DATE;

-- Add comment to explain the column purpose
COMMENT ON COLUMN public.loans.first_payment_date IS 'Fecha de la primera cuota (base fija que nunca cambia)';

-- Update existing loans to set first_payment_date = next_payment_date
-- This ensures existing loans have the correct base date
UPDATE public.loans 
SET first_payment_date = next_payment_date 
WHERE first_payment_date IS NULL;

-- Make the column NOT NULL after setting values
ALTER TABLE public.loans 
ALTER COLUMN first_payment_date SET NOT NULL;
