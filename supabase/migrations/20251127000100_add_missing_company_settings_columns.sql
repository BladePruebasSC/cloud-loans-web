-- Ensure company_settings has all financial configuration fields
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_late_fee_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS default_grace_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS default_pawn_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS min_term_months INTEGER,
  ADD COLUMN IF NOT EXISTS max_term_months INTEGER,
  ADD COLUMN IF NOT EXISTS min_loan_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS max_loan_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS interest_rate_default NUMERIC,
  ADD COLUMN IF NOT EXISTS late_fee_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER;

COMMENT ON COLUMN public.company_settings.default_late_fee_rate IS 'Porcentaje mensual de mora por defecto para nuevos préstamos';
COMMENT ON COLUMN public.company_settings.default_grace_period_days IS 'Días de gracia por defecto antes de aplicar mora';
COMMENT ON COLUMN public.company_settings.default_pawn_period_days IS 'Duración por defecto (días) para operaciones de compra-venta/empeño';
COMMENT ON COLUMN public.company_settings.min_term_months IS 'Plazo mínimo permitido para los préstamos (en meses)';
COMMENT ON COLUMN public.company_settings.max_term_months IS 'Plazo máximo permitido para los préstamos (en meses)';
COMMENT ON COLUMN public.company_settings.min_loan_amount IS 'Monto mínimo permitido para los préstamos';
COMMENT ON COLUMN public.company_settings.max_loan_amount IS 'Monto máximo permitido para los préstamos';
COMMENT ON COLUMN public.company_settings.interest_rate_default IS 'Tasa de interés por defecto para nuevos préstamos';
COMMENT ON COLUMN public.company_settings.late_fee_percentage IS 'Porcentaje de mora por atraso';
COMMENT ON COLUMN public.company_settings.grace_period_days IS 'Días de gracia aplicables a la mora por atraso';

