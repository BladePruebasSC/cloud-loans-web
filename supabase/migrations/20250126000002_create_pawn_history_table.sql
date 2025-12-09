-- Crear tabla pawn_history para el historial de cambios en transacciones de compra venta
CREATE TABLE IF NOT EXISTS public.pawn_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pawn_transaction_id UUID NOT NULL REFERENCES public.pawn_transactions(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('payment', 'partial_payment', 'interest_adjustment', 'term_extension', 'balance_adjustment', 'rate_change', 'status_change', 'add_charge', 'remove_late_fee')),
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    amount DECIMAL(10,2),
    charge_date DATE,
    reference_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_pawn_history_pawn_transaction_id ON public.pawn_history(pawn_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pawn_history_created_at ON public.pawn_history(created_at);
CREATE INDEX IF NOT EXISTS idx_pawn_history_change_type ON public.pawn_history(change_type);

-- Habilitar RLS
ALTER TABLE public.pawn_history ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert pawn history for their company transactions" ON public.pawn_history;
DROP POLICY IF EXISTS "Users can view pawn history for their company transactions" ON public.pawn_history;
DROP POLICY IF EXISTS "Users can update pawn history for their company transactions" ON public.pawn_history;
DROP POLICY IF EXISTS "Users can delete pawn history for their company transactions" ON public.pawn_history;

-- Create new policies using get_user_company_id() function
CREATE POLICY "Users can insert pawn history for their company transactions" 
ON public.pawn_history 
FOR INSERT 
WITH CHECK (
  pawn_transaction_id IN (
    SELECT pt.id 
    FROM pawn_transactions pt
    JOIN clients c ON pt.client_id = c.id
    WHERE pt.user_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can view pawn history for their company transactions" 
ON public.pawn_history 
FOR SELECT 
USING (
  pawn_transaction_id IN (
    SELECT pt.id 
    FROM pawn_transactions pt
    JOIN clients c ON pt.client_id = c.id
    WHERE pt.user_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can update pawn history for their company transactions" 
ON public.pawn_history 
FOR UPDATE 
USING (
  pawn_transaction_id IN (
    SELECT pt.id 
    FROM pawn_transactions pt
    JOIN clients c ON pt.client_id = c.id
    WHERE pt.user_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can delete pawn history for their company transactions" 
ON public.pawn_history 
FOR DELETE 
USING (
  pawn_transaction_id IN (
    SELECT pt.id 
    FROM pawn_transactions pt
    JOIN clients c ON pt.client_id = c.id
    WHERE pt.user_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

