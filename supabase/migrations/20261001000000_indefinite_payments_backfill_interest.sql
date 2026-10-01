-- ============================================================================
-- INDEFINIDOS: los pagos de cuota guardados SIN desglose se quedan con su interés
-- ============================================================================
-- FALLO REPORTADO (2026-10-01): "los préstamos indefinidos dan problemas cuando se elimina un
-- pago: los siguientes los 'procesa' pero los datos no se actualizan; el balance restante, el
-- total pagado, etc. no cambian".
--
-- POR QUÉ: un préstamo indefinido solo tiene UNA fila en `installments`; los demás períodos se
-- generan sobre la marcha. Hasta el 2026-09-16, un pago sobre un período generado se guardaba sin
-- desglose (`principal_amount = 0` e `interest_amount = 0`), con el importe solo en `amount`.
-- Todo lo que mide el interés cobrado con `SUM(interest_amount)` contaba esos pagos como 0: el
-- "Total pagado" e "Interés pagado" de Detalles, el `paid_installments` que se recalcula al borrar
-- un pago y el interés de los informes.
--
-- La aplicación ya los cuenta bien (un pago sin desglose de un indefinido es interés, ver
-- `loanPaidTotals.ts`), y `calculate_loan_remaining_balance` también. Esta migración arregla el
-- DATO, para que los informes y cualquier consulta directa a `payments` digan lo mismo.
--
-- NO TOCA los pagos de CARGOS: esos se guardan con `principal_amount = amount` (llevan capital),
-- así que no entran en el filtro. Tampoco los pagos de solo mora (su `amount` es 0).
-- Es idempotente: al volver a correrla no encuentra nada que cambiar.
-- ============================================================================

DO $$
DECLARE
    v_actualizados INTEGER := 0;
BEGIN
    UPDATE public.payments p
       SET interest_amount = ROUND(COALESCE(p.amount, 0)::NUMERIC, 2)
      FROM public.loans l
     WHERE p.loan_id = l.id
       AND lower(COALESCE(l.amortization_type, '')) = 'indefinite'
       AND COALESCE(p.amount, 0) > 0.005
       AND COALESCE(p.principal_amount, 0) < 0.005   -- sin capital: no es un pago de cargo
       AND COALESCE(p.interest_amount, 0) < 0.005;    -- y sin interés: se guardó sin desglose

    GET DIAGNOSTICS v_actualizados = ROW_COUNT;
    RAISE NOTICE 'Pagos de indefinidos con interés completado: %', v_actualizados;
END $$;
