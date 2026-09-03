-- ============================================================================
-- El balance del préstamo cuenta los ABONOS A CAPITAL
-- ============================================================================
-- FALLO REPORTADO (2026-09-03): un préstamo con un abono a capital de RD$3,000 seguía
-- apareciendo en el inicio con el saldo anterior, mientras su propia ficha mostraba el saldo
-- correcto. Dos cifras distintas para el mismo préstamo, según la pantalla.
--
-- CAUSA: los abonos a capital NO se guardan en `payments`, sino en su propia tabla
-- `capital_payments` (creada en 20250127000000). Y `calculate_loan_remaining_balance` —la
-- función que mantienen los triggers y de la que sale `loans.remaining_balance`— solo mira
-- `payments`. Así que para la base de datos ese dinero nunca entró.
--
-- El frontend sí los cuenta (`src/utils/loanBalanceBreakdown.ts` consulta `capital_payments`),
-- y de ahí la divergencia: la ficha del préstamo daba una cifra y el inicio otra.
--
-- Peor aún: la aplicación compensaba escribiendo `loans.remaining_balance` a mano tras cada
-- abono. Pero cualquier trigger posterior —registrar un pago, pagar un cargo, tocar una
-- cuota— recalculaba con la fórmula incompleta y BORRABA esa corrección, devolviendo el
-- saldo a como si el abono no se hubiera hecho. Por eso reaparecía después de cobrar.
--
-- QUÉ CAMBIA: la función resta también los abonos a capital, y se añaden triggers sobre
-- `capital_payments` para que el saldo se actualice al registrarlos o borrarlos, igual que ya
-- ocurre con `payments` e `installments`.
--
-- Se conserva íntegra la lógica anterior (frecuencia, indefinidos, cargos y el filtro
-- `superseded_at` de 20260903000000): lo único que se añade es el término que faltaba.
--
-- ES AUTOSUFICIENTE. Incluye las funciones auxiliares de frecuencia de 20260828000000,
-- porque en una base que se quedó atrás con las migraciones no existen y la función fallaba
-- con «function loan_frequency_rate_factor(text) does not exist». Van con
-- CREATE OR REPLACE: si ya estaban, se reescriben idénticas y no pasa nada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Funciones auxiliares de frecuencia (de 20260828000000)
-- ----------------------------------------------------------------------------
-- El plazo de un préstamo está en PERÍODOS de su frecuencia, no en meses. Estas tres
-- traducen entre una cosa y otra y las usa el cálculo del saldo.

-- Suma `p_periods` períodos de la frecuencia dada a una fecha.
-- En frecuencias basadas en meses, `+ INTERVAL 'n months'` de Postgres ya recorta al último
-- día del mes (31-ene + 1 month = 28-feb), igual que el frontend.
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

-- Factor para convertir la tasa MENSUAL a la tasa del período de pago.
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

-- Días que dura un período (para prorratear mora de tipo 'monthly').
CREATE OR REPLACE FUNCTION loan_frequency_period_days(p_frequency TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE lower(COALESCE(p_frequency, 'monthly'))
        WHEN 'daily'     THEN 1
        WHEN 'weekly'    THEN 7
        WHEN 'biweekly'  THEN 14
        WHEN 'quarterly' THEN 90
        WHEN 'yearly'    THEN 365
        ELSE                  30
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

-- Cuenta cuántos períodos ya vencieron, período por período, en vez de aproximar con AGE()
-- en meses o con "días / 30" (que en un préstamo diario contaba 1 donde había 30).
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

    -- Tope de seguridad: 100.000 períodos (≈273 años en diario)
    WHILE v_n < 100000 LOOP
        EXIT WHEN loan_add_periods(p_first_due_date, v_n, p_frequency) > p_as_of;
        v_count := v_n + 1;
        v_n := v_n + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;


-- ----------------------------------------------------------------------------
-- 1. El cálculo del saldo
-- ----------------------------------------------------------------------------
-- Se elimina primero porque `CREATE OR REPLACE` NO permite cambiar el tipo de retorno, y en
-- bases antiguas la función devuelve DECIMAL(10,2) —que topa en 99.999.999,99 y reventaba el
-- trigger con "numeric field overflow" en carteras grandes, abortando el cobro entero.
-- Los cuerpos plpgsql no crean dependencias registradas, así que los triggers que la llaman
-- siguen funcionando tras recrearla.
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
    v_pending_interest DECIMAL(14,2) := 0;
    v_first_due DATE;
    v_periods_elapsed INTEGER;
    v_interest_per_period DECIMAL(14,2);
    v_paid_interest DECIMAL(14,2);
    v_paid_count INTEGER;
    v_total_expected_count INTEGER;
BEGIN
    SELECT id, amount, interest_rate, term_months, total_amount,
           amortization_type, start_date, payment_frequency, monthly_payment
    INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- ------------------------------------------------------------------------
    -- Abonos a capital. Viven en su propia tabla, no en `payments`.
    -- ------------------------------------------------------------------------
    -- Es dinero recibido que reduce el capital, así que resta del saldo en los dos tipos de
    -- amortización. Se usa un bloque tolerante porque la tabla se creó en una migración
    -- posterior a la del esquema base: si no existiera, el saldo debe seguir calculándose en
    -- vez de reventar el trigger y bloquear cualquier cobro.
    BEGIN
        SELECT COALESCE(SUM(amount), 0)
        INTO v_total_capital_payments
        FROM public.capital_payments
        WHERE loan_id = p_loan_id;
    EXCEPTION WHEN undefined_table THEN
        v_total_capital_payments := 0;
    END;

    IF lower(COALESCE(v_loan.amortization_type, '')) = 'indefinite' THEN
        -- Interés por período, ajustado a la frecuencia (ver 20260828000000).
        v_interest_per_period := CASE
            WHEN COALESCE(v_loan.monthly_payment, 0) > 0.01 THEN v_loan.monthly_payment
            ELSE v_loan.amount * (v_loan.interest_rate / 100)
                 * loan_frequency_rate_factor(v_loan.payment_frequency)
        END;

        v_first_due := loan_add_periods(v_loan.start_date::DATE, 1, v_loan.payment_frequency);
        v_periods_elapsed := loan_count_elapsed_periods(
            v_first_due, CURRENT_DATE, v_loan.payment_frequency
        );

        SELECT COALESCE(SUM(interest_amount), 0)
        INTO v_paid_interest
        FROM public.payments
        WHERE loan_id = p_loan_id
          AND superseded_at IS NULL;

        v_paid_count := CASE
            WHEN v_interest_per_period > 0.01
                THEN FLOOR(v_paid_interest / v_interest_per_period)::INTEGER
            ELSE 0
        END;

        -- En un indefinido SIEMPRE hay al menos un período devengándose.
        v_total_expected_count := GREATEST(v_paid_count + 1, v_periods_elapsed + 1);
        v_pending_interest := v_interest_per_period
                              * GREATEST(1, v_total_expected_count - v_paid_count);

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
            v_loan.amount + v_pending_interest + v_total_charges_amount
            - v_total_paid - v_total_capital_payments
        );
        RETURN v_remaining_balance;
    END IF;

    -- ------------------------------------------------------------------------
    -- Plazo fijo
    -- ------------------------------------------------------------------------
    v_correct_total_amount := v_loan.total_amount;

    IF v_correct_total_amount IS NULL OR v_correct_total_amount <= v_loan.amount THEN
        -- El plazo está en PERÍODOS, así que la tasa debe ser la del período.
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
  'Saldo pendiente: total + cargos - pagos - abonos a capital. Los abonos viven en `capital_payments`, no en `payments`.';


-- ----------------------------------------------------------------------------
-- Triggers sobre `capital_payments`
-- ----------------------------------------------------------------------------
-- Sin ellos el saldo solo se actualizaría cuando algo TOCARA otra tabla, así que un abono a
-- capital no movía nada hasta el siguiente cobro — y entonces lo hacía por accidente.
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
-- Corregir los préstamos que ya tienen el saldo mal
-- ----------------------------------------------------------------------------
-- Los que recibieron un abono a capital arrastran un `remaining_balance` inflado. Se
-- recalculan todos los que no están borrados; para los que no tienen abonos el valor no
-- cambia, así que es seguro pasarlo entero.
UPDATE public.loans
   SET remaining_balance = calculate_loan_remaining_balance(id)
 WHERE COALESCE(status, '') <> 'deleted';


-- ============================================================================
-- Comprobación: préstamos con abono a capital y su saldo ya recalculado
-- ============================================================================
SELECT
  l.id,
  l.total_amount,
  cp.total_abonado,
  l.remaining_balance
FROM public.loans l
JOIN (
  SELECT loan_id, SUM(amount) AS total_abonado
  FROM public.capital_payments
  GROUP BY loan_id
) cp ON cp.loan_id = l.id
ORDER BY cp.total_abonado DESC
LIMIT 20;
