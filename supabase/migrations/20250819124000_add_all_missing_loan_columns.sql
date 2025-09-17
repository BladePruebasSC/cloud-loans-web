    -- Agregar todas las columnas faltantes en la tabla loans
-- Columnas básicas del préstamo
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS term_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loan_type TEXT DEFAULT 'personal';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS collateral TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loan_officer_id UUID REFERENCES auth.users(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS next_payment_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS notes TEXT;

-- Columnas del garante
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_name TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_phone TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_dni TEXT;

-- Columnas de información adicional
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
