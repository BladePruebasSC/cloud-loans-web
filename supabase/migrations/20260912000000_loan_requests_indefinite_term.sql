-- ============================================================================
-- Solicitudes: un préstamo INDEFINIDO no tiene plazo, y faltaba la amortización francesa
-- ============================================================================
-- FALLO REPORTADO (2026-09-12): al crear una solicitud la base responde 400.
--
-- CAUSA 1: `check_term_months` (20250127120000) exige `term_months > 0`. En una solicitud con
-- amortización INDEFINIDA el plazo es 0 —no existe plazo: se cobra interés hasta saldar el
-- capital—, así que el insert se rechazaba. Ahora se admite NULL, y el 0 solo en indefinidos.
--
-- CAUSA 2 (venía de antes): `check_amortization_type` solo permitía
-- ('simple', 'german', 'american', 'indefinite'). El formulario ofrece también FRANCÉS, así que
-- cualquier solicitud con amortización francesa fallaba igual. Se añade a la lista.
--
-- Las dos restricciones quedan MÁS PERMISIVAS que antes, así que ninguna fila existente puede
-- quedar fuera al recrearlas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. El plazo: 0 solo tiene sentido en un indefinido
-- ----------------------------------------------------------------------------
ALTER TABLE public.loan_requests DROP CONSTRAINT IF EXISTS check_term_months;

ALTER TABLE public.loan_requests
ADD CONSTRAINT check_term_months CHECK (
  term_months IS NULL
  OR term_months > 0
  OR lower(COALESCE(amortization_type, '')) = 'indefinite'
);

COMMENT ON COLUMN public.loan_requests.term_months IS
  'Plazo en períodos de la frecuencia de pago. 0 o NULL en préstamos indefinidos, que no tienen plazo.';


-- ----------------------------------------------------------------------------
-- 2. Tipos de amortización: faltaba 'french'
-- ----------------------------------------------------------------------------
ALTER TABLE public.loan_requests DROP CONSTRAINT IF EXISTS check_amortization_type;

ALTER TABLE public.loan_requests
ADD CONSTRAINT check_amortization_type CHECK (
  amortization_type IS NULL
  OR lower(amortization_type) IN ('simple', 'french', 'german', 'american', 'indefinite')
);

COMMENT ON COLUMN public.loan_requests.amortization_type IS
  'Método de amortización: simple, french, german, american o indefinite.';


-- ============================================================================
-- Comprobación: solicitudes indefinidas y su plazo
-- ============================================================================
SELECT id, amortization_type, term_months, requested_amount, status, created_at
  FROM public.loan_requests
 WHERE lower(COALESCE(amortization_type, '')) = 'indefinite'
 ORDER BY created_at DESC
 LIMIT 20;
