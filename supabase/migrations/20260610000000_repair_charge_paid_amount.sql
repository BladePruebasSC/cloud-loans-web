-- Repair: recalculate paid_amount and is_paid for cargo installments from actual payments
-- Fixes cases where a payment was deleted but installments.paid_amount was not decremented

DO $$
DECLARE
  grp RECORD;
  charge_rec RECORD;
  total_paid DECIMAL(12,2);
  assign DECIMAL(12,2);
BEGIN
  FOR grp IN (
    SELECT DISTINCT loan_id, due_date::date AS due_dt
    FROM installments
    WHERE (interest_amount IS NULL OR ABS(interest_amount) < 0.01)
      AND ABS(COALESCE(principal_amount, 0) - COALESCE(total_amount, 0)) < 0.01
      AND COALESCE(total_amount, 0) > 0
  ) LOOP
    -- Sum remaining payments for this cargo
    SELECT COALESCE(SUM(COALESCE(principal_amount, amount, 0)), 0)
    INTO total_paid
    FROM payments
    WHERE loan_id = grp.loan_id
      AND due_date::date = grp.due_dt
      AND (interest_amount IS NULL OR interest_amount < 0.01);

    FOR charge_rec IN (
      SELECT id, total_amount, paid_amount, is_paid
      FROM installments
      WHERE loan_id = grp.loan_id
        AND (interest_amount IS NULL OR ABS(interest_amount) < 0.01)
        AND due_date::date = grp.due_dt
      ORDER BY installment_number
    ) LOOP
      assign := LEAST(GREATEST(total_paid, 0), charge_rec.total_amount);

      -- Only update if there's a discrepancy
      IF ABS(COALESCE(charge_rec.paid_amount, 0) - assign) > 0.01
         OR charge_rec.is_paid != (assign >= charge_rec.total_amount - 0.01) THEN
        UPDATE installments
        SET paid_amount = assign,
            is_paid = (assign >= charge_rec.total_amount - 0.01)
        WHERE id = charge_rec.id;
      END IF;

      total_paid := GREATEST(0, total_paid - assign);
    END LOOP;
  END LOOP;
END $$;
