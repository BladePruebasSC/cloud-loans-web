-- ============================================================================
-- AUDITORÍA DE CÁLCULOS (2026-08-28)
-- Corrección de las funciones SQL que ignoraban la FRECUENCIA DE PAGO
-- ============================================================================
--
-- CONVENIO DEL SISTEMA (el mismo que usa el frontend en src/utils/frequencyUtils.ts):
--   * `loans.interest_rate` es SIEMPRE una tasa MENSUAL.
--   * `loans.term_months` está expresado en PERÍODOS de la frecuencia elegida,
--     NO en meses (un préstamo diario con plazo 30 dura 30 días).
--   * La tasa de un período = tasa mensual × factor (quincenal 1/2, semanal 1/4,
--     diario 1/30, trimestral 3, anual 12).
--   * La primera cuota vence UN PERÍODO después de `start_date`.
--
-- Las funciones existentes asumían que TODO era mensual. Los defectos corregidos:
--
--  1. `calculate_loan_next_payment_date` (préstamos indefinidos) EMPUJABA la fecha del
--     próximo pago hacia el futuro cuando ya había vencido:
--         IF v_next_payment_month <= CURRENT_DATE THEN <sumar otro período>
--     Es decir: si el cliente estaba ATRASADO, en vez de dejar la fecha vencida, la
--     movía hacia adelante. Y como `getLateFeeBreakdownFromInstallments` usa
--     `next_payment_date` como corte de "todo lo anterior está pagado", eso marcaba
--     como PAGADAS cuotas realmente vencidas y ponía su mora en cero. Un cliente
--     indefinido moroso aparecía al día. Se elimina ese empuje.
--
--  2. `v_interest_per_payment := amount * (interest_rate / 100)` usaba la tasa mensual
--     completa para cualquier frecuencia. En un indefinido quincenal, el sistema creía
--     que cada cuota valía el doble de lo real, así que `FLOOR(pagado / cuota)` contaba
--     la MITAD de las cuotas pagadas y `next_payment_date` se quedaba atrás.
--
--  3. Los "períodos transcurridos" se calculaban con `AGE()` en MESES para todas las
--     frecuencias: un préstamo diario con 45 días de vida reportaba 1 período en vez
--     de 45, y su interés pendiente salía 45 veces menor.
--
--  4. `calculate_loan_remaining_balance`: el interés total de respaldo
--     (`amount * rate/100 * term_months`) daba 300% en un préstamo diario a 30 días.
--
--  5. `recalculate_late_fee_from_scratch` devolvía como `days_overdue` el MÍNIMO de
--     días de todas las cuotas pendientes (que casi siempre es 0, porque la última
--     cuota aún no vence), mientras el frontend usa el MÁXIMO. Ese 0 hacía que
--     `update_all_late_fees_from_scratch` devolviera préstamos morosos al estado
--     'active'. Además prorrateaba la mora "mensual" siempre a 30 días.
--
--  6. Todas las funciones `SECURITY DEFINER` carecían de `SET search_path`, lo que
--     permite secuestrar la resolución de nombres desde un esquema del atacante.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de frecuencia: una sola definición para toda la base de datos
-- ----------------------------------------------------------------------------

-- Suma `p_periods` períodos de la frecuencia dada a una fecha.
-- En frecuencias basadas en meses, `+ INTERVAL 'n months'` de Postgres ya recorta al
-- último día del mes (31-ene + 1 month = 28-feb), igual que el frontend.
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

-- Cuenta cuántos períodos ya vencieron (fecha de vencimiento <= p_as_of), contando
-- período por período en vez de aproximar con AGE() en meses o con "días / 30".
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
-- Los tipos de retorno pasan de DECIMAL(10,2) a DECIMAL(14,2).
--
-- Motivo: DECIMAL(10,2) tope en 99.999.999,99. Una cartera con préstamos por encima
-- de ~100 millones hacía fallar el trigger con "numeric field overflow", lo que
-- abortaba el INSERT del pago completo (el pago no se registraba).
--
-- `CREATE OR REPLACE FUNCTION` NO permite cambiar el tipo de retorno, así que hay que
-- eliminar primero. Los cuerpos plpgsql no crean dependencias registradas, por lo que
-- `update_all_late_fees_from_scratch` sigue funcionando tras recrear la función.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS calculate_loan_remaining_balance(UUID);
DROP FUNCTION IF EXISTS recalculate_late_fee_from_scratch(UUID, DATE);
DROP FUNCTION IF EXISTS calculate_late_fee(UUID, DATE);

-- ----------------------------------------------------------------------------
-- 1) remaining_balance: interés de respaldo consciente de la frecuencia
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_loan_remaining_balance(p_loan_id UUID)
RETURNS DECIMAL(14,2) AS $$
DECLARE
    v_loan RECORD;
    v_correct_total_amount DECIMAL(14,2);
    v_total_interest DECIMAL(14,2);
    v_total_charges_amount DECIMAL(14,2) := 0;
    v_total_amount_with_charges DECIMAL(14,2);
    v_total_paid DECIMAL(14,2) := 0;
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

    IF lower(COALESCE(v_loan.amortization_type, '')) = 'indefinite' THEN
        -- ====================================================================
        -- CORRECCIÓN (auditoría 2026-08-28): DIVERGENCIA DE SALDO EN INDEFINIDOS
        -- ====================================================================
        -- La versión anterior calculaba el interés pendiente sumando el `interest_amount`
        -- de las filas NO PAGADAS de `installments`. Pero un préstamo indefinido solo tiene
        -- UNA fila de cuota regular en esa tabla (la que crea `generateOriginalInstallments`
        -- con `installment_number = 1`): los períodos siguientes no existen como filas, se
        -- generan dinámicamente en el frontend. Así que aunque hubiera 5 períodos vencidos,
        -- la BD reportaba el interés de UNO SOLO y el saldo salía muy por debajo del real.
        -- El respaldo por períodos ni siquiera se ejecutaba, porque solo entraba cuando la
        -- suma daba exactamente 0.
        --
        -- Resultado: `loans.remaining_balance` (BD) y el desglose de pantalla
        -- (`loanBalanceBreakdown.ts`) mostraban cifras distintas para el mismo préstamo.
        --
        -- DECISIÓN: la fuente de verdad es el cálculo POR PERÍODOS, que es el correcto
        -- financieramente (se debe el interés de cada período ya vencido, exista o no una
        -- fila en `installments`). Se replica aquí la misma lógica que
        -- `loanBalanceBreakdown.ts` usa en el frontend, para que ambos coincidan siempre.

        -- Interés por período, ajustado a la frecuencia. Se prefiere `monthly_payment`
        -- (que ya se guarda ajustado al período), igual que hace el frontend.
        v_interest_per_period := CASE
            WHEN COALESCE(v_loan.monthly_payment, 0) > 0.01 THEN v_loan.monthly_payment
            ELSE v_loan.amount * (v_loan.interest_rate / 100)
                 * loan_frequency_rate_factor(v_loan.payment_frequency)
        END;

        -- Períodos ya vencidos, contados uno a uno por la frecuencia real
        -- (antes: AGE() en meses, que en un préstamo diario contaba 1 en vez de 30).
        v_first_due := loan_add_periods(v_loan.start_date::DATE, 1, v_loan.payment_frequency);
        v_periods_elapsed := loan_count_elapsed_periods(
            v_first_due, CURRENT_DATE, v_loan.payment_frequency
        );

        SELECT COALESCE(SUM(interest_amount), 0)
        INTO v_paid_interest
        FROM public.payments
        WHERE loan_id = p_loan_id;

        IF v_interest_per_period > 0 THEN
            v_paid_count := FLOOR(v_paid_interest / v_interest_per_period);
        ELSE
            v_paid_count := 0;
        END IF;

        -- En un indefinido SIEMPRE hay al menos un período pendiente: si el cliente está al
        -- día, lo que debe es el interés del período en curso.
        v_total_expected_count := GREATEST(v_paid_count + 1, v_periods_elapsed);
        v_pending_interest := v_interest_per_period
                              * GREATEST(1, v_total_expected_count - v_paid_count);

        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_total_charges_amount
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND ABS(interest_amount) < 0.01
          AND ABS(principal_amount - COALESCE(total_amount, 0)) < 0.01
          AND COALESCE(total_amount, 0) > 0;

        -- En indefinidos los pagos de interés NO reducen el balance: solo capital/cargos
        SELECT COALESCE(SUM(principal_amount), 0)
        INTO v_total_paid
        FROM public.payments
        WHERE loan_id = p_loan_id
          AND principal_amount > 0;

        v_remaining_balance := GREATEST(
            0, v_loan.amount + v_pending_interest + v_total_charges_amount - v_total_paid
        );
        RETURN v_remaining_balance;
    END IF;

    -- Plazo fijo
    v_correct_total_amount := v_loan.total_amount;

    IF v_correct_total_amount IS NULL OR v_correct_total_amount <= v_loan.amount THEN
        -- CORRECCIÓN: el plazo está en PERÍODOS, así que la tasa debe ser la del período.
        -- Antes: `amount * rate/100 * term_months` daba 300% en un préstamo diario a 30 días.
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
    WHERE loan_id = p_loan_id;

    v_remaining_balance := GREATEST(0, v_total_amount_with_charges - v_total_paid);
    RETURN v_remaining_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 2) next_payment_date: no ocultar cuotas vencidas + frecuencia real
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_loan_next_payment_date(p_loan_id UUID)
RETURNS DATE AS $$
DECLARE
    v_first_unpaid_date DATE;
    v_first_payment_date DATE;
    v_frequency TEXT;
    v_paid_interest DECIMAL(14,2) := 0;
    v_interest_per_payment DECIMAL(14,2);
    v_paid_count INTEGER;
    v_loan RECORD;
BEGIN
    SELECT id, amortization_type, start_date, first_payment_date, payment_frequency,
           amount, interest_rate, monthly_payment, status, end_date, term_months
    INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id;

    IF NOT FOUND THEN
        RETURN CURRENT_DATE;
    END IF;

    IF v_loan.status IN ('paid', 'settled') THEN
        RETURN COALESCE(v_loan.end_date, CURRENT_DATE);
    END IF;

    v_frequency := COALESCE(v_loan.payment_frequency, 'monthly');

    -- Plazo fijo: la primera cuota pendiente manda
    IF lower(COALESCE(v_loan.amortization_type, '')) <> 'indefinite' THEN
        SELECT MIN(due_date)
        INTO v_first_unpaid_date
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND is_paid = false
          AND due_date IS NOT NULL;

        IF v_first_unpaid_date IS NOT NULL THEN
            RETURN v_first_unpaid_date;
        END IF;

        IF v_loan.end_date IS NOT NULL AND v_loan.end_date >= CURRENT_DATE THEN
            RETURN v_loan.end_date;
        ELSIF v_loan.start_date IS NOT NULL AND v_loan.term_months IS NOT NULL THEN
            -- CORRECCIÓN: el plazo está en PERÍODOS de la frecuencia, no en meses
            RETURN loan_add_periods(v_loan.start_date::DATE, v_loan.term_months, v_frequency);
        END IF;

        IF v_loan.start_date IS NOT NULL THEN
            RETURN loan_add_periods(v_loan.start_date::DATE, 1, v_frequency);
        END IF;

        RETURN CURRENT_DATE;
    END IF;

    -- Indefinidos
    IF v_loan.start_date IS NULL THEN
        RETURN CURRENT_DATE;
    END IF;

    -- `loans.first_payment_date` guarda la fecha de INICIO elegida por el usuario
    -- (LoanForm.onSubmit la copia de `start_date`), NO la primera fecha de vencimiento.
    -- Por eso siempre se deriva desde `start_date` + 1 período.
    v_first_payment_date := loan_add_periods(v_loan.start_date::DATE, 1, v_frequency);

    -- CORRECCIÓN: interés por período ajustado a la frecuencia. Se prefiere
    -- `monthly_payment`, que ya se guarda ajustado al período de pago.
    v_interest_per_payment := CASE
        WHEN COALESCE(v_loan.monthly_payment, 0) > 0.01 THEN v_loan.monthly_payment
        ELSE v_loan.amount * (v_loan.interest_rate / 100)
             * loan_frequency_rate_factor(v_frequency)
    END;

    SELECT COALESCE(SUM(interest_amount), 0)
    INTO v_paid_interest
    FROM public.payments
    WHERE loan_id = p_loan_id;

    IF v_interest_per_payment > 0 THEN
        v_paid_count := FLOOR(v_paid_interest / v_interest_per_payment);
    ELSE
        v_paid_count := 0;
    END IF;

    -- La próxima cuota NO pagada es la (v_paid_count + 1), que está a v_paid_count
    -- períodos de la primera.
    --
    -- CORRECCIÓN CRÍTICA: aquí la versión anterior hacía
    --     IF fecha <= CURRENT_DATE THEN fecha := fecha + 1 período
    -- es decir, si el cliente estaba ATRASADO empujaba la fecha al futuro. Como el motor
    -- de mora trata todo lo anterior a `next_payment_date` como PAGADO, esto borraba la
    -- mora de las cuotas realmente vencidas y hacía que un moroso apareciera al día.
    -- La fecha del próximo pago DEBE quedarse en el pasado cuando hay atraso.
    RETURN loan_add_periods(v_first_payment_date, v_paid_count, v_frequency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3) Mora: days_overdue = MÁXIMO (no mínimo) y prorrateo por período real
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_late_fee_from_scratch(
    p_loan_id UUID,
    p_calculation_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    days_overdue INTEGER,
    late_fee_amount DECIMAL(14,2),
    total_late_fee DECIMAL(14,2)
) AS $$
DECLARE
    loan_record RECORD;
    inst RECORD;
    v_is_indefinite BOOLEAN;
    v_is_charge BOOLEAN;
    v_basis DECIMAL(14,2);
    v_days INTEGER;
    v_period_days INTEGER;
    v_installment_fee DECIMAL(14,2);
    v_total_fee DECIMAL(14,2) := 0;
    v_max_days INTEGER := 0;
    v_found_installments BOOLEAN := false;
BEGIN
    SELECT l.* INTO loan_record
    FROM public.loans l
    WHERE l.id = p_loan_id;

    IF NOT FOUND
       OR loan_record.status NOT IN ('active', 'overdue')
       OR NOT COALESCE(loan_record.late_fee_enabled, false) THEN
        RETURN QUERY SELECT 0, 0.0::DECIMAL(14,2), 0.0::DECIMAL(14,2);
        RETURN;
    END IF;

    v_is_indefinite := lower(COALESCE(loan_record.amortization_type, '')) = 'indefinite';
    v_period_days := loan_frequency_period_days(loan_record.payment_frequency);

    FOR inst IN
        SELECT *
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND COALESCE(is_paid, false) = false
          AND due_date IS NOT NULL
        ORDER BY due_date ASC
    LOOP
        v_found_installments := true;

        v_days := GREATEST(
            0,
            (p_calculation_date - inst.due_date::date) - COALESCE(loan_record.grace_period_days, 0)
        );

        -- CORRECCIÓN: antes se guardaba el MÍNIMO de días de todas las cuotas pendientes.
        -- La última cuota de un préstamo casi nunca ha vencido, así que el mínimo era 0 y
        -- `update_all_late_fees_from_scratch` devolvía a 'active' préstamos con meses de
        -- atraso. El frontend usa el máximo; se unifica al máximo.
        v_max_days := GREATEST(v_max_days, v_days);

        IF v_days <= 0 THEN
            CONTINUE;
        END IF;

        v_is_charge := ABS(COALESCE(inst.interest_amount, 0)) < 0.01
                       AND COALESCE(inst.principal_amount, 0) > 0.01;

        IF v_is_charge THEN
            v_basis := COALESCE(inst.total_amount, inst.principal_amount, 0);
        ELSIF v_is_indefinite THEN
            v_basis := COALESCE(inst.interest_amount, inst.total_amount, 0);
        ELSE
            v_basis := COALESCE(inst.principal_amount, inst.total_amount, 0);
        END IF;

        CASE loan_record.late_fee_calculation_type
            WHEN 'monthly' THEN
                -- CORRECCIÓN: prorrateo por el período REAL de pago (antes: siempre 30 días)
                v_installment_fee := (v_basis * loan_record.late_fee_rate / 100)
                                     * CEIL(v_days::DECIMAL / v_period_days);
            WHEN 'compound' THEN
                v_installment_fee := v_basis * (POWER(1 + loan_record.late_fee_rate / 100, v_days) - 1);
            ELSE
                v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * v_days;
        END CASE;

        IF COALESCE(loan_record.max_late_fee, 0) > 0 THEN
            v_installment_fee := LEAST(v_installment_fee, loan_record.max_late_fee);
        END IF;

        v_installment_fee := GREATEST(0, v_installment_fee - COALESCE(inst.late_fee_paid, 0));
        v_total_fee := v_total_fee + ROUND(v_installment_fee, 2);
    END LOOP;

    -- Préstamos legados sin filas en `installments`
    IF NOT v_found_installments AND loan_record.next_payment_date IS NOT NULL THEN
        v_days := GREATEST(
            0,
            (p_calculation_date - loan_record.next_payment_date) - COALESCE(loan_record.grace_period_days, 0)
        );
        v_max_days := v_days;
        IF v_days > 0 THEN
            v_basis := COALESCE(loan_record.amount, 0) / GREATEST(1, COALESCE(loan_record.term_months, 1));
            CASE loan_record.late_fee_calculation_type
                WHEN 'monthly' THEN
                    v_installment_fee := (v_basis * loan_record.late_fee_rate / 100)
                                         * CEIL(v_days::DECIMAL / v_period_days);
                WHEN 'compound' THEN
                    v_installment_fee := v_basis * (POWER(1 + loan_record.late_fee_rate / 100, v_days) - 1);
                ELSE
                    v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * v_days;
            END CASE;
            IF COALESCE(loan_record.max_late_fee, 0) > 0 THEN
                v_installment_fee := LEAST(v_installment_fee, loan_record.max_late_fee);
            END IF;
            v_total_fee := ROUND(v_installment_fee, 2);
        END IF;
    END IF;

    RETURN QUERY SELECT v_max_days, v_total_fee::DECIMAL(14,2), v_total_fee::DECIMAL(14,2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- `calculate_late_fee` y `update_all_late_fees*` delegan en la función de arriba, así que
-- heredan las correcciones. Se recrean solo para fijar `search_path`.
CREATE OR REPLACE FUNCTION calculate_late_fee(
    p_loan_id UUID,
    p_calculation_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    days_overdue INTEGER,
    late_fee_amount DECIMAL(14,2),
    total_late_fee DECIMAL(14,2)
) AS $$
BEGIN
    RETURN QUERY SELECT * FROM recalculate_late_fee_from_scratch(p_loan_id, p_calculation_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION update_loan_remaining_balance(p_loan_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.loans
    SET remaining_balance = calculate_loan_remaining_balance(p_loan_id)
    WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION update_loan_next_payment_date(p_loan_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.loans
    SET next_payment_date = calculate_loan_next_payment_date(p_loan_id)
    WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION trigger_update_loan_balance_and_date_from_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_loan_remaining_balance(OLD.loan_id);
        PERFORM update_loan_next_payment_date(OLD.loan_id);
        RETURN OLD;
    ELSE
        PERFORM update_loan_remaining_balance(NEW.loan_id);
        PERFORM update_loan_next_payment_date(NEW.loan_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION trigger_update_loan_balance_and_date_from_installment()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_loan_remaining_balance(OLD.loan_id);
        PERFORM update_loan_next_payment_date(OLD.loan_id);
        RETURN OLD;
    ELSE
        PERFORM update_loan_remaining_balance(NEW.loan_id);
        PERFORM update_loan_next_payment_date(NEW.loan_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Recalcular todos los préstamos con la lógica corregida
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_loan RECORD;
BEGIN
    FOR v_loan IN SELECT id FROM public.loans LOOP
        PERFORM update_loan_remaining_balance(v_loan.id);
        PERFORM update_loan_next_payment_date(v_loan.id);
    END LOOP;
END $$;

COMMENT ON FUNCTION calculate_loan_next_payment_date(UUID) IS
'Devuelve la fecha del próximo pago. Corregido 2026-08-28: ya NO empuja la fecha al futuro cuando el préstamo está atrasado (eso marcaba como pagadas las cuotas vencidas y ponía su mora en 0), y calcula el interés por período y los períodos transcurridos según la frecuencia de pago real, no siempre mensual.';

COMMENT ON FUNCTION loan_add_periods(DATE, INTEGER, TEXT) IS
'Suma N períodos de la frecuencia indicada a una fecha. Equivalente SQL de addPeriodsToDate() en src/utils/frequencyUtils.ts.';
