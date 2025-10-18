-- Migración para corregir TODAS las frecuencias de pago
-- Actualizar fechas de cuotas para todas las frecuencias

-- 1. Frecuencia DIARIA
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 day' + (installments.installment_number - 1) * INTERVAL '1 day'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'daily';

-- 2. Frecuencia SEMANAL
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 week' + (installments.installment_number - 1) * INTERVAL '1 week'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'weekly';

-- 3. Frecuencia QUINCENAL
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '2 weeks' + (installments.installment_number - 1) * INTERVAL '2 weeks'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'biweekly';

-- 4. Frecuencia MENSUAL
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 month' + (installments.installment_number - 1) * INTERVAL '1 month'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'monthly';

-- 5. Frecuencia TRIMESTRAL
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '3 months' + (installments.installment_number - 1) * INTERVAL '3 months'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'quarterly';

-- 6. Frecuencia ANUAL
UPDATE installments 
SET due_date = l.start_date::date + INTERVAL '1 year' + (installments.installment_number - 1) * INTERVAL '1 year'
FROM loans l
WHERE installments.loan_id = l.id 
AND l.payment_frequency = 'yearly';

-- Verificar que se actualizaron correctamente
SELECT 
  l.payment_frequency,
  COUNT(l.id) as loans_count,
  COUNT(i.id) as installments_count
FROM loans l
JOIN installments i ON l.id = i.loan_id
GROUP BY l.payment_frequency
ORDER BY l.payment_frequency;
