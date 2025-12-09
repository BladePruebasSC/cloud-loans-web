-- Agregar campos faltantes a payment_agreements
ALTER TABLE public.payment_agreements 
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));

-- Comentarios para documentar
COMMENT ON COLUMN public.payment_agreements.reason IS 'Razón del acuerdo de pago';
COMMENT ON COLUMN public.payment_agreements.payment_frequency IS 'Frecuencia de pago acordada: daily, weekly, biweekly, monthly';

