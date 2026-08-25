-- ============================================================================
-- CORRECCIÓN: funciones SQL de mora calculaban sobre "remaining_balance" completo
-- ============================================================================
-- Auditoría de cálculos (2026-08-25): las funciones `recalculate_late_fee_from_scratch`,
-- `update_all_late_fees_from_scratch`, `calculate_late_fee` y `update_all_late_fees`
-- calculaban la mora como:
--
--      mora = remaining_balance_de_TODO_el_prestamo * tasa * dias_de_UNA_sola_cuota
--
-- Esto es incorrecto: `remaining_balance` incluye el capital e interés de TODAS las cuotas
-- pendientes (no solo la vencida), y los días usados eran los de una única fecha
-- (`next_payment_date`), no los de cada cuota vencida individualmente. El resultado podía
-- ser varias veces mayor (o distinto) al valor correcto, y no coincidía con la mora que
-- calcula el resto de la aplicación (que sí recorre la tabla `installments` cuota por cuota).
--
-- Desde esta corrección, el frontend (src/hooks/useLateFee.tsx, GlobalLateFeeConfig.tsx) ya
-- NO llama a estas funciones SQL: usa directamente `getLateFeeBreakdownFromInstallments`
-- (TypeScript), que es la única fuente de verdad para la mora en toda la aplicación.
--
-- Esta migración corrige las funciones SQL de todos modos, como red de seguridad, por si
-- algún proceso futuro (cron, RPC directo, script de mantenimiento) las invoca: ahora suman
-- la mora cuota por cuota (tabla `installments`), igual que el cálculo en TypeScript, en vez
-- de aplicar la tasa a todo el saldo restante del préstamo con un único conteo de días.
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_late_fee_from_scratch(
    p_loan_id UUID,
    p_calculation_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    days_overdue INTEGER,
    late_fee_amount DECIMAL(10,2),
    total_late_fee DECIMAL(10,2)
) AS $$
DECLARE
    loan_record RECORD;
    inst RECORD;
    v_is_indefinite BOOLEAN;
    v_is_charge BOOLEAN;
    v_basis DECIMAL(14,2);
    v_days INTEGER;
    v_installment_fee DECIMAL(14,2);
    v_total_fee DECIMAL(14,2) := 0;
    v_min_days INTEGER := NULL;
    v_found_installments BOOLEAN := false;
BEGIN
    SELECT l.* INTO loan_record
    FROM public.loans l
    WHERE l.id = p_loan_id;

    IF NOT FOUND OR loan_record.status NOT IN ('active', 'overdue') OR NOT COALESCE(loan_record.late_fee_enabled, false) THEN
        RETURN QUERY SELECT 0, 0.0::DECIMAL(10,2), 0.0::DECIMAL(10,2);
        RETURN;
    END IF;

    v_is_indefinite := lower(coalesce(loan_record.amortization_type, '')) = 'indefinite';

    -- Recorrer cada cuota pendiente (tal como hace getLateFeeBreakdownFromInstallments en TS)
    FOR inst IN
        SELECT *
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND COALESCE(is_paid, false) = false
          AND due_date IS NOT NULL
        ORDER BY due_date ASC
    LOOP
        v_found_installments := true;

        v_days := GREATEST(0, (p_calculation_date - inst.due_date::date) - COALESCE(loan_record.grace_period_days, 0));

        IF v_min_days IS NULL OR v_days < v_min_days THEN
            v_min_days := v_days;
        END IF;

        IF v_days <= 0 THEN
            CONTINUE;
        END IF;

        v_is_charge := ABS(COALESCE(inst.interest_amount, 0)) < 0.01 AND COALESCE(inst.principal_amount, 0) > 0.01;

        IF v_is_charge THEN
            -- Cargo: la base de mora es el monto total del cargo
            v_basis := COALESCE(inst.total_amount, inst.principal_amount, 0);
        ELSIF v_is_indefinite THEN
            -- Préstamo indefinido, cuota regular: no hay capital, la base es el interés del período
            v_basis := COALESCE(inst.interest_amount, inst.total_amount, 0);
        ELSE
            -- Préstamo a plazo fijo: la mora se calcula sobre el capital de la cuota
            v_basis := COALESCE(inst.principal_amount, inst.total_amount, 0);
        END IF;

        CASE loan_record.late_fee_calculation_type
            WHEN 'monthly' THEN
                v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * CEIL(v_days::DECIMAL / 30);
            WHEN 'compound' THEN
                v_installment_fee := v_basis * (POWER(1 + loan_record.late_fee_rate / 100, v_days) - 1);
            ELSE
                v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * v_days;
        END CASE;

        IF loan_record.max_late_fee > 0 THEN
            v_installment_fee := LEAST(v_installment_fee, loan_record.max_late_fee);
        END IF;

        -- Descontar la mora ya pagada de esta cuota específica
        v_installment_fee := GREATEST(0, v_installment_fee - COALESCE(inst.late_fee_paid, 0));

        v_total_fee := v_total_fee + ROUND(v_installment_fee, 2);
    END LOOP;

    -- Préstamos sin filas en `installments` (datos legados): usar next_payment_date como respaldo
    -- mínimo, sobre el capital pendiente (nunca sobre el saldo total con interés de cuotas futuras).
    IF NOT v_found_installments AND loan_record.next_payment_date IS NOT NULL THEN
        v_days := GREATEST(0, (p_calculation_date - loan_record.next_payment_date) - COALESCE(loan_record.grace_period_days, 0));
        v_min_days := v_days;
        IF v_days > 0 THEN
            v_basis := COALESCE(loan_record.amount, 0) / GREATEST(1, COALESCE(loan_record.term_months, 1));
            CASE loan_record.late_fee_calculation_type
                WHEN 'monthly' THEN
                    v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * CEIL(v_days::DECIMAL / 30);
                WHEN 'compound' THEN
                    v_installment_fee := v_basis * (POWER(1 + loan_record.late_fee_rate / 100, v_days) - 1);
                ELSE
                    v_installment_fee := (v_basis * loan_record.late_fee_rate / 100) * v_days;
            END CASE;
            IF loan_record.max_late_fee > 0 THEN
                v_installment_fee := LEAST(v_installment_fee, loan_record.max_late_fee);
            END IF;
            v_total_fee := ROUND(v_installment_fee, 2);
        END IF;
    END IF;

    IF v_min_days IS NULL THEN
        v_min_days := 0;
    END IF;

    RETURN QUERY SELECT v_min_days, v_total_fee::DECIMAL(10,2), v_total_fee::DECIMAL(10,2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- update_all_late_fees_from_scratch ya delega en recalculate_late_fee_from_scratch, así que
-- hereda la corrección automáticamente. Se vuelve a crear igual (sin cambios de lógica propia)
-- únicamente para dejar constancia y evitar dependencias de una versión antigua en caché.
CREATE OR REPLACE FUNCTION update_all_late_fees_from_scratch(p_calculation_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
    loan_record RECORD;
    updated_count INTEGER := 0;
    fee_calculation RECORD;
BEGIN
    FOR loan_record IN
        SELECT l.id, l.next_payment_date, l.grace_period_days, l.late_fee_enabled
        FROM public.loans l
        WHERE l.status IN ('active', 'overdue')
          AND l.late_fee_enabled = true
    LOOP
        SELECT * INTO fee_calculation
        FROM recalculate_late_fee_from_scratch(loan_record.id, p_calculation_date);

        UPDATE public.loans
        SET
            current_late_fee = fee_calculation.total_late_fee,
            last_late_fee_calculation = p_calculation_date,
            status = CASE
                WHEN fee_calculation.days_overdue > 0 AND status = 'active' THEN 'overdue'
                WHEN fee_calculation.days_overdue = 0 AND status = 'overdue' THEN 'active'
                ELSE status
            END
        WHERE id = loan_record.id;

        IF fee_calculation.late_fee_amount > 0 THEN
            INSERT INTO public.late_fee_history (
                loan_id, calculation_date, days_overdue, late_fee_rate, late_fee_amount, total_late_fee
            ) VALUES (
                loan_record.id, p_calculation_date, fee_calculation.days_overdue,
                (SELECT late_fee_rate FROM public.loans WHERE id = loan_record.id),
                fee_calculation.late_fee_amount, fee_calculation.total_late_fee
            );
        END IF;

        updated_count := updated_count + 1;
    END LOOP;

    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- calculate_late_fee (la versión más antigua, de 20250129000000_add_mora_fields.sql) tenía además
-- un bug de ACUMULACIÓN: sumaba la mora nueva sobre `current_late_fee` en cada llamada
-- (`total_late_fee := loan_record.current_late_fee + late_fee_amount`), por lo que la mora crecía
-- cada vez que se ejecutaba, incluso sin nuevos días de atraso. Nada en el frontend la llama hoy,
-- pero se corrige por las mismas razones de seguridad: que delegue en la versión "from_scratch".
CREATE OR REPLACE FUNCTION calculate_late_fee(
    p_loan_id UUID,
    p_calculation_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    days_overdue INTEGER,
    late_fee_amount DECIMAL(10,2),
    total_late_fee DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY SELECT * FROM recalculate_late_fee_from_scratch(p_loan_id, p_calculation_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_all_late_fees(p_calculation_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN update_all_late_fees_from_scratch(p_calculation_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION recalculate_late_fee_from_scratch(UUID, DATE) IS
'Calcula la mora de un préstamo sumando la mora de cada cuota vencida individualmente (tabla installments), igual que getLateFeeBreakdownFromInstallments en TypeScript. Corregido 2026-08-25: antes aplicaba la tasa al remaining_balance completo del préstamo en vez de al capital/interés de cada cuota vencida.';
