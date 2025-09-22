-- Script para deshabilitar temporalmente RLS en la tabla payments
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Verificar el estado actual de RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 2. Deshabilitar RLS temporalmente
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;

-- 3. Verificar que RLS está deshabilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'payments';

-- 4. Probar eliminación directa (opcional)
-- DELETE FROM payments WHERE id = 'PAYMENT_ID_AQUI';

-- IMPORTANTE: Después de probar, volver a habilitar RLS con:
-- ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
