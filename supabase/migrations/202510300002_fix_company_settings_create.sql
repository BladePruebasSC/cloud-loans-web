-- Create company_settings table if it doesn't exist, then ensure needed columns exist

CREATE TABLE IF NOT EXISTS public.company_settings (
  user_id UUID NOT NULL UNIQUE,
  company_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  company_code TEXT,
  auto_sequential_codes BOOLEAN DEFAULT FALSE,
  default_late_fee_rate NUMERIC DEFAULT 2.0,
  default_grace_period_days INTEGER DEFAULT 3,
  default_pawn_period_days INTEGER DEFAULT 90,
  currency TEXT DEFAULT 'DOP',
  interest_rate_default NUMERIC DEFAULT 15.0,
  late_fee_percentage NUMERIC DEFAULT 5.0,
  grace_period_days INTEGER DEFAULT 3,
  min_loan_amount NUMERIC DEFAULT 1000,
  max_loan_amount NUMERIC DEFAULT 500000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist (for environments that already had the table)
ALTER TABLE IF EXISTS public.company_settings
  ADD COLUMN IF NOT EXISTS auto_sequential_codes BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_late_fee_rate NUMERIC DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS default_grace_period_days INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_pawn_period_days INTEGER DEFAULT 90;

-- Optional: comments
COMMENT ON TABLE public.company_settings IS 'Configuración por empresa';
COMMENT ON COLUMN public.company_settings.auto_sequential_codes IS 'Generar códigos secuenciales automáticamente en inventario';
COMMENT ON COLUMN public.company_settings.default_pawn_period_days IS 'Días por defecto para compra-venta (empeño)';


