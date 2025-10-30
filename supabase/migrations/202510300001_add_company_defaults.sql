-- Add default configuration fields to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_late_fee_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS default_grace_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS default_pawn_period_days INTEGER;

-- Set sensible defaults for existing rows (non-destructive)
UPDATE public.company_settings
SET default_late_fee_rate = COALESCE(default_late_fee_rate, 2.0),
    default_grace_period_days = COALESCE(default_grace_period_days, 3),
    default_pawn_period_days = COALESCE(default_pawn_period_days, 90);

-- Comments for documentation
COMMENT ON COLUMN public.company_settings.default_late_fee_rate IS 'Porcentaje mensual de mora por defecto para nuevos préstamos';
COMMENT ON COLUMN public.company_settings.default_grace_period_days IS 'Días de gracia por defecto antes de aplicar mora';
COMMENT ON COLUMN public.company_settings.default_pawn_period_days IS 'Duración por defecto (días) para operaciones de compra-venta/empeño';


