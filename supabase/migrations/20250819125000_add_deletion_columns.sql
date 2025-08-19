-- Add deletion columns to loans table for soft delete functionality
ALTER TABLE public.loans 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- Create index for deleted_at column for better query performance
CREATE INDEX IF NOT EXISTS idx_loans_deleted_at ON public.loans(deleted_at);

-- Create index for status column if it doesn't exist (for filtering deleted loans)
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
