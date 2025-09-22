-- Script para crear políticas seguras de payments basadas en el usuario
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
DROP POLICY IF EXISTS "Users can manage their company payments" ON public.payments;

-- 4. Crear políticas seguras basadas en compañía

-- Política para SELECT (leer pagos de la misma compañía)
CREATE POLICY "Users can read their company payments"
ON public.payments FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.id = payments.loan_id
    AND c.company_id = (
      SELECT user_metadata->>'company_id' 
      FROM auth.users 
      WHERE id = auth.uid()
    )
  )
);

-- Política para INSERT (crear pagos)
CREATE POLICY "Users can insert payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.id = payments.loan_id
    AND c.company_id = (
      SELECT user_metadata->>'company_id' 
      FROM auth.users 
      WHERE id = auth.uid()
    )
  )
);

-- Política para UPDATE (actualizar pagos)
CREATE POLICY "Users can update their company payments"
ON public.payments FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.id = payments.loan_id
    AND c.company_id = (
      SELECT user_metadata->>'company_id' 
      FROM auth.users 
      WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.id = payments.loan_id
    AND c.company_id = (
      SELECT user_metadata->>'company_id' 
      FROM auth.users 
      WHERE id = auth.uid()
    )
  )
);

-- Política para DELETE (eliminar pagos)
CREATE POLICY "Users can delete their company payments"
ON public.payments FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.id = payments.loan_id
    AND c.company_id = (
      SELECT user_metadata->>'company_id' 
      FROM auth.users 
      WHERE id = auth.uid()
    )
  )
);

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
SELECT 'Políticas seguras de payments creadas exitosamente' AS status;
