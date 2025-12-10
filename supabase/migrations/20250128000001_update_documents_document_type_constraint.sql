-- Update documents_document_type_check constraint to allow new document types
-- This migration updates the constraint to include all valid document types

-- First, drop the existing constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'documents_document_type_check'
    ) THEN
        ALTER TABLE public.documents
        DROP CONSTRAINT documents_document_type_check;
    END IF;
END $$;

-- Add the new CHECK constraint with all valid document types
ALTER TABLE public.documents
ADD CONSTRAINT documents_document_type_check 
CHECK (document_type IN (
    'general',
    'contract',
    'receipt',
    'identification',
    'loan_document',
    'invoice',
    'statement',
    'other'
));

-- Add comment to document the valid document types
COMMENT ON COLUMN public.documents.document_type IS 'Tipo de documento: general, contract (contrato), receipt (comprobante), identification (identificación), loan_document (documento de préstamo), invoice (factura), statement (estado de cuenta), other (otro)';

