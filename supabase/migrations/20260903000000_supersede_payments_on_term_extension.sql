-- ============================================================================
-- Pagos anulados por una extensión de plazo
-- ============================================================================
-- REGLA DE NEGOCIO (decidida por la empresa, 2026-09-01): la extensión de plazo es un
-- recálculo nuevo y NO arrastra lo abonado a cuotas que no estaban terminadas de pagar.
--
-- Ignorarlos solo en el cálculo del frontend no bastaba: el pago seguía en `payments` atado a
-- su fecha de vencimiento, así que la tabla de amortización, el estado de cuenta, el pago
-- avanzado, la ruta de cobro y el propio `calculate_loan_remaining_balance` lo seguían
-- contando. El balance decía una cifra y la lista de cuotas otra.
--
-- SOLUCIÓN: al extender, el pago se DESVINCULA de la cuota — `due_date` pasa a NULL — pero se
-- conserva íntegro:
--   · `original_due_date` guarda a qué cuota se había aplicado (no se pierde el dato),
--   · `superseded_at` y `superseded_reason` dejan constancia de cuándo y por qué,
--   · la fila NO se borra: el dinero se recibió y debe seguir contando como ingreso en los
--     informes, que agrupan por `payment_date` y no por `due_date`.
--
-- Al quedar `due_date` en NULL, todo el código que reparte pagos por fecha de vencimiento deja
-- de contarlo sin necesidad de tocarlo. Lo único que hacía falta cambiar es la función del
-- balance, que suma los pagos sin mirar la fecha.
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_due_date DATE;

COMMENT ON COLUMN public.payments.superseded_at IS
  'Cuándo dejó de aplicarse este pago al préstamo (extensión de plazo). Sigue contando como ingreso.';
COMMENT ON COLUMN public.payments.original_due_date IS
  'Cuota a la que estaba aplicado antes de anularse. `due_date` queda en NULL.';

CREATE INDEX IF NOT EXISTS idx_payments_superseded
  ON public.payments (loan_id)
  WHERE superseded_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- El balance deja de restar los pagos anulados
-- ----------------------------------------------------------------------------
-- Se reescribe la función completa (misma lógica de 20260828000000) añadiendo el filtro
-- `superseded_at IS NULL` a las dos sumas de pagos.
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
            THEN FLOOR((v_paid_interest + 0.01) / v_interest_per_period)::INTEGER
            ELSE 0
        END;

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

        SELECT COALESCE(SUM(principal_amount), 0)
        INTO v_total_paid
        FROM public.payments
        WHERE loan_id = p_loan_id
          AND principal_amount > 0
          AND superseded_at IS NULL;

        v_remaining_balance := GREATEST(
            0, v_loan.amount + v_pending_interest + v_total_charges_amount - v_total_paid
        );
        RETURN v_remaining_balance;
    END IF;

    -- Plazo fijo
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

    -- Los pagos anulados por una extensión de plazo NO reducen el balance.
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE loan_id = p_loan_id
      AND superseded_at IS NULL;

    v_remaining_balance := GREATEST(0, v_total_amount_with_charges - v_total_paid);
    RETURN v_remaining_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
