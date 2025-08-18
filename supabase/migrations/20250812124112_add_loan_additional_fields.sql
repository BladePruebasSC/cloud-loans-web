-- Agregar campos adicionales a la tabla loans para información adicional
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS excluded_days TEXT[] DEFAULT '{}';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS closing_costs_percentage DECIMAL(5,2) DEFAULT 0;
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
