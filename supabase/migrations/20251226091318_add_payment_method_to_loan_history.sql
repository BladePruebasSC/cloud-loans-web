-- Agregar campo payment_method a loan_history para registrar el método de pago
ALTER TABLE public.loan_history 
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card', 'online'));

-- Crear índice para mejorar búsquedas por método de pago
CREATE INDEX IF NOT EXISTS idx_loan_history_payment_method ON public.loan_history(payment_method) WHERE payment_method IS NOT NULL;

