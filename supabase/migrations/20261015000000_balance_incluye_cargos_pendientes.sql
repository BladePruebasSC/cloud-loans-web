-- ============================================================================
-- EL BALANCE GUARDADO TIENE QUE CONTAR LOS CARGOS (INCLUIDOS LOS GASTOS DE CIERRE)
-- ============================================================================
-- FALLO REPORTADO (2026-10-14): "hay un problema con el balance, cuando hacemos un [gasto de]
-- cierre y agregamos un cargo, en el balance no toma en cuenta este gasto de cierre".
--
-- CAUSA: al crear el préstamo, la aplicación guardaba `remaining_balance = total_amount`, y
-- `total_amount` es por convenio capital + interés SIN cargos. Los gastos de cierre NO
-- financiados se guardan como una cuota-cargo más (así se cobran y así generan mora), pero ese
-- importe no se sumaba al saldo guardado: el préstamo nacía con el balance corto.
--
-- Caso del usuario: préstamo con 30 cuotas de 900 (27,000 de capital + interés), 2,500 de gastos
-- de cierre y dos cargos añadidos después de 1,000 y 600. "Ver cuotas" sumaba 31,100 y el balance
-- guardado decía 28,600: faltaban justo los 2,500 del cierre.
--
-- La aplicación ya lo suma al crear/editar el préstamo (`generateOriginalInstallments` en
-- LoanForm.tsx). Esta migración REPARA los préstamos a los que ya les pasó.
--
-- CÓMO: se recalcula el saldo con `calculate_loan_remaining_balance`, la MISMA función que usan
-- los triggers de pagos y cuotas y que replica la ficha del préstamo:
--   plazo fijo   → (prestado − capital cobrado − abonos) + interés pendiente + cargos pendientes
--   indefinido   → (prestado − abonos) + interés pendiente + cargos pendientes − cobrado
-- No se inventa ninguna fórmula nueva: el saldo guardado pasa a decir lo que ya dicen la tarjeta,
-- Detalles y "Ver cuotas".
--
-- SOLO se tocan préstamos que:
--   · no están saldados, cancelados ni rechazados (ahí el saldo es 0 a propósito),
--   · no están borrados,
--   · tienen al menos un CARGO (una fila de `installments` sin interés cuyo capital es todo su
--     monto: el mismo criterio de toda la aplicación), que es donde está el descuadre,
--   · y cuyo saldo guardado difiere del calculado en más de un centavo.
-- ============================================================================

DO $$
DECLARE
  v_loan RECORD;
  v_antes NUMERIC;
  v_despues NUMERIC;
  v_corregidos INTEGER := 0;
BEGIN
  FOR v_loan IN
    SELECT l.id, l.remaining_balance
      FROM public.loans l
     WHERE l.deleted_at IS NULL
       AND lower(COALESCE(l.status, '')) NOT IN ('paid', 'cancelled', 'rejected')
       AND EXISTS (
         SELECT 1
           FROM public.installments i
          WHERE i.loan_id = l.id
            AND ABS(COALESCE(i.interest_amount, 0)) < 0.01
            AND COALESCE(i.total_amount, 0) >= 0.01
            AND (ABS(COALESCE(i.principal_amount, 0) - COALESCE(i.total_amount, 0)) < 0.01
                 OR COALESCE(i.principal_amount, 0) < 0.01)
       )
     ORDER BY l.created_at
  LOOP
    v_antes := COALESCE(v_loan.remaining_balance, 0);
    v_despues := calculate_loan_remaining_balance(v_loan.id);

    IF v_despues IS NOT NULL AND ABS(v_despues - v_antes) > 0.01 THEN
      UPDATE public.loans
         SET remaining_balance = v_despues
       WHERE id = v_loan.id;

      v_corregidos := v_corregidos + 1;
      RAISE NOTICE 'Préstamo %: balance % -> %', v_loan.id, v_antes, v_despues;
    END IF;
  END LOOP;

  RAISE NOTICE 'Préstamos con el balance recalculado (ahora cuenta los cargos): %', v_corregidos;
END $$;
