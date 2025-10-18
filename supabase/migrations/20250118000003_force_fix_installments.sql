-- Migración forzada para corregir las fechas de cuotas
-- Primero, verificar qué préstamos necesitan corrección
SELECT 
  l.id,
  l.start_date,
  l.payment_frequency,
  COUNT(i.id) as installments_count,
  MIN(i.due_date) as first_installment_date,
  MAX(i.due_date) as last_installment_date
FROM loans l
LEFT JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly'
GROUP BY l.id, l.start_date, l.payment_frequency;

-- Corregir TODAS las fechas de cuotas para préstamos mensuales
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
  i.installment_number,
  i.due_date
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly'
ORDER BY l.id, i.installment_number;
