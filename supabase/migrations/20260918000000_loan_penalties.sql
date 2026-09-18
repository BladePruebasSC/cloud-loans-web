-- ============================================================================
-- PENALIDADES de un préstamo: registro propio, con monto, para poder sumarlas
-- ============================================================================
-- CAMBIO SOLICITADO (2026-09-18): "En dashboard, en datos y detalles debes agregar un dato:
-- Penalidad, es el monto que se agrega haciendo un abono a capital u otras actualizaciones y
-- debe tener un apartado en el préstamo que lo muestre y vaya sumando en caso de ser varias
-- veces."
--
-- HASTA AHORA la penalidad no se guardaba como número en ningún sitio: el abono a capital la
-- escribía solo en el TEXTO del historial ("Penalidad (2%): RD$3,000.00") y en el recibo. No
-- había forma de sumarla ni de mostrarla.
--
-- Cada penalidad es una fila:
--   · source = 'capital_payment' → la penalidad de un abono a capital (se cobra junto al abono);
--   · source = 'charge'          → un cargo agregado con el motivo "Cargo por Penalización";
--   · source = 'other'           → reservado para futuras actualizaciones.
--
-- Al final se RECUPERAN las penalidades ya aplicadas leyendo el historial, así que los
-- préstamos existentes también muestran las suyas. Es IDEMPOTENTE: ejecutarla dos veces no
-- duplica nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loan_penalties (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id            UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount             NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  -- Porcentaje aplicado y sobre qué monto (el capital pendiente antes del abono)
  percentage         NUMERIC(9, 4),
  base_amount        NUMERIC(14, 2),
  source             TEXT NOT NULL DEFAULT 'capital_payment'
                     CHECK (source IN ('capital_payment', 'charge', 'other')),
  -- Si se elimina el abono, su penalidad se va con él
  capital_payment_id UUID REFERENCES public.capital_payments(id) ON DELETE CASCADE,
  -- El cargo que la cobra (cargos por penalización)
  installment_id     UUID REFERENCES public.installments(id) ON DELETE SET NULL,
  -- La entrada del historial de la que sale (evita duplicarla al recuperar)
  loan_history_id    UUID REFERENCES public.loan_history(id) ON DELETE SET NULL,
  description        TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loan_penalties IS
  'Penalidades aplicadas a un préstamo (abono a capital con penalidad, cargo por penalización). Se suman para mostrar la penalidad acumulada.';

CREATE INDEX IF NOT EXISTS idx_loan_penalties_loan ON public.loan_penalties (loan_id, created_at);
-- Una sola penalidad por abono, por cargo y por entrada del historial
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_penalties_capital_payment
  ON public.loan_penalties (capital_payment_id) WHERE capital_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_penalties_installment
  ON public.loan_penalties (installment_id) WHERE installment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_penalties_history
  ON public.loan_penalties (loan_history_id) WHERE loan_history_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS: la empresa dueña del préstamo (dueño o empleado)
-- ----------------------------------------------------------------------------
ALTER TABLE public.loan_penalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loan_penalties_select_company" ON public.loan_penalties;
DROP POLICY IF EXISTS "loan_penalties_insert_company" ON public.loan_penalties;
DROP POLICY IF EXISTS "loan_penalties_update_company" ON public.loan_penalties;
DROP POLICY IF EXISTS "loan_penalties_delete_company" ON public.loan_penalties;

CREATE POLICY "loan_penalties_select_company" ON public.loan_penalties
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loans l
     WHERE l.id = loan_penalties.loan_id
       AND l.loan_officer_id IN (auth.uid(), get_user_company_id())
  ));

CREATE POLICY "loan_penalties_insert_company" ON public.loan_penalties
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loans l
     WHERE l.id = loan_penalties.loan_id
       AND l.loan_officer_id IN (auth.uid(), get_user_company_id())
  ));

CREATE POLICY "loan_penalties_update_company" ON public.loan_penalties
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loans l
     WHERE l.id = loan_penalties.loan_id
       AND l.loan_officer_id IN (auth.uid(), get_user_company_id())
  ));

CREATE POLICY "loan_penalties_delete_company" ON public.loan_penalties
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loans l
     WHERE l.id = loan_penalties.loan_id
       AND l.loan_officer_id IN (auth.uid(), get_user_company_id())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_penalties TO authenticated;


-- ----------------------------------------------------------------------------
-- Recuperar las penalidades ya aplicadas, desde el historial
-- ----------------------------------------------------------------------------
-- Montos en formato es-DO: "3,000.00" → se quitan las comas de miles. El patrón no se traga el
-- punto final de la frase ("RD$3,000.00. Motivo…").

-- 1) Abonos a capital: "Abono a capital: RD$50,000.00. Penalidad (2%): RD$3,000.00. …"
--    Se enlaza con el abono del mismo préstamo registrado más cerca en el tiempo (±10 min). Si
--    dos entradas apuntaran al mismo abono, solo la primera se enlaza (índice único).
WITH candidatas AS (
  SELECT h.id AS history_id, h.loan_id, h.created_by, h.created_at,
         REPLACE(m[2], ',', '')::NUMERIC AS monto,
         m[1] AS porcentaje,
         cp.id AS capital_payment_id, cp.capital_before
    FROM public.loan_history h
    CROSS JOIN LATERAL regexp_match(
           h.description,
           'Penalidad \(([0-9]+(?:\.[0-9]+)?)%\): RD\$([0-9][0-9,]*(?:\.[0-9]+)?)'
         ) AS m
    LEFT JOIN LATERAL (
           SELECT c.id, c.capital_before
             FROM public.capital_payments c
            WHERE c.loan_id = h.loan_id
              AND ABS(EXTRACT(EPOCH FROM (c.created_at - h.created_at))) < 600
              AND NOT EXISTS (SELECT 1 FROM public.loan_penalties p WHERE p.capital_payment_id = c.id)
            ORDER BY ABS(EXTRACT(EPOCH FROM (c.created_at - h.created_at)))
            LIMIT 1
         ) cp ON true
   WHERE h.description ILIKE '%Penalidad (%'
     AND NOT EXISTS (SELECT 1 FROM public.loan_penalties p WHERE p.loan_history_id = h.id)
),
ordenadas AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.capital_payment_id ORDER BY c.created_at) AS n
    FROM candidatas c
)
INSERT INTO public.loan_penalties
  (loan_id, amount, percentage, base_amount, source, capital_payment_id, loan_history_id,
   description, created_by, created_at)
SELECT o.loan_id,
       o.monto,
       o.porcentaje::NUMERIC,
       o.capital_before,
       'capital_payment',
       CASE WHEN o.capital_payment_id IS NOT NULL AND o.n = 1 THEN o.capital_payment_id END,
       o.history_id,
       'Penalidad del abono a capital (' || o.porcentaje || '%)',
       o.created_by,
       o.created_at
  FROM ordenadas o
 WHERE o.monto > 0
   -- La aplicación ya la registró (con el mismo monto y a la misma hora): no duplicarla
   AND NOT EXISTS (
         SELECT 1 FROM public.loan_penalties p
          WHERE p.loan_id = o.loan_id
            AND p.source = 'capital_payment'
            AND ABS(p.amount - o.monto) < 0.01
            AND ABS(EXTRACT(EPOCH FROM (p.created_at - o.created_at))) < 600
       );

-- 2) Cargos por penalización: "Agregar Cargo: penalty_fee. Monto: RD$1,500.00"
INSERT INTO public.loan_penalties
  (loan_id, amount, source, loan_history_id, description, created_by, created_at)
SELECT h.loan_id,
       REPLACE(m[1], ',', '')::NUMERIC,
       'charge',
       h.id,
       'Cargo por Penalización',
       h.created_by,
       h.created_at
  FROM public.loan_history h
  CROSS JOIN LATERAL regexp_match(h.description, 'Monto: RD\$([0-9][0-9,]*(?:\.[0-9]+)?)') AS m
 -- La descripción usa el título en español o el identificador interno, según la época
 WHERE h.description ~* '^(Agregar Cargo|add_charge)\s*:\s*penalty_fee'
   AND REPLACE(m[1], ',', '')::NUMERIC > 0
   AND NOT EXISTS (SELECT 1 FROM public.loan_penalties p WHERE p.loan_history_id = h.id)
   -- La aplicación ya la registró (con el mismo monto y a la misma hora): no duplicarla
   AND NOT EXISTS (
         SELECT 1 FROM public.loan_penalties p
          WHERE p.loan_id = h.loan_id
            AND p.source = 'charge'
            AND ABS(p.amount - REPLACE(m[1], ',', '')::NUMERIC) < 0.01
            AND ABS(EXTRACT(EPOCH FROM (p.created_at - h.created_at))) < 600
       );

-- Resumen de lo recuperado (informativo)
SELECT source AS origen, COUNT(*) AS penalidades, SUM(amount) AS total
  FROM public.loan_penalties
 GROUP BY source;
