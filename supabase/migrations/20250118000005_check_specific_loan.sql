-- Consulta específica para verificar el préstamo que está causando problemas
-- Buscar el préstamo con ID específico que aparece en los logs
SELECT 
  l.id as loan_id,
  l.start_date,
  l.payment_frequency,
  l.next_payment_date,
  l.first_payment_date,
  i.installment_number,
  i.due_date,
  i.created_at
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.id = '1a4f61c3-79e4-4998-bd07-79f5d5deff64'
ORDER BY i.installment_number;

-- También verificar si hay otros préstamos con fechas incorrectas
SELECT 
  l.id as loan_id,
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
