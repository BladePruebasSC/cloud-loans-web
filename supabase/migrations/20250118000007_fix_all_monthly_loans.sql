-- Migración para corregir TODOS los préstamos mensuales
-- Actualizar todas las fechas de cuotas para préstamos mensuales

UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 month' + (installments.installment_number - 1) * INTERVAL '1 month'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'monthly';

-- Verificar que se actualizaron correctamente
SELECT 
  l.id,
  l.start_date,
  l.payment_frequency,
  l.next_payment_date,
  COUNT(i.id) as installments_count,
  MIN(i.due_date) as first_due_date,
  MAX(i.due_date) as last_due_date
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly'
GROUP BY l.id, l.start_date, l.payment_frequency, l.next_payment_date
ORDER BY l.start_date DESC
LIMIT 10;
