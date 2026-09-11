-- ============================================================================
-- Saldo de los préstamos a PLAZO FIJO con abono a capital (el abono se restaba dos veces)
-- ============================================================================
-- FALLO REPORTADO (2026-09-11): "ahora no me deja eliminar los últimos pagos".
--
-- CAUSA: la rama de plazo fijo de `calculate_loan_remaining_balance` (20260905000000, repetida
-- tal cual en 20260911000000) calculaba `total_amount + cargos − pagos − abonos a capital`. Pero
-- el abono a capital de un plazo fijo REESCRIBE `total_amount` con las cuotas ya recalculadas, que
-- ya no incluyen el capital abonado. Restar los abonos otra vez descontaba el abono DOS VECES: el
-- saldo llegaba a 0 con cuotas por cobrar, el pago avanzado marcaba el préstamo como "pagado" y,
-- con el préstamo "pagado", la aplicación ya no dejaba eliminar sus pagos.
--
-- AHORA el saldo de plazo fijo se calcula igual que la ficha del préstamo
-- (`computeLoanBalanceBreakdown` en src/utils/loanBalanceBreakdown.ts), sin depender de
-- `total_amount`:
--   capital pendiente = monto prestado − capital cobrado en las cuotas − abonos a capital
--   interés pendiente = interés de cada cuota − lo cobrado de esa cuota (el interés va primero)
--   cargos pendientes = cargos − lo cobrado a cargos
-- Lo cobrado se asigna por `due_date`, y lo que se llevaron los cargos de una fecha no cuenta
-- para la cuota regular de esa fecha.
--
-- La rama de INDEFINIDOS es la de 20260911000000, sin cambios.
--
-- Al final se REABREN los préstamos a plazo fijo que quedaron "pagados" por este fallo: los que
-- tienen abonos a capital, siguen debiendo según el cálculo corregido, tienen cuotas sin pagar y
-- NO se saldaron con "Saldar Préstamo" (ese flujo los deja pagados a propósito, aunque se
-- negocie un monto menor).
-- ============================================================================

DROP FUNCTION IF EXISTS calculate_loan_remaining_balance(UUID);

CREATE OR REPLACE FUNCTION calculate_loan_remaining_balance(p_loan_id UUID)
RETURNS DECIMAL(14,2) AS $$
DECLARE
    v_loan RECORD;
    v_correct_total_amount DECIMAL(14,2);
    v_total_interest DECIMAL(14,2);
    v_total_charges_amount DECIMAL(14,2) := 0;
    v_total_paid DECIMAL(14,2) := 0;
    v_total_capital_payments DECIMAL(14,2) := 0;
    v_remaining_balance DECIMAL(14,2);
    -- plazo fijo
    v_regular_count INTEGER := 0;
    v_capital_paid_regular NUMERIC := 0;
    v_interest_pending NUMERIC := 0;
    v_pending_charges NUMERIC := 0;
    -- indefinidos
    v_last_capital_after DECIMAL(14,2);
    v_capital_now DECIMAL(14,2);
    v_period_rate NUMERIC;
    v_ratio NUMERIC;
    v_interest_per_period DECIMAL(14,2);
    v_cutoffs DATE[];
    v_before_interest NUMERIC[];
    v_first_due DATE;
    v_periods_elapsed INTEGER;
    v_paid_interest NUMERIC := 0;
    v_remaining_credit NUMERIC;
    v_pending_interest NUMERIC := 0;
    v_due DATE;
    v_expected NUMERIC;
    v_n INTEGER;
    i INTEGER;
BEGIN
    SELECT id, amount, interest_rate, term_months, total_amount,
           amortization_type, start_date, payment_frequency, monthly_payment
    INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Abonos a capital (tabla propia). Bloque tolerante por si la tabla no existiera.
    BEGIN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_total_capital_payments
          FROM public.capital_payments
         WHERE loan_id = p_loan_id;
    EXCEPTION WHEN undefined_table THEN
        v_total_capital_payments := 0;
    END;

    IF lower(COALESCE(v_loan.amortization_type, '')) = 'indefinite' THEN
        -- ====================================================================
        -- Indefinido (idéntico a 20260911000000)
        -- ====================================================================
        v_capital_now := GREATEST(0, v_loan.amount - v_total_capital_payments);
        IF v_total_capital_payments > 0.005 THEN
            BEGIN
                SELECT capital_after
                  INTO v_last_capital_after
                  FROM public.capital_payments
                 WHERE loan_id = p_loan_id AND amount > 0.005
                 ORDER BY created_at DESC
                 LIMIT 1;
            EXCEPTION WHEN undefined_table THEN
                v_last_capital_after := NULL;
            END;
            IF v_last_capital_after IS NOT NULL AND ABS(v_loan.amount - v_last_capital_after) < 0.01 THEN
                v_capital_now := v_loan.amount;
            END IF;
        END IF;

        v_period_rate := (COALESCE(v_loan.interest_rate, 0) / 100.0)
                         * loan_frequency_rate_factor(v_loan.payment_frequency);
        IF COALESCE(v_loan.monthly_payment, 0) > 0.01 THEN
            v_interest_per_period := v_loan.monthly_payment;
            v_ratio := CASE WHEN v_capital_now > 0.005
                            THEN v_loan.monthly_payment / v_capital_now
                            ELSE v_period_rate END;
        ELSE
            v_interest_per_period := ROUND(v_capital_now * v_period_rate, 2);
            v_ratio := v_period_rate;
        END IF;

        IF v_total_capital_payments > 0.005 THEN
            SELECT ARRAY_AGG(
                       loan_add_periods((created_at AT TIME ZONE 'America/Santo_Domingo')::DATE, 1, v_loan.payment_frequency)
                       ORDER BY created_at),
                   ARRAY_AGG(ROUND(capital_before * v_ratio, 2) ORDER BY created_at)
              INTO v_cutoffs, v_before_interest
              FROM public.capital_payments
             WHERE loan_id = p_loan_id
               AND amount > 0.005
               AND capital_before > 0.005;
        END IF;

        v_first_due := loan_add_periods(v_loan.start_date::DATE, 1, v_loan.payment_frequency);
        v_periods_elapsed := loan_count_elapsed_periods(v_first_due, CURRENT_DATE, v_loan.payment_frequency);

        SELECT COALESCE(SUM(
                   CASE
                       WHEN COALESCE(interest_amount, 0) > 0.01 THEN interest_amount
                       WHEN COALESCE(principal_amount, 0) < 0.01 THEN COALESCE(amount, 0)
                       ELSE 0
                   END), 0)
          INTO v_paid_interest
          FROM public.payments
         WHERE loan_id = p_loan_id
           AND superseded_at IS NULL;

        v_remaining_credit := v_paid_interest;
        v_pending_interest := 0;
        v_n := 0;
        IF v_interest_per_period > 0.005 OR v_cutoffs IS NOT NULL THEN
            LOOP
                v_due := loan_add_periods(v_first_due, v_n, v_loan.payment_frequency);
                v_expected := v_interest_per_period;
                IF v_cutoffs IS NOT NULL THEN
                    FOR i IN 1..array_length(v_cutoffs, 1) LOOP
                        IF v_due <= v_cutoffs[i] THEN
                            v_expected := v_before_interest[i];
                            EXIT;
                        END IF;
                    END LOOP;
                END IF;

                IF v_remaining_credit + 0.005 >= v_expected THEN
                    v_remaining_credit := v_remaining_credit - v_expected;
                ELSE
                    v_pending_interest := v_pending_interest + (v_expected - v_remaining_credit);
                    v_remaining_credit := 0;
                END IF;

                v_n := v_n + 1;
                EXIT WHEN v_n > v_periods_elapsed AND v_pending_interest > 0.005;
                EXIT WHEN v_n > v_periods_elapsed AND v_expected <= 0.005;
                EXIT WHEN v_n > 100000; -- tope de seguridad
            END LOOP;
        END IF;

        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_total_charges_amount
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND ABS(interest_amount) < 0.01
          AND ABS(principal_amount - COALESCE(total_amount, 0)) < 0.01
          AND COALESCE(total_amount, 0) > 0;

        SELECT COALESCE(SUM(principal_amount), 0)
        INTO v_total_paid
        FROM public.payments
        WHERE loan_id = p_loan_id
          AND principal_amount > 0
          AND superseded_at IS NULL;

        v_remaining_balance := GREATEST(
            0,
            ROUND(v_capital_now + v_pending_interest + v_total_charges_amount - v_total_paid, 2)
        );
        RETURN v_remaining_balance;
    END IF;

    -- ========================================================================
    -- Plazo fijo: igual que la ficha del préstamo
    -- ========================================================================
    SELECT COUNT(*)
      INTO v_regular_count
      FROM public.installments
     WHERE loan_id = p_loan_id
       AND NOT (ABS(COALESCE(interest_amount, 0)) < 0.01
                AND COALESCE(total_amount, 0) >= 0.01
                AND (ABS(COALESCE(principal_amount, 0) - COALESCE(total_amount, 0)) < 0.01
                     OR COALESCE(principal_amount, 0) < 0.01));

    IF v_regular_count > 0 THEN
        WITH pay AS (
            -- Lo cobrado por fecha de vencimiento, y lo cobrado SIN interés (lo que pueden ser
            -- abonos a cargos). Los pagos anulados por una extensión de plazo no cuentan.
            SELECT due_date::DATE AS due,
                   SUM(COALESCE(amount, 0)) AS pagado,
                   SUM(CASE WHEN ABS(COALESCE(interest_amount, 0)) < 0.01 AND COALESCE(amount, 0) > 0.01
                            THEN amount ELSE 0 END) AS pagado_sin_interes
              FROM public.payments
             WHERE loan_id = p_loan_id
               AND superseded_at IS NULL
               AND due_date IS NOT NULL
             GROUP BY due_date::DATE
        ),
        inst AS (
            SELECT due_date::DATE AS due,
                   COALESCE(principal_amount, 0) AS capital,
                   COALESCE(interest_amount, 0) AS interes,
                   COALESCE(total_amount, 0) AS total,
                   (ABS(COALESCE(interest_amount, 0)) < 0.01
                    AND COALESCE(total_amount, 0) >= 0.01
                    AND (ABS(COALESCE(principal_amount, 0) - COALESCE(total_amount, 0)) < 0.01
                         OR COALESCE(principal_amount, 0) < 0.01)) AS es_cargo
              FROM public.installments
             WHERE loan_id = p_loan_id
        ),
        cargos AS (
            -- Lo que se llevaron los cargos de cada fecha: hasta cubrirlos, nunca más.
            SELECT i.due,
                   SUM(i.total) AS total_cargos,
                   LEAST(COALESCE(MAX(p.pagado_sin_interes), 0), SUM(i.total)) AS aplicado
              FROM inst i
              LEFT JOIN pay p ON p.due = i.due
             WHERE i.es_cargo
             GROUP BY i.due
        ),
        regulares AS (
            SELECT i.capital,
                   i.interes,
                   GREATEST(0, COALESCE(p.pagado, 0) - COALESCE(c.aplicado, 0)) AS pagado_cuota
              FROM inst i
              LEFT JOIN pay p ON p.due = i.due
              LEFT JOIN cargos c ON c.due = i.due
             WHERE NOT i.es_cargo
        )
        SELECT
            COALESCE((SELECT SUM(LEAST(capital, GREATEST(0, pagado_cuota - interes))) FROM regulares), 0),
            COALESCE((SELECT SUM(GREATEST(0, interes - LEAST(interes, pagado_cuota))) FROM regulares), 0),
            COALESCE((SELECT SUM(GREATEST(0, total_cargos - aplicado)) FROM cargos), 0)
          INTO v_capital_paid_regular, v_interest_pending, v_pending_charges;

        v_remaining_balance := GREATEST(
            0,
            ROUND(
                GREATEST(0, v_loan.amount - v_capital_paid_regular - v_total_capital_payments)
                + v_interest_pending
                + v_pending_charges,
            2)
        );
        RETURN v_remaining_balance;
    END IF;

    -- Sin cuotas guardadas (préstamos muy antiguos): la fórmula de siempre, sobre el total.
    v_correct_total_amount := v_loan.total_amount;
    IF v_correct_total_amount IS NULL OR v_correct_total_amount <= v_loan.amount THEN
        v_total_interest := v_loan.amount
                            * (v_loan.interest_rate / 100)
                            * loan_frequency_rate_factor(v_loan.payment_frequency)
                            * COALESCE(v_loan.term_months, 1);
        v_correct_total_amount := v_loan.amount + v_total_interest;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE loan_id = p_loan_id
      AND superseded_at IS NULL;

    v_remaining_balance := GREATEST(
        0, v_correct_total_amount - v_total_paid - v_total_capital_payments
    );
    RETURN v_remaining_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION calculate_loan_remaining_balance(UUID) IS
  'Saldo pendiente, igual que la ficha del préstamo. Plazo fijo: (monto prestado - capital cobrado - abonos) + interés pendiente + cargos pendientes. Indefinido: (monto prestado - abonos) + interés pendiente período por período + cargos - capital pagado.';


-- ----------------------------------------------------------------------------
-- Recalcular el saldo de todos los préstamos
-- ----------------------------------------------------------------------------
UPDATE public.loans
   SET remaining_balance = calculate_loan_remaining_balance(id)
 WHERE COALESCE(status, '') <> 'deleted';


-- ----------------------------------------------------------------------------
-- Reabrir los préstamos que quedaron "pagados" por el abono restado dos veces
-- ----------------------------------------------------------------------------
-- Solo los que cumplen TODO lo siguiente, para no tocar un préstamo saldado de verdad:
--   · plazo fijo, marcado 'paid';
--   · tiene al menos un abono a capital (sin abono el fallo no podía darse);
--   · según el cálculo corregido todavía debe algo;
--   · le quedan cuotas sin marcar como pagadas;
--   · no se cerró con "Saldar Préstamo", que deja el préstamo pagado a propósito.
WITH reabiertos AS (
    UPDATE public.loans l
       SET status = 'active'
     WHERE l.status = 'paid'
       AND lower(COALESCE(l.amortization_type, '')) <> 'indefinite'
       AND COALESCE(l.remaining_balance, 0) > 0.01
       AND EXISTS (SELECT 1 FROM public.capital_payments cp WHERE cp.loan_id = l.id)
       AND EXISTS (SELECT 1 FROM public.installments i
                    WHERE i.loan_id = l.id AND COALESCE(i.is_paid, false) = false)
       AND NOT EXISTS (SELECT 1 FROM public.loan_history h
                        WHERE h.loan_id = l.id
                          AND (h.description ILIKE 'Saldar Préstamo%' OR h.description ILIKE 'settle_loan%'))
    RETURNING l.id, l.amount, l.remaining_balance
)
SELECT id AS prestamo_reabierto, amount AS monto_prestado, remaining_balance AS saldo
  FROM reabiertos;
