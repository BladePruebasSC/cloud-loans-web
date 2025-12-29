-- Add request_id column to documents table to link documents to loan requests
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.loan_requests(id) ON DELETE CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_request_id ON public.documents(request_id);

-- Add comment for documentation
COMMENT ON COLUMN public.documents.request_id IS 'ID de la solicitud de préstamo asociada a este documento';

