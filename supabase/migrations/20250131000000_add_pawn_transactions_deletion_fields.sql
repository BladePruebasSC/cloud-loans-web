-- Add deletion fields to pawn_transactions table for soft delete functionality
-- Similar to loans table deletion functionality

-- Add deleted_at and deleted_reason columns
ALTER TABLE public.pawn_transactions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- Update existing transactions with 'extended' status to 'active'
-- (extensions should keep status as 'active', only the due_date is extended)
UPDATE public.pawn_transactions
SET status = 'active'
WHERE status = 'extended';

-- Update the status CHECK constraint to include 'deleted' and remove 'extended'
-- (extended is no longer used - extensions keep status as 'active')
ALTER TABLE public.pawn_transactions
DROP CONSTRAINT IF EXISTS pawn_transactions_status_check;

ALTER TABLE public.pawn_transactions
ADD CONSTRAINT pawn_transactions_status_check 
CHECK (status IN ('active', 'redeemed', 'forfeited', 'deleted'));

-- Create index for deleted_at column for better query performance
CREATE INDEX IF NOT EXISTS idx_pawn_transactions_deleted_at ON public.pawn_transactions(deleted_at);

-- Add comments to document the new fields
COMMENT ON COLUMN public.pawn_transactions.deleted_at IS 'Fecha de eliminación (soft delete). Permite recuperar transacciones eliminadas.';
COMMENT ON COLUMN public.pawn_transactions.deleted_reason IS 'Razón de la eliminación de la transacción.';

