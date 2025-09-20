-- Agregar campos para el sistema de mora
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS late_fee_rate DECIMAL(5,2) DEFAULT 2.0; -- Tasa de mora por día (porcentaje)
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0; -- Días de gracia antes de aplicar mora
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS max_late_fee DECIMAL(10,2) DEFAULT 0; -- Mora máxima permitida (0 = sin límite)
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS late_fee_calculation_type TEXT DEFAULT 'daily' CHECK (late_fee_calculation_type IN ('daily', 'monthly', 'compound')); -- Tipo de cálculo de mora
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS current_late_fee DECIMAL(10,2) DEFAULT 0; -- Mora actual acumulada
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS last_late_fee_calculation DATE; -- Última fecha de cálculo de mora
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS total_late_fee_paid DECIMAL(10,2) DEFAULT 0; -- Total de mora pagada

-- Agregar campos a la tabla de pagos para mejor tracking de mora
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS late_fee_days INTEGER DEFAULT 0; -- Días de mora al momento del pago
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS late_fee_rate_applied DECIMAL(5,2) DEFAULT 0; -- Tasa de mora aplicada

-- Crear tabla para historial de cálculos de mora
CREATE TABLE IF NOT EXISTS public.late_fee_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    days_overdue INTEGER NOT NULL,
    late_fee_rate DECIMAL(5,2) NOT NULL,
    late_fee_amount DECIMAL(10,2) NOT NULL,
    total_late_fee DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_loans_next_payment_date ON public.loans(next_payment_date);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_late_fee_history_loan_id ON public.late_fee_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_late_fee_history_calculation_date ON public.late_fee_history(calculation_date);

-- Habilitar RLS para la nueva tabla
ALTER TABLE public.late_fee_history ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS para late_fee_history
CREATE POLICY "Users can view late fee history for their company loans" ON public.late_fee_history
    FOR SELECT USING (
        loan_id IN (
            SELECT l.id FROM public.loans l
            JOIN public.clients c ON l.client_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert late fee history for their company loans" ON public.late_fee_history
    FOR INSERT WITH CHECK (
        loan_id IN (
            SELECT l.id FROM public.loans l
            JOIN public.clients c ON l.client_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

-- Función para calcular mora automáticamente
CREATE OR REPLACE FUNCTION calculate_late_fee(
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
    
    -- Calcular días de mora
    days_overdue := GREATEST(0, p_calculation_date - loan_record.next_payment_date - loan_record.grace_period_days);
    
    -- Si no hay días de mora, retornar ceros
    IF days_overdue <= 0 THEN
        RETURN QUERY SELECT 0, 0.0, loan_record.current_late_fee;
        RETURN;
    END IF;
    
    -- Calcular mora según el tipo
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
    
    -- Calcular mora total (mora actual + nueva mora)
    total_late_fee := loan_record.current_late_fee + late_fee_amount;
    
    RETURN QUERY SELECT days_overdue, late_fee_amount, total_late_fee;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para actualizar mora de todos los préstamos vencidos
CREATE OR REPLACE FUNCTION update_all_late_fees(p_calculation_date DATE DEFAULT CURRENT_DATE)
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
        -- Calcular mora para este préstamo
        SELECT * INTO fee_calculation
        FROM calculate_late_fee(loan_record.id, p_calculation_date);
        
        -- Actualizar el préstamo con la nueva mora
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
