-- Agregar campo para rastrear mora pagada por cuota
ALTER TABLE public.installments 
ADD COLUMN IF NOT EXISTS late_fee_paid numeric DEFAULT 0 NOT NULL;

-- Comentario explicativo
COMMENT ON COLUMN public.installments.late_fee_paid IS 'Monto de mora ya pagado para esta cuota específica';