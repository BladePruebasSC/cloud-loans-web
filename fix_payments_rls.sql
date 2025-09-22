-- Script para corregir las políticas de RLS en la tabla payments
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Verificar si RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 2. Habilitar RLS si no está habilitado
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas existentes (si las hay)
DROP POLICY IF EXISTS "Allow authenticated users to read payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to insert payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to update payments" ON public.payments;
DROP POLICY IF EXISTS "Allow authenticated users to delete payments" ON public.payments;

-- 4. Crear políticas simples que permitan todas las operaciones para usuarios autenticados
CREATE POLICY "Allow authenticated users to read payments"
ON public.payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (true);

-- 5. Verificar las políticas creadas
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
WHERE tablename = 'payments';

-- 6. Verificar que RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';
