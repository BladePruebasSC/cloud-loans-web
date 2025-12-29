-- Add loan request specific document types to documents_document_type_check constraint
-- This allows storing documents for loan requests with specific types

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

-- Add the new CHECK constraint with all valid document types including loan request types
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
    'other',
    -- Loan request specific types
    'identity_card',
    'income_certificate',
    'bank_statements',
    'commercial_references',
    'guarantees'
));

-- Update comment to document the new document types
COMMENT ON COLUMN public.documents.document_type IS 'Tipo de documento: general, contract (contrato), receipt (comprobante), identification (identificación), loan_document (documento de préstamo), invoice (factura), statement (estado de cuenta), other (otro), identity_card (cédula de identidad), income_certificate (certificación de ingresos), bank_statements (estados bancarios), commercial_references (referencias comerciales), guarantees (garantías/colateral)';

