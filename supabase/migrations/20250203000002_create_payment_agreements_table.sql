-- Asegurar que las columnas necesarias existen si la tabla ya existe
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_agreements') THEN
    -- Agregar client_id si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_agreements' AND column_name = 'client_id') THEN
      ALTER TABLE public.payment_agreements ADD COLUMN client_id UUID REFERENCES public.clients(id) NOT NULL;
    END IF;
    -- Agregar approved_at si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_agreements' AND column_name = 'approved_at') THEN
      ALTER TABLE public.payment_agreements ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
    END IF;
    -- Agregar approved_by si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_agreements' AND column_name = 'approved_by') THEN
      ALTER TABLE public.payment_agreements ADD COLUMN approved_by UUID REFERENCES auth.users(id);
    END IF;
    -- Agregar updated_at si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_agreements' AND column_name = 'updated_at') THEN
      ALTER TABLE public.payment_agreements ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
  END IF;
END $$;

-- Crear tabla de acuerdos de pago
CREATE TABLE IF NOT EXISTS public.payment_agreements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  agreed_amount DECIMAL(10,2) NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL,
  payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'rejected', 'completed', 'cancelled')),
  reason TEXT,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_payment_agreements_loan_id ON public.payment_agreements(loan_id);
CREATE INDEX IF NOT EXISTS idx_payment_agreements_status ON public.payment_agreements(status);
CREATE INDEX IF NOT EXISTS idx_payment_agreements_user_id ON public.payment_agreements(user_id);

-- Habilitar RLS
ALTER TABLE public.payment_agreements ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (usar DROP IF EXISTS para evitar errores si ya existen)
DROP POLICY IF EXISTS "Users can view payment agreements from their company" ON public.payment_agreements;
DROP POLICY IF EXISTS "Users can create payment agreements for their loans" ON public.payment_agreements;
DROP POLICY IF EXISTS "Users can update payment agreements from their company" ON public.payment_agreements;
DROP POLICY IF EXISTS "Users can delete payment agreements from their company" ON public.payment_agreements;

CREATE POLICY "Users can view payment agreements from their company"
  ON public.payment_agreements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = payment_agreements.loan_id
      AND (
        loans.loan_officer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients
          WHERE clients.id = loans.client_id
          AND clients.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create payment agreements for their loans"
  ON public.payment_agreements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = payment_agreements.loan_id
      AND (
        loans.loan_officer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients
          WHERE clients.id = loans.client_id
          AND clients.user_id = auth.uid()
        )
      )
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update payment agreements from their company"
  ON public.payment_agreements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = payment_agreements.loan_id
      AND (
        loans.loan_officer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients
          WHERE clients.id = loans.client_id
          AND clients.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete payment agreements from their company"
  ON public.payment_agreements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = payment_agreements.loan_id
      AND (
        loans.loan_officer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients
          WHERE clients.id = loans.client_id
          AND clients.user_id = auth.uid()
        )
      )
    )
  );

-- Comentarios
COMMENT ON TABLE public.payment_agreements IS 'Acuerdos de pago para préstamos';
COMMENT ON COLUMN public.payment_agreements.agreed_amount IS 'Monto acordado de pago';
COMMENT ON COLUMN public.payment_agreements.original_amount IS 'Monto original de la cuota';
COMMENT ON COLUMN public.payment_agreements.payment_frequency IS 'Frecuencia de pago: daily, weekly, biweekly, monthly';
COMMENT ON COLUMN public.payment_agreements.status IS 'Estado del acuerdo: pending, approved, active, rejected, completed, cancelled';

