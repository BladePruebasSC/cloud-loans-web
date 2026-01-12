-- Add default capital payment penalty percentage to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_capital_payment_penalty_percentage NUMERIC DEFAULT 0;

-- Set default value for existing rows
UPDATE public.company_settings
SET default_capital_payment_penalty_percentage = COALESCE(default_capital_payment_penalty_percentage, 0);

-- Comment for documentation
COMMENT ON COLUMN public.company_settings.default_capital_payment_penalty_percentage IS 'Porcentaje de penalización por defecto para abonos a capital';
