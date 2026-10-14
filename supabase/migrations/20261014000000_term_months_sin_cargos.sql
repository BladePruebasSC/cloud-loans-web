-- ============================================================================
-- EL PLAZO DE UN PRÉSTAMO NO CUENTA LOS CARGOS
-- ============================================================================
-- FALLO REPORTADO (2026-10-14): "cuando se agrega un cargo a un préstamo... el monto se
-- desbalancea más de lo que debería, el cargo se triplica en detalles".
--
-- CAUSA: al agregar un cargo, la aplicación escribía `loans.term_months = número de la fila
-- nueva`. Como el cargo se guarda como una fila más de `installments` (con un número posterior
-- al de la última cuota), cada cargo sumaba UNA CUOTA al plazo del préstamo: uno de 30 cuotas
-- con dos cargos pasaba a decir "32 cuotas".
--
-- Y ese número no es decorativo:
--   · varios cálculos rehacen el total del préstamo como `monto × tasa × term_months`, así que
--     cada cargo inflaba el interés de TODO el préstamo;
--   · el estado de cuenta genera el cronograma con `term_months` cuotas: aparecían cuotas
--     fantasma que nadie había creado;
--   · "Cuotas pagadas 0 / 32" contaba los cargos como cuotas.
--
-- La aplicación ya no lo toca (LoanUpdateForm, caso `add_charge`). Esta migración REPARA los
-- préstamos a los que ya les pasó: el plazo vuelve a ser el número de cuotas REGULARES.
--
-- QUÉ ES UN CARGO: una fila sin interés cuyo capital es todo su monto (el mismo criterio que usa
-- toda la aplicación y las funciones `calculate_loan_*`).
--
-- SOLO se tocan préstamos que:
--   · no son indefinidos (ahí el plazo no se usa así),
--   · tienen al menos un cargo,
--   · y cuyo `term_months` es MAYOR que su número de cuotas regulares (es decir, el que infló
--     el plazo fue el cargo). Nunca se reduce un plazo que ya estaba por debajo.
-- ============================================================================

DO $$
DECLARE
  v_corregidos INTEGER := 0;
BEGIN
  WITH conteos AS (
    SELECT
      l.id,
      l.term_months,
      COUNT(*) FILTER (
        WHERE NOT (
          ABS(COALESCE(i.interest_amount, 0)) < 0.01
          AND COALESCE(i.total_amount, 0) >= 0.01
          AND ABS(COALESCE(i.principal_amount, 0) - COALESCE(i.total_amount, 0)) < 0.01
        )
      ) AS cuotas_regulares,
      COUNT(*) FILTER (
        WHERE ABS(COALESCE(i.interest_amount, 0)) < 0.01
          AND COALESCE(i.total_amount, 0) >= 0.01
          AND ABS(COALESCE(i.principal_amount, 0) - COALESCE(i.total_amount, 0)) < 0.01
      ) AS cargos
    FROM public.loans l
    JOIN public.installments i ON i.loan_id = l.id
    WHERE lower(COALESCE(l.amortization_type, '')) <> 'indefinite'
      AND l.deleted_at IS NULL
    GROUP BY l.id, l.term_months
  )
  UPDATE public.loans l
     SET term_months = c.cuotas_regulares
    FROM conteos c
   WHERE l.id = c.id
     AND c.cargos > 0
     AND c.cuotas_regulares > 0
     AND COALESCE(l.term_months, 0) > c.cuotas_regulares;

  GET DIAGNOSTICS v_corregidos = ROW_COUNT;
  RAISE NOTICE 'Préstamos con el plazo corregido (ya no cuenta los cargos): %', v_corregidos;
END $$;
