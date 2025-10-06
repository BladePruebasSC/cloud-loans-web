-- Crear tabla para mantener las cuotas originales del préstamo
CREATE TABLE IF NOT EXISTS public.installments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_amount DECIMAL(10,2) NOT NULL,
  interest_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(loan_id, installment_number)
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON public.installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON public.installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_is_paid ON public.installments(is_paid);

-- Comentarios para documentar la tabla
COMMENT ON TABLE public.installments IS 'Cuotas originales de los préstamos que mantienen su numeración';
COMMENT ON COLUMN public.installments.installment_number IS 'Número de cuota (1, 2, 3, 4, etc.)';
COMMENT ON COLUMN public.installments.due_date IS 'Fecha de vencimiento original de la cuota';
COMMENT ON COLUMN public.installments.is_paid IS 'Si la cuota ha sido pagada completamente';
