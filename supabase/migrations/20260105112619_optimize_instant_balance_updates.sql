-- Migración para optimizar y asegurar actualizaciones instantáneas de balance
-- Esta migración garantiza que los triggers se ejecuten inmediatamente y eficientemente

-- Asegurar que los triggers estén activos y funcionando correctamente
-- Eliminar triggers existentes primero
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_insert ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_update ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_delete ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_insert ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_update ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_delete ON public.payments;

-- Recrear los triggers con configuración optimizada para ejecución inmediata
-- Los triggers AFTER se ejecutan inmediatamente después de la transacción

CREATE TRIGGER update_loan_balance_and_date_on_installment_insert
    AFTER INSERT ON public.installments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

CREATE TRIGGER update_loan_balance_and_date_on_installment_update
    AFTER UPDATE ON public.installments
    FOR EACH ROW
    WHEN (OLD.total_amount IS DISTINCT FROM NEW.total_amount 
       OR OLD.principal_amount IS DISTINCT FROM NEW.principal_amount
       OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount
       OR OLD.is_paid IS DISTINCT FROM NEW.is_paid
       OR OLD.due_date IS DISTINCT FROM NEW.due_date)
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

CREATE TRIGGER update_loan_balance_and_date_on_installment_delete
    AFTER DELETE ON public.installments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_installment();

CREATE TRIGGER update_loan_balance_and_date_on_payment_insert
    AFTER INSERT ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

CREATE TRIGGER update_loan_balance_and_date_on_payment_update
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (OLD.principal_amount IS DISTINCT FROM NEW.principal_amount 
       OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount
       OR OLD.amount IS DISTINCT FROM NEW.amount)
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

CREATE TRIGGER update_loan_balance_and_date_on_payment_delete
    AFTER DELETE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

-- Crear índices para mejorar el rendimiento de las consultas en las funciones
-- Estos índices ayudan a que las consultas en calculate_loan_remaining_balance sean más rápidas
CREATE INDEX IF NOT EXISTS idx_installments_loan_id_charges 
    ON public.installments(loan_id) 
    WHERE ABS(interest_amount) < 0.01 
      AND ABS(principal_amount - COALESCE(total_amount, 0)) < 0.01;

CREATE INDEX IF NOT EXISTS idx_installments_loan_id_not_paid 
    ON public.installments(loan_id, is_paid) 
    WHERE is_paid = false;

CREATE INDEX IF NOT EXISTS idx_payments_loan_id_principal 
    ON public.payments(loan_id) 
    WHERE principal_amount > 0;

CREATE INDEX IF NOT EXISTS idx_payments_loan_id 
    ON public.payments(loan_id);

-- Actualizar todos los balances inmediatamente para asegurar consistencia
DO $$
DECLARE
    v_loan RECORD;
BEGIN
    -- Actualizar todos los préstamos (no solo indefinidos, para consistencia)
    FOR v_loan IN SELECT id FROM public.loans LOOP
        PERFORM update_loan_remaining_balance(v_loan.id);
        PERFORM update_loan_next_payment_date(v_loan.id);
    END LOOP;
END $$;

-- Comentario para documentar que los triggers se ejecutan inmediatamente
COMMENT ON FUNCTION trigger_update_loan_balance_and_date_from_installment() IS 
'Trigger function que se ejecuta inmediatamente después de cambios en installments. Actualiza remaining_balance y next_payment_date instantáneamente.';

COMMENT ON FUNCTION trigger_update_loan_balance_and_date_from_payment() IS 
'Trigger function que se ejecuta inmediatamente después de cambios en payments. Actualiza remaining_balance y next_payment_date instantáneamente.';

