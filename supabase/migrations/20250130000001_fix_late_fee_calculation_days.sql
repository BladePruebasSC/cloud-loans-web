-- Corregir el cálculo de días de mora en la función recalculate_late_fee_from_scratch
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
    days_overdue INTEGER;
    late_fee_amount DECIMAL(10,2);
    total_late_fee DECIMAL(10,2);
BEGIN
    -- Obtener información del préstamo
    SELECT 
        l.*,
        c.user_id
    INTO loan_record
    FROM public.loans l
    JOIN public.clients c ON l.client_id = c.id
    WHERE l.id = p_loan_id;
    
    -- Verificar que el préstamo existe y está activo
    IF NOT FOUND OR loan_record.status != 'active' THEN
        RETURN;
    END IF;
    
    -- Calcular días de mora correctamente (considerando el período de gracia)
    days_overdue := GREATEST(0, (p_calculation_date - loan_record.next_payment_date) - loan_record.grace_period_days);
    
    -- Si no hay días de mora, retornar ceros
    IF days_overdue <= 0 THEN
        RETURN QUERY SELECT 0, 0.0, 0.0;
        RETURN;
    END IF;
    
    -- Calcular mora según el tipo (desde cero, sin acumular)
    CASE loan_record.late_fee_calculation_type
        WHEN 'daily' THEN
            -- Mora diaria simple
            late_fee_amount := (loan_record.remaining_balance * loan_record.late_fee_rate / 100) * days_overdue;
        WHEN 'monthly' THEN
            -- Mora mensual
            late_fee_amount := (loan_record.remaining_balance * loan_record.late_fee_rate / 100) * CEIL(days_overdue::DECIMAL / 30);
        WHEN 'compound' THEN
            -- Mora compuesta (interés sobre interés)
            late_fee_amount := loan_record.remaining_balance * (POWER(1 + loan_record.late_fee_rate / 100, days_overdue) - 1);
        ELSE
            -- Default a diaria
            late_fee_amount := (loan_record.remaining_balance * loan_record.late_fee_rate / 100) * days_overdue;
    END CASE;
    
    -- Aplicar límite máximo si está configurado
    IF loan_record.max_late_fee > 0 THEN
        late_fee_amount := LEAST(late_fee_amount, loan_record.max_late_fee);
    END IF;
    
    -- La mora total es solo la nueva mora calculada (sin acumular)
    total_late_fee := late_fee_amount;
    
    RETURN QUERY SELECT days_overdue, late_fee_amount, total_late_fee;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
