-- Crear función RPC para eliminar pagos que bypasee las políticas de RLS
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Crear la función RPC
CREATE OR REPLACE FUNCTION delete_payment(payment_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- Esto permite que la función ejecute con privilegios elevados
AS $$
DECLARE
    payment_record RECORD;
    loan_record RECORD;
    result JSON;
BEGIN
    -- Verificar que el pago existe
    SELECT * INTO payment_record
    FROM payments
    WHERE id = payment_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Pago no encontrado'
        );
    END IF;
    
    -- Obtener información del préstamo
    SELECT * INTO loan_record
    FROM loans
    WHERE id = payment_record.loan_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Préstamo no encontrado'
        );
    END IF;
    
    -- Eliminar el pago
    DELETE FROM payments WHERE id = payment_id;
    
    -- Actualizar el balance del préstamo
    UPDATE loans 
    SET remaining_balance = remaining_balance + payment_record.amount
    WHERE id = payment_record.loan_id;
    
    -- Retornar resultado exitoso
    RETURN json_build_object(
        'success', true,
        'message', 'Pago eliminado exitosamente',
        'payment_id', payment_id,
        'loan_id', payment_record.loan_id,
        'amount_restored', payment_record.amount,
        'new_balance', loan_record.remaining_balance + payment_record.amount
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- 2. Otorgar permisos para ejecutar la función
GRANT EXECUTE ON FUNCTION delete_payment(UUID) TO authenticated;

-- 3. Verificar que la función se creó correctamente
SELECT 
    routine_name,
    routine_type,
    security_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'delete_payment' 
AND routine_schema = 'public';

-- 4. Probar la función (opcional - reemplazar con un ID real)
-- SELECT delete_payment('PAYMENT_ID_AQUI');
