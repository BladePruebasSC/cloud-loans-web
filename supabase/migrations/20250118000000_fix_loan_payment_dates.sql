-- Migración para corregir las fechas de próxima cuota en préstamos existentes
-- El problema: next_payment_date está guardando la fecha de inicio en lugar de la primera cuota

-- 1. Actualizar next_payment_date para que sea la primera cuota (start_date + frecuencia)
UPDATE loans 
SET next_payment_date = CASE 
  WHEN payment_frequency = 'daily' THEN start_date::date + INTERVAL '1 day'
  WHEN payment_frequency = 'weekly' THEN start_date::date + INTERVAL '1 week'
  WHEN payment_frequency = 'biweekly' THEN start_date::date + INTERVAL '2 weeks'
  WHEN payment_frequency = 'monthly' THEN start_date::date + INTERVAL '1 month'
  WHEN payment_frequency = 'quarterly' THEN start_date::date + INTERVAL '3 months'
  WHEN payment_frequency = 'yearly' THEN start_date::date + INTERVAL '1 year'
  ELSE start_date::date + INTERVAL '1 month'
END
WHERE next_payment_date = start_date;

-- 2. Actualizar las fechas en la tabla installments para que coincidan
UPDATE installments 
SET due_date = CASE 
  WHEN l.payment_frequency = 'daily' THEN l.start_date::date + INTERVAL '1 day' + (installments.installment_number - 1) * INTERVAL '1 day'
  WHEN l.payment_frequency = 'weekly' THEN l.start_date::date + INTERVAL '1 week' + (installments.installment_number - 1) * INTERVAL '1 week'
  WHEN l.payment_frequency = 'biweekly' THEN l.start_date::date + INTERVAL '2 weeks' + (installments.installment_number - 1) * INTERVAL '2 weeks'
  WHEN l.payment_frequency = 'monthly' THEN l.start_date::date + INTERVAL '1 month' + (installments.installment_number - 1) * INTERVAL '1 month'
  WHEN l.payment_frequency = 'quarterly' THEN l.start_date::date + INTERVAL '3 months' + (installments.installment_number - 1) * INTERVAL '3 months'
  WHEN l.payment_frequency = 'yearly' THEN l.start_date::date + INTERVAL '1 year' + (installments.installment_number - 1) * INTERVAL '1 year'
  ELSE l.start_date::date + INTERVAL '1 month' + (installments.installment_number - 1) * INTERVAL '1 month'
END
FROM loans l
WHERE installments.loan_id = l.id 
AND l.next_payment_date = l.start_date;
