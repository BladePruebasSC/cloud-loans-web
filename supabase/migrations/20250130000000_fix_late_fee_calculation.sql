-- Función para recalcular mora desde cero (sin acumular)
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
    
    -- Calcular días de mora (considerando el período de gracia correctamente)
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

-- Función para actualizar mora de todos los préstamos recalculando desde cero
CREATE OR REPLACE FUNCTION update_all_late_fees_from_scratch(p_calculation_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
    loan_record RECORD;
    updated_count INTEGER := 0;
    fee_calculation RECORD;
BEGIN
    -- Obtener todos los préstamos activos con pagos vencidos
    FOR loan_record IN 
        SELECT l.id, l.next_payment_date, l.grace_period_days, l.late_fee_enabled
        FROM public.loans l
        WHERE l.status = 'active' 
        AND l.late_fee_enabled = true
        AND l.next_payment_date < p_calculation_date
    LOOP
        -- Recalcular mora desde cero para este préstamo
        SELECT * INTO fee_calculation
        FROM recalculate_late_fee_from_scratch(loan_record.id, p_calculation_date);
        
        -- Actualizar el préstamo con la nueva mora (recalculada desde cero)
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
        
        -- Registrar en el historial si hay mora
        IF fee_calculation.late_fee_amount > 0 THEN
            INSERT INTO public.late_fee_history (
                loan_id, 
                calculation_date, 
                days_overdue, 
                late_fee_rate, 
                late_fee_amount, 
                total_late_fee
            ) VALUES (
                loan_record.id,
                p_calculation_date,
                fee_calculation.days_overdue,
                (SELECT late_fee_rate FROM public.loans WHERE id = loan_record.id),
                fee_calculation.late_fee_amount,
                fee_calculation.total_late_fee
            );
        END IF;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
