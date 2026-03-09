-- Migration: Recalcular paid_amount de cargos desde la tabla payments
-- Corrige cargos donde los pagos desde el formulario normal no se reflejaron en paid_amount

-- Crear tabla temporal con los valores correctos
CREATE TEMP TABLE IF NOT EXISTS charge_recalc (id UUID, new_paid DECIMAL(12,2), total DECIMAL(12,2));

DO $$
DECLARE
  grp RECORD;
  charge_rec RECORD;
  total_paid DECIMAL(12,2);
  remaining DECIMAL(12,2);
  assign DECIMAL(12,2);
BEGIN
  -- Por cada grupo (loan_id, due_date)
  FOR grp IN (
    SELECT DISTINCT loan_id, due_date::date as due_dt
    FROM installments
    WHERE (interest_amount IS NULL OR interest_amount < 0.01)
      AND ABS(COALESCE(principal_amount, 0) - COALESCE(total_amount, 0)) < 0.01
  ) LOOP
    SELECT COALESCE(SUM(COALESCE(principal_amount, amount, 0)), 0)
    INTO total_paid
    FROM payments
    WHERE loan_id = grp.loan_id
      AND due_date::date = grp.due_dt
      AND (interest_amount IS NULL OR interest_amount < 0.01);

    remaining := total_paid;

    -- Por cada cargo en orden
    FOR charge_rec IN (
      SELECT id, total_amount
      FROM installments
      WHERE loan_id = grp.loan_id
        AND (interest_amount IS NULL OR interest_amount < 0.01)
        AND due_date::date = grp.due_dt
      ORDER BY installment_number
    ) LOOP
      assign := LEAST(GREATEST(remaining, 0), charge_rec.total_amount);
      INSERT INTO charge_recalc (id, new_paid, total) VALUES (charge_rec.id, assign, charge_rec.total_amount);
      remaining := remaining - assign;
    END LOOP;
  END LOOP;
END $$;

-- Aplicar los valores calculados
UPDATE installments i
SET paid_amount = r.new_paid,
    is_paid = (r.new_paid >= r.total - 0.01)
FROM charge_recalc r
WHERE i.id = r.id
  AND (ABS(COALESCE(i.paid_amount, 0) - r.new_paid) > 0.01 OR i.is_paid != (r.new_paid >= r.total - 0.01));
