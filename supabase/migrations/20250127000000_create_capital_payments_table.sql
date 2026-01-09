-- Crear tabla para registrar abonos a capital
CREATE TABLE IF NOT EXISTS public.capital_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  capital_before DECIMAL(10,2) NOT NULL,
  capital_after DECIMAL(10,2) NOT NULL,
  keep_installments BOOLEAN DEFAULT false,
  adjustment_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(id)
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_capital_payments_loan_id ON public.capital_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_capital_payments_created_at ON public.capital_payments(created_at);

-- Comentarios para documentar la tabla
COMMENT ON TABLE public.capital_payments IS 'Abonos extraordinarios al capital de préstamos';
COMMENT ON COLUMN public.capital_payments.amount IS 'Monto del abono a capital';
COMMENT ON COLUMN public.capital_payments.capital_before IS 'Capital pendiente antes del abono';
COMMENT ON COLUMN public.capital_payments.capital_after IS 'Capital pendiente después del abono';
COMMENT ON COLUMN public.capital_payments.keep_installments IS 'Si true, mantiene el número de cuotas y recalcula montos. Si false, mantiene montos y reduce cuotas';

-- Habilitar RLS
ALTER TABLE public.capital_payments ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios solo puedan ver sus propios abonos a capital
CREATE POLICY "Users can view capital payments for their company loans"
  ON public.capital_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = capital_payments.loan_id
      AND (loans.loan_officer_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- Política para que los usuarios puedan insertar abonos a capital
CREATE POLICY "Users can insert capital payments for their company loans"
  ON public.capital_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = capital_payments.loan_id
      AND (loans.loan_officer_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- Política para que los usuarios puedan actualizar sus propios abonos a capital (solo para correcciones)
CREATE POLICY "Users can update capital payments for their company loans"
  ON public.capital_payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = capital_payments.loan_id
      AND (loans.loan_officer_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

