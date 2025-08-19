-- Update the status check constraint to include 'deleted' status
-- First, drop the existing constraint
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_status_check;

-- Then, add the new constraint with 'deleted' status included
ALTER TABLE public.loans 
ADD CONSTRAINT loans_status_check 
CHECK (status IN ('pending', 'active', 'overdue', 'paid', 'deleted'));
