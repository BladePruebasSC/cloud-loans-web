-- Agregar campo charge_due_date a loan_history para guardar la fecha de vencimiento del cargo
ALTER TABLE public.loan_history 
  ADD COLUMN IF NOT EXISTS charge_due_date DATE;

-- Crear índice para mejorar búsquedas por fecha de vencimiento de cargo
CREATE INDEX IF NOT EXISTS idx_loan_history_charge_due_date ON public.loan_history(charge_due_date) WHERE charge_due_date IS NOT NULL;

