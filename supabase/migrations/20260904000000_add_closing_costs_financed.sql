-- ============================================================================
-- Gastos de cierre financiados
-- ============================================================================
-- Hasta ahora los gastos de cierre se cobraban SIEMPRE aparte: se guardaban como una
-- cuota-cargo al final del cronograma (interés 0, principal = total), sin formar parte del
-- capital ni devengar interés.
--
-- Ahora se puede elegir FINANCIARLOS. Con `closing_costs_financed = true`:
--   · `loans.amount` incluye los gastos de cierre (10,000 + 1,500 → 11,500),
--   · el interés y el reparto de las cuotas se calculan sobre ese total,
--   · NO se crea la cuota-cargo del final: se cobrarían dos veces.
--
-- `closing_costs` se sigue guardando en ambos casos, así que el importe desembolsado al
-- cliente se reconstruye siempre como `amount - closing_costs` cuando están financiados.
-- ============================================================================

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS closing_costs_financed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.loans.closing_costs_financed IS
  'true: los gastos de cierre están dentro de `amount` y devengan interés. false: se cobran aparte como cargo.';

-- Los préstamos existentes se crearon con el modelo antiguo (cargo aparte).
UPDATE public.loans SET closing_costs_financed = false WHERE closing_costs_financed IS NULL;
