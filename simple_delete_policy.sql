-- Script simple para crear solo la política de eliminación de pagos
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Habilitar RLS en la tabla payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar política de eliminación existente (si existe)
DROP POLICY IF EXISTS "Allow authenticated users to delete payments" ON public.payments;

-- 3. Crear política simple para eliminar pagos
CREATE POLICY "Allow authenticated users to delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (true);

-- 4. Verificar que la política se creó
SELECT 
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename = 'payments' 
AND cmd = 'DELETE';

-- 5. Mensaje de confirmación
SELECT 'Política de eliminación de pagos creada exitosamente' AS status;
