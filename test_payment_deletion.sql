-- Script para probar la eliminación de pagos
-- Reemplaza 'PAYMENT_ID_AQUI' con el ID real del pago que quieres eliminar

-- 1. Verificar que el pago existe
SELECT 
    id,
    amount,
    payment_date,
    loan_id,
    created_by,
    created_at
FROM payments 
WHERE id = 'PAYMENT_ID_AQUI';

-- 2. Verificar el balance actual del préstamo
SELECT 
    l.id,
    l.remaining_balance,
    c.full_name
FROM loans l
JOIN clients c ON l.client_id = c.id
WHERE l.id = (
    SELECT loan_id FROM payments WHERE id = 'PAYMENT_ID_AQUI'
);

-- 3. Intentar eliminar el pago
DELETE FROM payments 
WHERE id = 'PAYMENT_ID_AQUI';

-- 4. Verificar que se eliminó
SELECT 
    id,
    amount,
    payment_date,
    loan_id
FROM payments 
WHERE id = 'PAYMENT_ID_AQUI';

-- 5. Verificar el balance actualizado del préstamo
SELECT 
    l.id,
    l.remaining_balance,
    c.full_name
FROM loans l
JOIN clients c ON l.client_id = c.id
WHERE l.id = (
    -- Usar el loan_id que tenías guardado
    'LOAN_ID_AQUI'
);
