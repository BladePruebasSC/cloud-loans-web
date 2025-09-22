-- Script completo para crear todas las políticas de la tabla payments
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Verificar el estado actual de RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 2. Habilitar RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Allow authenticated users to read payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to insert payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to update payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to delete payments" ON public.payments;

-- 4. Crear políticas completas para todas las operaciones

-- Política para SELECT (leer pagos)
CREATE POLICY "Allow authenticated users to read payments"
ON public.payments FOR SELECT
TO authenticated
USING (true);

-- Política para INSERT (crear pagos)
CREATE POLICY "Allow authenticated users to insert payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para UPDATE (actualizar pagos)
CREATE POLICY "Allow authenticated users to update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para DELETE (eliminar pagos)
CREATE POLICY "Allow authenticated users to delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (true);

-- 5. Verificar todas las políticas creadas
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
ORDER BY cmd;

-- 6. Verificar que RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 7. Mensaje de confirmación
SELECT 'Todas las políticas de payments creadas exitosamente' AS status;
