/*
  # Agregar campo is_settled a installments

  1. Nuevo campo
    - is_settled: BOOLEAN - Indica si la cuota fue saldada (pero no pagada individualmente)
    - Permite distinguir entre cuotas realmente pagadas (is_paid: true) y cuotas saldadas (is_settled: true, is_paid: false)

  2. Casos de uso
    - is_paid: true, is_settled: false -> Cuota realmente pagada
    - is_paid: false, is_settled: true -> Cuota saldada (préstamo saldado pero cuota no pagada individualmente)
    - is_paid: false, is_settled: false -> Cuota pendiente
*/

-- Agregar campo is_settled a la tabla installments
ALTER TABLE public.installments 
ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT false NOT NULL;

-- Crear índice para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_installments_is_settled ON public.installments(is_settled);

-- Comentario para documentar el campo
COMMENT ON COLUMN public.installments.is_settled IS 'Indica si la cuota fue saldada (préstamo saldado pero cuota no pagada individualmente). Diferente de is_paid que indica pago real.';

