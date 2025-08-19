-- Crear tabla loan_history para el historial de cambios en préstamos
CREATE TABLE IF NOT EXISTS public.loan_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('payment', 'partial_payment', 'interest_adjustment', 'term_extension', 'balance_adjustment', 'rate_change', 'status_change')),
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_loan_history_loan_id ON public.loan_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_history_created_at ON public.loan_history(created_at);
CREATE INDEX IF NOT EXISTS idx_loan_history_change_type ON public.loan_history(change_type);
