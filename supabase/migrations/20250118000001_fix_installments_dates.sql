-- Migración adicional para corregir las fechas de cuotas
-- Actualizar todas las fechas de installments basándose en start_date + frecuencia

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
WHERE installments.loan_id = l.id;
