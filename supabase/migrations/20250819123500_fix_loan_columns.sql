-- Asegurar que todas las columnas adicionales estén presentes en la tabla loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS excluded_days TEXT[] DEFAULT '{}';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS closing_costs DECIMAL(10,2) DEFAULT 0;
-- Crear tabla portfolios si no existe
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    company_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES public.portfolios(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS amortization_type TEXT DEFAULT 'simple' CHECK (amortization_type IN ('simple', 'german', 'american', 'indefinite'));
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS minimum_payment_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS minimum_payment_type TEXT DEFAULT 'interest' CHECK (minimum_payment_type IN ('interest', 'principal'));
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS minimum_payment_percentage DECIMAL(5,2) DEFAULT 100;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS add_expense_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS fixed_payment_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS fixed_payment_amount DECIMAL(10,2) DEFAULT 0;

-- Si existe la columna closing_costs_percentage, renombrarla a closing_costs
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'loans' 
               AND column_name = 'closing_costs_percentage' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.loans RENAME COLUMN closing_costs_percentage TO closing_costs;
    END IF;
END $$;
