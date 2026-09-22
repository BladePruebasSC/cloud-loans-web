-- ============================================================================
-- DESCUENTO en un pago
-- ============================================================================
-- CAMBIO SOLICITADO (2026-09-22): "necesito que los formularios de pago, tanto normal como
-- avanzado, tengan un apartado de descuento, por porcentaje o monto, y que esto se refleje en la
-- factura, en el historial y datos".
--
-- CÓMO SE GUARDA:
--   · `amount` sigue siendo lo que se ACREDITA a la cuota (el monto completo), así que la cuota
--     queda saldada y el balance, la mora y "Total pagado" siguen cuadrando;
--   · `discount_amount` es lo perdonado y `discount_percentage` el porcentaje aplicado;
--   · el EFECTIVO recibido es `amount + late_fee - discount_amount`: es lo que sale en el recibo
--     y lo que cuenta como cobrado.
--
-- Sin esta migración la aplicación sigue cobrando, pero guarda los pagos SIN descuento y lo avisa
-- en la consola.
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS discount_reason TEXT;

COMMENT ON COLUMN public.payments.discount_amount IS
  'Monto perdonado en este pago. El efectivo recibido es amount + late_fee - discount_amount.';
COMMENT ON COLUMN public.payments.discount_percentage IS
  'Porcentaje de descuento aplicado sobre el monto del pago (NULL si se escribió un monto fijo).';
COMMENT ON COLUMN public.payments.discount_reason IS
  'Motivo del descuento, tal como se escribió al cobrar.';

-- El descuento nunca puede ser negativo ni pasar del monto acreditado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_discount_valid'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_discount_valid
      CHECK (discount_amount >= 0 AND discount_amount <= COALESCE(amount, 0) + 0.01);
  END IF;
END $$;

-- Los pagos anteriores no tenían descuento.
UPDATE public.payments SET discount_amount = 0 WHERE discount_amount IS NULL;

-- Localizar rápido los pagos con descuento (informes)
CREATE INDEX IF NOT EXISTS idx_payments_with_discount
  ON public.payments (loan_id)
  WHERE discount_amount > 0;
