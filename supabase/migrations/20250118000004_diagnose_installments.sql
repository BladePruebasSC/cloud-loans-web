-- Consulta de diagnóstico para verificar el estado actual de las cuotas
SELECT 
  l.id as loan_id,
  l.start_date,
  l.payment_frequency,
  l.next_payment_date,
  i.installment_number,
  i.due_date,
  l.start_date::date + INTERVAL '1 month' + (i.installment_number - 1) * INTERVAL '1 month' as expected_due_date
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly'
ORDER BY l.id, i.installment_number;

-- Verificar si hay algún problema con la consulta de actualización
SELECT 
  COUNT(*) as total_installments,
  COUNT(CASE WHEN i.due_date = l.start_date::date + INTERVAL '1 month' + (i.installment_number - 1) * INTERVAL '1 month' THEN 1 END) as correct_dates,
  COUNT(CASE WHEN i.due_date != l.start_date::date + INTERVAL '1 month' + (i.installment_number - 1) * INTERVAL '1 month' THEN 1 END) as incorrect_dates
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.payment_frequency = 'monthly';
