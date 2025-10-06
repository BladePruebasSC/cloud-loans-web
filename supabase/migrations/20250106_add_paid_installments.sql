-- Agregar campo para mantener las cuotas pagadas permanentemente
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS paid_installments INTEGER[] DEFAULT '{}';

-- Crear índice para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_loans_paid_installments ON public.loans USING GIN (paid_installments);

-- Comentario para documentar el campo
COMMENT ON COLUMN public.loans.paid_installments IS 'Array de números de cuotas que han sido pagadas completamente';
