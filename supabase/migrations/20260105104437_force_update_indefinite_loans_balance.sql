-- Migración para asegurar que los triggers funcionen instantáneamente
-- Los triggers deben ejecutarse automáticamente en cada INSERT/UPDATE/DELETE

-- Asegurar que los triggers estén activos y funcionando correctamente
-- Eliminar y recrear los triggers para garantizar que funcionen
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_insert ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_update ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_installment_delete ON public.installments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_insert ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_update ON public.payments;
DROP TRIGGER IF EXISTS update_loan_balance_and_date_on_payment_delete ON public.payments;

-- Recrear todos los triggers para installments
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

-- Recrear todos los triggers para payments
CREATE TRIGGER update_loan_balance_and_date_on_payment_insert
    AFTER INSERT ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

CREATE TRIGGER update_loan_balance_and_date_on_payment_update
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (OLD.principal_amount IS DISTINCT FROM NEW.principal_amount 
       OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount)
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

CREATE TRIGGER update_loan_balance_and_date_on_payment_delete
    AFTER DELETE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_loan_balance_and_date_from_payment();

-- Actualizar todos los balances inmediatamente para que estén correctos
DO $$
DECLARE
    v_loan RECORD;
BEGIN
    FOR v_loan IN SELECT id FROM public.loans LOOP
        PERFORM update_loan_remaining_balance(v_loan.id);
        PERFORM update_loan_next_payment_date(v_loan.id);
    END LOOP;
END $$;

