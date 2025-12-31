-- Migración para actualizar automáticamente remaining_balance en la BD
-- Esto asegura que los datos vengan correctos desde la BD sin necesidad de calcular en el frontend

-- Función para calcular remaining_balance correctamente (incluyendo cargos)
CREATE OR REPLACE FUNCTION calculate_loan_remaining_balance(p_loan_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_loan RECORD;
    v_correct_total_amount DECIMAL(10,2);
    v_total_interest DECIMAL(10,2);
    v_total_charges_amount DECIMAL(10,2) := 0;
    v_total_amount_with_charges DECIMAL(10,2);
    v_total_paid DECIMAL(10,2) := 0;
    v_remaining_balance DECIMAL(10,2);
    v_pending_interest DECIMAL(10,2) := 0;
BEGIN
    -- Obtener datos del préstamo
    SELECT 
        id, amount, interest_rate, term_months, total_amount, amortization_type, start_date
    INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Para préstamos indefinidos, calcular interés pendiente
    IF v_loan.amortization_type = 'indefinite' THEN
        -- Calcular interés pendiente basado en cuotas esperadas vs pagadas
        -- Esto es una simplificación - en producción podría necesitar más lógica
        SELECT COALESCE(SUM(interest_amount), 0)
        INTO v_pending_interest
        FROM public.installments
        WHERE loan_id = p_loan_id AND is_paid = false;
        
        -- Si no hay installments, calcular basado en meses transcurridos
        IF v_pending_interest = 0 THEN
            DECLARE
                v_months_elapsed INTEGER;
                v_interest_per_month DECIMAL(10,2);
                v_total_expected_interest DECIMAL(10,2);
                v_paid_interest DECIMAL(10,2);
            BEGIN
                v_months_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_loan.start_date::DATE)) * 12 
                                  + EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_loan.start_date::DATE));
                v_months_elapsed := GREATEST(0, v_months_elapsed);
                
                v_interest_per_month := v_loan.amount * (v_loan.interest_rate / 100);
                v_total_expected_interest := v_interest_per_month * GREATEST(1, v_months_elapsed + 1);
                
                SELECT COALESCE(SUM(interest_amount), 0)
                INTO v_paid_interest
                FROM public.payments
                WHERE loan_id = p_loan_id;
                
                v_pending_interest := GREATEST(0, v_total_expected_interest - v_paid_interest);
            END;
        END IF;
        
        RETURN v_loan.amount + v_pending_interest;
    END IF;
    
    -- Para otros tipos de préstamos, calcular con cargos incluidos
    -- Calcular el total correcto (capital + interés total)
    v_correct_total_amount := v_loan.total_amount;
    IF v_correct_total_amount IS NULL OR v_correct_total_amount <= v_loan.amount THEN
        v_total_interest := v_loan.amount * (v_loan.interest_rate / 100) * v_loan.term_months;
        v_correct_total_amount := v_loan.amount + v_total_interest;
    END IF;
    
    -- Calcular el total de TODOS los cargos (installments con interest_amount = 0 y principal_amount = total_amount)
    -- CORRECCIÓN: Usar comparación con tolerancia para manejar posibles diferencias por redondeo
    -- Un cargo es cuando interest_amount es 0 (o muy cercano a 0) y principal_amount es igual (o muy cercano) a total_amount
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total_charges_amount
    FROM public.installments
    WHERE loan_id = p_loan_id
      AND ABS(interest_amount) < 0.01  -- interest_amount es 0 (con tolerancia para redondeo)
      AND ABS(principal_amount - total_amount) < 0.01;  -- principal_amount = total_amount (con tolerancia)
    
    -- Calcular el total del préstamo incluyendo cargos
    v_total_amount_with_charges := v_correct_total_amount + v_total_charges_amount;
    
    -- Calcular el total pagado (capital + interés de todos los pagos)
    SELECT COALESCE(SUM(principal_amount + interest_amount), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE loan_id = p_loan_id;
    
    -- El balance restante es el total (préstamo + cargos) menos lo pagado
    v_remaining_balance := GREATEST(0, v_total_amount_with_charges - v_total_paid);
    
    RETURN v_remaining_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para actualizar remaining_balance de un préstamo
CREATE OR REPLACE FUNCTION update_loan_remaining_balance(p_loan_id UUID)
RETURNS VOID AS $$
DECLARE
    v_new_balance DECIMAL(10,2);
BEGIN
    v_new_balance := calculate_loan_remaining_balance(p_loan_id);
    
    UPDATE public.loans
    SET remaining_balance = v_new_balance
    WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTA: Los triggers antiguos que solo actualizaban balance se han eliminado
-- Ahora usamos triggers que actualizan tanto balance como fecha (ver más abajo)

-- Función para calcular next_payment_date correctamente (primera cuota/cargo pendiente)
CREATE OR REPLACE FUNCTION calculate_loan_next_payment_date(p_loan_id UUID)
RETURNS DATE AS $$
DECLARE
    v_first_unpaid_date DATE;
    v_start_date DATE;
    v_first_payment_date DATE;
    v_frequency TEXT;
    v_paid_interest DECIMAL(10,2) := 0;
    v_interest_per_payment DECIMAL(10,2);
    v_months_elapsed INTEGER;
    v_total_expected INTEGER;
    v_paid_count INTEGER;
    v_pending_count INTEGER;
    v_next_payment_month DATE;
    v_loan_status TEXT;
    v_end_date DATE;
    v_term_months INTEGER;
    v_loan_id UUID;
    v_loan_amortization_type TEXT;
    v_loan_start_date DATE;
    v_loan_first_payment_date DATE;
    v_loan_payment_frequency TEXT;
    v_loan_amount DECIMAL(10,2);
    v_loan_interest_rate DECIMAL(5,2);
BEGIN
    -- Obtener datos del préstamo
    SELECT 
        id, amortization_type, start_date, first_payment_date, payment_frequency, 
        amount, interest_rate, status, end_date, term_months
    INTO 
        v_loan_id, v_loan_amortization_type, v_loan_start_date, v_loan_first_payment_date,
        v_loan_payment_frequency, v_loan_amount, v_loan_interest_rate,
        v_loan_status, v_end_date, v_term_months
    FROM public.loans
    WHERE id = p_loan_id;
    
    IF NOT FOUND THEN
        -- Si no se encuentra el préstamo, retornar fecha por defecto
        RETURN CURRENT_DATE;
    END IF;
    
    -- Si el préstamo está pagado/completado, retornar end_date o una fecha futura
    IF v_loan_status = 'paid' OR v_loan_status = 'settled' THEN
        IF v_end_date IS NOT NULL THEN
            RETURN v_end_date;
        ELSE
            -- Si no hay end_date, retornar fecha actual
            RETURN CURRENT_DATE;
        END IF;
    END IF;
    
    -- Para préstamos con cuotas fijas, buscar la primera cuota/cargo pendiente
    IF v_loan_amortization_type != 'indefinite' THEN
        -- Buscar la primera cuota/cargo pendiente ordenada por fecha de vencimiento
        SELECT MIN(due_date)
        INTO v_first_unpaid_date
        FROM public.installments
        WHERE loan_id = p_loan_id
          AND is_paid = false
          AND due_date IS NOT NULL;
        
        IF v_first_unpaid_date IS NOT NULL THEN
            RETURN v_first_unpaid_date;
        END IF;
        
        -- Si no hay cuotas pendientes pero el préstamo no está pagado, usar end_date o fecha calculada
        IF v_end_date IS NOT NULL AND v_end_date >= CURRENT_DATE THEN
            RETURN v_end_date;
        ELSIF v_loan_start_date IS NOT NULL AND v_term_months IS NOT NULL THEN
            -- Calcular fecha basada en start_date y term_months
            RETURN (v_loan_start_date + (v_term_months || ' months')::INTERVAL)::DATE;
        END IF;
        
        -- Fallback: retornar fecha actual o start_date + 1 mes
        IF v_loan_start_date IS NOT NULL THEN
            RETURN (v_loan_start_date + INTERVAL '1 month')::DATE;
        END IF;
        
        RETURN CURRENT_DATE;
    END IF;
    
    -- Para préstamos indefinidos, calcular basado en el tiempo transcurrido
    IF v_loan_amortization_type = 'indefinite' AND v_loan_start_date IS NOT NULL THEN
        v_start_date := v_loan_start_date::DATE;
        
        -- Calcular first_payment_date
        IF v_loan_first_payment_date IS NOT NULL THEN
            v_first_payment_date := v_loan_first_payment_date::DATE;
        ELSE
            v_first_payment_date := v_start_date;
            v_frequency := COALESCE(v_loan_payment_frequency, 'monthly');
            
            -- Calcular la primera fecha de pago según la frecuencia
            CASE v_frequency
                WHEN 'daily' THEN
                    v_first_payment_date := (v_start_date + INTERVAL '1 day')::DATE;
                WHEN 'weekly' THEN
                    v_first_payment_date := (v_start_date + INTERVAL '7 days')::DATE;
                WHEN 'biweekly' THEN
                    v_first_payment_date := (v_start_date + INTERVAL '14 days')::DATE;
                WHEN 'monthly' THEN
                    -- Preservar el día del mes
                    v_first_payment_date := (v_start_date + INTERVAL '1 month')::DATE;
                ELSE
                    -- Default monthly
                    v_first_payment_date := (v_start_date + INTERVAL '1 month')::DATE;
            END CASE;
        END IF;
        
        -- Calcular meses transcurridos desde first_payment_date hasta hoy
        v_months_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_first_payment_date)) * 12 
                          + EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_first_payment_date));
        v_months_elapsed := GREATEST(0, v_months_elapsed);
        
        -- Calcular interés por pago
        v_interest_per_payment := v_loan_amount * (v_loan_interest_rate / 100);
        
        -- Calcular cuántas cuotas se han pagado basándose en los pagos de interés
        SELECT COALESCE(SUM(interest_amount), 0)
        INTO v_paid_interest
        FROM public.payments
        WHERE loan_id = p_loan_id;
        
        -- Calcular número de cuotas pagadas
        IF v_interest_per_payment > 0 THEN
            v_paid_count := FLOOR(v_paid_interest / v_interest_per_payment);
        ELSE
            v_paid_count := 0;
        END IF;
        
        -- La próxima cuota no pagada es la cuota (paidCount + 1)
        -- Si se pagaron 4 cuotas, la próxima es la cuota 5
        -- La cuota 5 está a paidCount períodos de la primera cuota
        v_frequency := COALESCE(v_loan_payment_frequency, 'monthly');
        
        IF v_frequency = 'monthly' THEN
            v_next_payment_month := (v_first_payment_date + (v_paid_count || ' months')::INTERVAL)::DATE;
            
            -- Si la fecha calculada es en el pasado o es hoy, usar el siguiente mes
            IF v_next_payment_month <= CURRENT_DATE THEN
                v_next_payment_month := (v_first_payment_date + ((v_paid_count + 1) || ' months')::INTERVAL)::DATE;
            END IF;
            
            RETURN v_next_payment_month;
        ELSE
            -- Para otras frecuencias, calcular basándose en períodos
            CASE v_frequency
                WHEN 'daily' THEN
                    v_next_payment_month := (v_first_payment_date + (v_paid_count || ' days')::INTERVAL)::DATE;
                WHEN 'weekly' THEN
                    v_next_payment_month := (v_first_payment_date + (v_paid_count * 7 || ' days')::INTERVAL)::DATE;
                WHEN 'biweekly' THEN
                    v_next_payment_month := (v_first_payment_date + (v_paid_count * 14 || ' days')::INTERVAL)::DATE;
                ELSE
                    v_next_payment_month := (v_first_payment_date + (v_paid_count || ' months')::INTERVAL)::DATE;
            END CASE;
            
            -- Asegurar que la fecha no sea en el pasado
            IF v_next_payment_month <= CURRENT_DATE THEN
                CASE v_frequency
                    WHEN 'daily' THEN
                        v_next_payment_month := (v_next_payment_month + INTERVAL '1 day')::DATE;
                    WHEN 'weekly' THEN
                        v_next_payment_month := (v_next_payment_month + INTERVAL '7 days')::DATE;
                    WHEN 'biweekly' THEN
                        v_next_payment_month := (v_next_payment_month + INTERVAL '14 days')::DATE;
                    ELSE
                        v_next_payment_month := (v_next_payment_month + INTERVAL '1 month')::DATE;
                END CASE;
            END IF;
            
            RETURN v_next_payment_month;
        END IF;
    END IF;
    
    -- Fallback final: retornar fecha actual si nada más funciona
    RETURN CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para actualizar next_payment_date de un préstamo
CREATE OR REPLACE FUNCTION update_loan_next_payment_date(p_loan_id UUID)
RETURNS VOID AS $$
DECLARE
    v_new_date DATE;
BEGIN
    v_new_date := calculate_loan_next_payment_date(p_loan_id);
    
    UPDATE public.loans
    SET next_payment_date = v_new_date
    WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar los triggers para que también actualicen next_payment_date
CREATE OR REPLACE FUNCTION trigger_update_loan_balance_and_date_from_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Actualizar tanto el balance como la fecha del préstamo afectado
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar los triggers para que también actualicen next_payment_date
CREATE OR REPLACE FUNCTION trigger_update_loan_balance_and_date_from_installment()
RETURNS TRIGGER AS $$
BEGIN
    -- Actualizar tanto el balance como la fecha del préstamo afectado
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear triggers que actualizan tanto remaining_balance como next_payment_date
-- Eliminar cualquier trigger existente (antiguo o nuevo) antes de crear
-- Primero eliminar todos los triggers antiguos que solo actualizaban balance
DROP TRIGGER IF EXISTS update_loan_balance_on_payment_insert ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_on_payment_update ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_on_payment_delete ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_on_installment_insert ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_on_installment_update ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_on_installment_delete ON public.installments;
-- Ahora eliminar los triggers nuevos (por si ya existen de una ejecución anterior)
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_insert ON public.payments;
CREATE TRIGGER update_loan_balance_and_date_on_payment_insert
    AFTER INSERT ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_update ON public.payments;
CREATE TRIGGER update_loan_balance_and_date_on_payment_update
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (OLD.principal_amount IS DISTINCT FROM NEW.principal_amount 
       OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount)
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_delete ON public.payments;
CREATE TRIGGER update_loan_balance_and_date_on_payment_delete
    AFTER DELETE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_insert ON public.installments;
CREATE TRIGGER update_loan_balance_and_date_on_installment_insert
    AFTER INSERT ON public.installments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_update ON public.installments;
CREATE TRIGGER update_loan_balance_and_date_on_installment_update
    AFTER UPDATE ON public.installments
    FOR EACH ROW
    WHEN (OLD.total_amount IS DISTINCT FROM NEW.total_amount 
       OR OLD.principal_amount IS DISTINCT FROM NEW.principal_amount
       OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount
       OR OLD.is_paid IS DISTINCT FROM NEW.is_paid
       OR OLD.due_date IS DISTINCT FROM NEW.due_date)
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_delete ON public.installments;
CREATE TRIGGER update_loan_balance_and_date_on_installment_delete
    AFTER DELETE ON public.installments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

-- Actualizar todos los remaining_balance y next_payment_date existentes para que estén correctos desde el inicio
-- Esto se ejecuta una vez al aplicar la migración
DO $$
DECLARE
    v_loan RECORD;
BEGIN
    FOR v_loan IN SELECT id FROM public.loans LOOP
        PERFORM update_loan_remaining_balance(v_loan.id);
        PERFORM update_loan_next_payment_date(v_loan.id);
    END LOOP;
END $$;

