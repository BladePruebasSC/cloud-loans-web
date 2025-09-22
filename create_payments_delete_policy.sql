-- Script para crear política de eliminación de pagos
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Verificar el estado actual de RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 2. Habilitar RLS si no está habilitado
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas existentes de eliminación (si las hay)
DROP POLICY IF EXISTS "Allow authenticated users to delete payments" ON public.payments;
DROP POLICY IF EXISTS "Users can delete their own payments" ON public.payments;
DROP POLICY IF EXISTS "Allow delete payments" ON public.payments;

-- 4. Crear política específica para eliminar pagos
-- Opción 1: Política permisiva (permite eliminar cualquier pago)
CREATE POLICY "Allow authenticated users to delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (true);

-- Opción 2: Política más restrictiva (solo eliminar pagos propios)
-- Descomenta esta línea y comenta la anterior si quieres restricción por usuario
-- CREATE POLICY "Users can delete their own payments"
-- ON public.payments FOR DELETE
-- TO authenticated
-- USING (created_by = auth.uid());

-- Opción 3: Política por compañía (solo eliminar pagos de la misma compañía)
-- Descomenta esta línea y comenta las anteriores si quieres restricción por compañía
-- CREATE POLICY "Users can delete company payments"
-- ON public.payments FOR DELETE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM loans l
--     JOIN clients c ON l.client_id = c.id
--     WHERE l.id = payments.loan_id
--     AND c.company_id = (
--       SELECT user_metadata->>'company_id' 
--       FROM auth.users 
--       WHERE id = auth.uid()
--     )
--   )
-- );

-- 5. Verificar que la política se creó correctamente
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'payments' 
AND cmd = 'DELETE';

-- 6. Verificar que RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 7. Probar la política (opcional)
-- SELECT 'Política de eliminación creada exitosamente' AS status;
