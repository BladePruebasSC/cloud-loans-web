-- Script para corregir el campo total_late_fee_paid en la tabla loans
-- Este script calcula la mora pagada desde la tabla payments y actualiza el campo en loans

-- Crear una función temporal para actualizar total_late_fee_paid
CREATE OR REPLACE FUNCTION update_total_late_fee_paid()
RETURNS void AS $$
BEGIN
  -- Actualizar el campo total_late_fee_paid calculándolo desde la tabla payments
  UPDATE loans 
  SET total_late_fee_paid = COALESCE(
    (
      SELECT SUM(p.late_fee) 
      FROM payments p 
      WHERE p.loan_id = loans.id 
        AND p.late_fee IS NOT NULL 
        AND p.late_fee > 0
    ), 
    0
  )
  WHERE id IN (
    -- Solo actualizar préstamos que tienen pagos de mora
    SELECT DISTINCT loan_id 
    FROM payments 
    WHERE late_fee IS NOT NULL 
      AND late_fee > 0
  );
  
  -- Mostrar estadísticas de la actualización
  RAISE NOTICE 'Actualización completada. Préstamos con mora pagada: %', 
    (SELECT COUNT(*) FROM loans WHERE total_late_fee_paid > 0);
    
  RAISE NOTICE 'Total de mora pagada en el sistema: %', 
    (SELECT SUM(total_late_fee_paid) FROM loans);
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la función
SELECT update_total_late_fee_paid();

-- Mostrar los préstamos que fueron actualizados
SELECT 
  l.id,
  c.full_name as cliente,
  l.total_late_fee_paid as mora_pagada,
  l.current_late_fee as mora_actual,
  (SELECT COUNT(*) FROM payments p WHERE p.loan_id = l.id AND p.late_fee > 0) as pagos_mora_count
FROM loans l
JOIN clients c ON l.client_id = c.id
WHERE l.total_late_fee_paid > 0
ORDER BY l.total_late_fee_paid DESC;

-- Limpiar la función temporal
DROP FUNCTION update_total_late_fee_paid();
