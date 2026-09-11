-- ============================================================================
-- Abono a capital sin rebajar el monto prestado + días de atraso tras condonar mora
-- ============================================================================
-- Tres reportes del 2026-09-10:
--
-- 1. "Cuando se hace un abono a capital el monto prestado no debe bajar, el balance pendiente
--    sí". En los préstamos INDEFINIDOS el abono reescribía `loans.amount` con el capital que
--    quedaba, así que el monto prestado se perdía. Los de plazo fijo nunca lo tocaban.
--    Además la función del balance (20260905000000) ya restaba los abonos sobre ese monto
--    rebajado: el abono se descontaba DOS VECES en cuanto un trigger recalculaba el saldo.
--
--    Desde ahora `loans.amount` es SIEMPRE lo prestado y el capital vigente se deduce:
--    `monto prestado − abonos a capital`. Aquí se devuelve el monto a los préstamos que ya lo
--    tenían rebajado.
--
-- 2. "Cuando se hace un abono a capital y la cuota se reevalúa, en pago avanzado sigue
--    mostrando la cuota vieja". Tras un abono, la cuota de un indefinido cambia a partir del
--    período SIGUIENTE al del abono (el período en curso se devengó con el capital de antes).
--    La función del balance usaba la cuota nueva para todos los períodos; ahora aplica la misma
--    regla que la aplicación (`buildIndefiniteInterestResolver` en src/utils/indefiniteInterest.ts):
--    un período que vence hasta `fecha del abono + 1 período` vale `capital antes × tasa`.
--
-- 3. "Cuando se elimina la mora no se están eliminando los días atrasados". Nueva columna
--    `installments.late_fee_waived_at`: el día en que "Eliminar Mora" dejó la mora de la cuota en
--    cero. Los días de atraso se cuentan desde ahí.
--
-- ES AUTOSUFICIENTE: incluye las funciones auxiliares de frecuencia y los triggers sobre
-- `capital_payments` de 20260905000000 (con CREATE OR REPLACE / DROP IF EXISTS), por si esa
-- migración no llegó a aplicarse.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Día de la condonación de mora
-- ----------------------------------------------------------------------------
ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS late_fee_waived_at DATE;

COMMENT ON COLUMN public.installments.late_fee_waived_at IS
  'Día en que se condonó toda la mora de la cuota ("Eliminar Mora"). Los días de atraso se cuentan desde aquí. En un indefinido vale para todos sus períodos.';


-- ----------------------------------------------------------------------------
-- 2. Funciones auxiliares de frecuencia (idénticas a 20260828000000 / 20260905000000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION loan_add_periods(
    p_date DATE,
    p_periods INTEGER,
    p_frequency TEXT
) RETURNS DATE AS $$
BEGIN
    RETURN CASE lower(COALESCE(p_frequency, 'monthly'))
        WHEN 'daily'     THEN p_date + (p_periods           || ' days')::INTERVAL
        WHEN 'weekly'    THEN p_date + (p_periods * 7       || ' days')::INTERVAL
        WHEN 'biweekly'  THEN p_date + (p_periods * 14      || ' days')::INTERVAL
        WHEN 'quarterly' THEN p_date + (p_periods * 3       || ' months')::INTERVAL
        WHEN 'yearly'    THEN p_date + (p_periods * 12      || ' months')::INTERVAL
        ELSE                  p_date + (p_periods           || ' months')::INTERVAL
    END::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION loan_frequency_rate_factor(p_frequency TEXT)
RETURNS DECIMAL AS $$
BEGIN
    RETURN CASE lower(COALESCE(p_frequency, 'monthly'))
        WHEN 'daily'     THEN 1.0 / 30.0
        WHEN 'weekly'    THEN 1.0 / 4.0
        WHEN 'biweekly'  THEN 0.5
        WHEN 'quarterly' THEN 3.0
        WHEN 'yearly'    THEN 12.0
        ELSE                  1.0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION loan_count_elapsed_periods(
    p_first_due_date DATE,
    p_as_of DATE,
    p_frequency TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_n INTEGER := 0;
BEGIN
    IF p_first_due_date IS NULL OR p_as_of IS NULL THEN
        RETURN 0;
    END IF;

    WHILE v_n < 100000 LOOP
        EXIT WHEN loan_add_periods(p_first_due_date, v_n, p_frequency) > p_as_of;
        v_count := v_n + 1;
        v_n := v_n + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;


-- ----------------------------------------------------------------------------
-- 3. Devolver el monto prestado a los indefinidos que el abono rebajó
-- ----------------------------------------------------------------------------
-- La versión anterior dejaba `amount = capital_after` del abono, y el abono siguiente partía
-- de ese monto (`capital_before = amount`). Así que el monto original es el `capital_before`
-- del PRIMER abono, y debe cumplirse `original = amount actual + suma de abonos`.
--
-- Solo se toca un préstamo si su `amount` coincide EXACTAMENTE con el capital que dejó su último
-- abono y además la cuenta cuadra. Si alguien editó el monto después, no coincide y se deja
-- como está (la aplicación reconoce igualmente ese caso y no resta el abono dos veces).
WITH abonos AS (
    SELECT loan_id,
           SUM(amount) AS total_abonado,
           (ARRAY_AGG(capital_before ORDER BY created_at ASC))[1] AS capital_antes_del_primero,
           (ARRAY_AGG(capital_after ORDER BY created_at DESC))[1] AS capital_tras_el_ultimo
      FROM public.capital_payments
     WHERE amount > 0.005
     GROUP BY loan_id
)
UPDATE public.loans l
   SET amount = a.capital_antes_del_primero
  FROM abonos a
 WHERE a.loan_id = l.id
   AND lower(COALESCE(l.amortization_type, '')) = 'indefinite'
   AND ABS(l.amount - a.capital_tras_el_ultimo) < 0.01
   AND ABS(a.capital_antes_del_primero - (l.amount + a.total_abonado)) < 0.01;


-- ----------------------------------------------------------------------------
-- 4. El cálculo del saldo
-- ----------------------------------------------------------------------------
-- Plazo fijo: sin cambios respecto de 20260905000000.
-- Indefinido:
--   · capital vigente = lo prestado − abonos (salvo que el monto siga rebajado: ver arriba);
--   · el interés pendiente se recorre PERÍODO POR PERÍODO con la cuota que corresponde a cada
--     fecha, en vez de `cuota nueva × períodos sin pagar`;
--   · un pago sin interés NI capital (se registran así algunos pagos de cuota de un indefinido)
--     cuenta como interés, igual que en la aplicación. Antes no contaba para nada y ese período
--     seguía figurando como pendiente.
DROP FUNCTION IF EXISTS calculate_loan_remaining_balance(UUID);

CREATE OR REPLACE FUNCTION calculate_loan_remaining_balance(p_loan_id UUID)
RETURNS DECIMAL(14,2) AS $$
DECLARE
    v_loan RECORD;
    v_correct_total_amount DECIMAL(14,2);
    v_total_interest DECIMAL(14,2);
    v_total_charges_amount DECIMAL(14,2) := 0;
    v_total_amount_with_charges DECIMAL(14,2);
    v_total_paid DECIMAL(14,2) := 0;
    v_total_capital_payments DECIMAL(14,2) := 0;
    v_remaining_balance DECIMAL(14,2);
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
        -- Capital vigente: lo prestado menos los abonos. Si el monto sigue rebajado por la versión
        -- anterior (coincide con el capital que dejó el último abono), ya es el capital vigente.
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

        -- Cuota vigente y proporción cuota/capital (respeta cómo se calculó la cuota del préstamo).
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

        -- Tramos de los abonos: hasta `fecha del abono + 1 período` rige la cuota de antes.
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

        -- Interés cobrado. Un pago sin interés ni capital es un pago de cuota registrado sin
        -- desglose: cuenta como interés. Los pagos de cargos (solo capital) no.
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

        -- Recorre los períodos desde el primero, cubriendo cada uno con lo cobrado. Llega al menos
        -- hasta el período en curso (siempre hay uno devengándose) y, si todo estaba pagado por
        -- adelantado, hasta el primero que quede pendiente.
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

        -- En indefinidos los pagos de interés NO reducen el balance: solo capital y cargos.
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

    -- ------------------------------------------------------------------------
    -- Plazo fijo (sin cambios)
    -- ------------------------------------------------------------------------
    v_correct_total_amount := v_loan.total_amount;

    IF v_correct_total_amount IS NULL OR v_correct_total_amount <= v_loan.amount THEN
        v_total_interest := v_loan.amount
                            * (v_loan.interest_rate / 100)
                            * loan_frequency_rate_factor(v_loan.payment_frequency)
                            * COALESCE(v_loan.term_months, 1);
        v_correct_total_amount := v_loan.amount + v_total_interest;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total_charges_amount
    FROM public.installments
    WHERE loan_id = p_loan_id
      AND ABS(interest_amount) < 0.01
      AND ABS(principal_amount - COALESCE(total_amount, 0)) < 0.01
      AND COALESCE(total_amount, 0) > 0;

    v_total_amount_with_charges := v_correct_total_amount + v_total_charges_amount;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE loan_id = p_loan_id
      AND superseded_at IS NULL;

    v_remaining_balance := GREATEST(
        0, v_total_amount_with_charges - v_total_paid - v_total_capital_payments
    );
    RETURN v_remaining_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION calculate_loan_remaining_balance(UUID) IS
  'Saldo pendiente. Plazo fijo: total + cargos - pagos - abonos a capital. Indefinido: (monto prestado - abonos) + interés pendiente período por período + cargos - capital pagado.';


-- ----------------------------------------------------------------------------
-- 5. Triggers sobre `capital_payments` (idénticos a 20260905000000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_update_loan_balance_from_capital_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_loan_id UUID;
BEGIN
    v_loan_id := COALESCE(NEW.loan_id, OLD.loan_id);

    UPDATE public.loans
       SET remaining_balance = calculate_loan_remaining_balance(v_loan_id)
     WHERE id = v_loan_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS update_loan_balance_on_capital_payment_insert ON public.capital_payments;
DROP TRIGGER IF EXISTS update_loan_balance_on_capital_payment_update ON public.capital_payments;
DROP TRIGGER IF EXISTS update_loan_balance_on_capital_payment_delete ON public.capital_payments;

CREATE TRIGGER update_loan_balance_on_capital_payment_insert
    AFTER INSERT ON public.capital_payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_from_capital_payment();

CREATE TRIGGER update_loan_balance_on_capital_payment_update
    AFTER UPDATE ON public.capital_payments
    FOR EACH ROW
    WHEN (OLD.amount IS DISTINCT FROM NEW.amount)
    EXECUTE FUNCTION trigger_update_loan_balance_from_capital_payment();

CREATE TRIGGER update_loan_balance_on_capital_payment_delete
    AFTER DELETE ON public.capital_payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_from_capital_payment();


-- ----------------------------------------------------------------------------
-- 6. Recalcular el saldo de todos los préstamos
-- ----------------------------------------------------------------------------
UPDATE public.loans
   SET remaining_balance = calculate_loan_remaining_balance(id)
 WHERE COALESCE(status, '') <> 'deleted';


-- ============================================================================
-- Comprobación: indefinidos con abono a capital, su monto prestado y su saldo
-- ============================================================================
SELECT
  l.id,
  l.amount            AS monto_prestado,
  cp.total_abonado,
  l.amount - cp.total_abonado AS capital_vigente,
  l.monthly_payment   AS cuota_vigente,
  l.remaining_balance
FROM public.loans l
JOIN (
  SELECT loan_id, SUM(amount) AS total_abonado
  FROM public.capital_payments
  GROUP BY loan_id
) cp ON cp.loan_id = l.id
WHERE lower(COALESCE(l.amortization_type, '')) = 'indefinite'
ORDER BY cp.total_abonado DESC
LIMIT 20;
