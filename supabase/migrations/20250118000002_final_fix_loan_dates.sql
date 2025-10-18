-- Migración final para corregir completamente las fechas de préstamos
-- 1. Actualizar next_payment_date en loans para que sea la primera cuota
UPDATE loans 
SET next_payment_date = start_date::date + INTERVAL '1 month'
WHERE payment_frequency = 'monthly';

-- 2. Actualizar todas las fechas de installments
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 month' + (installments.installment_number - 1) * INTERVAL '1 month'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'monthly';

-- 3. Verificar que se actualizaron los registros
SELECT 
  l.id,
  l.start_date,
  l.next_payment_date,
  l.payment_frequency,
  COUNT(i.id) as installments_count
FROM loans l
LEFT JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly'
GROUP BY l.id, l.start_date, l.next_payment_date, l.payment_frequency;
