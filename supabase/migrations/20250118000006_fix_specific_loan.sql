-- Migración específica para corregir el préstamo problemático
-- Primero, verificar el estado actual
SELECT 
  l.id,
  l.start_date,
  l.payment_frequency,
  l.next_payment_date,
  i.installment_number,
  i.due_date
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.id = '1a4f61c3-79e4-4998-bd07-79f5d5deff64'
ORDER BY i.installment_number;

-- Corregir las fechas de cuotas para este préstamo específico
UPDATE installments 
SET due_date = '2025-03-18'::date + INTERVAL '1 month' + (installment_number - 1) * INTERVAL '1 month'
WHERE loan_id = '1a4f61c3-79e4-4998-bd07-79f5d5deff64';

-- Verificar que se actualizaron correctamente
SELECT 
  l.id,
  l.start_date,
  l.payment_frequency,
  l.next_payment_date,
  i.installment_number,
  i.due_date
FROM loans l
JOIN installments i ON l.id = i.loan_id
WHERE l.id = '1a4f61c3-79e4-4998-bd07-79f5d5deff64'
ORDER BY i.installment_number;
