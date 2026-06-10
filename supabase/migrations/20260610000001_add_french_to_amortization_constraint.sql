-- Fix: add 'french' amortization type to loan_requests constraint
-- The form offered 'french' as an option but it was missing from the CHECK constraint

ALTER TABLE public.loan_requests DROP CONSTRAINT IF EXISTS check_amortization_type;

ALTER TABLE public.loan_requests
ADD CONSTRAINT check_amortization_type CHECK (
  amortization_type IN ('simple', 'french', 'german', 'american', 'indefinite')
);
