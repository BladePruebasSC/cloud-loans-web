/*
  # Corregir sistema de empleados

  1. Cambios
    - Agregar campo company_id a la tabla employees para mejor organización
    - Actualizar políticas RLS para empleados
    - Asegurar que los empleados trabajen con datos de la empresa

  2. Seguridad
    - Mantener RLS habilitado
    - Políticas actualizadas para empleados y dueños de empresa
*/

-- Agregar campo company_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN company_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Actualizar company_id para empleados existentes
UPDATE public.employees 
SET company_id = company_owner_id 
WHERE company_id IS NULL;

-- Actualizar políticas RLS para empleados
DROP POLICY IF EXISTS "Company owners can manage their employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;

-- Política para que los dueños de empresa puedan gestionar sus empleados
CREATE POLICY "Company owners can manage their employees"
  ON public.employees
  FOR ALL
  TO authenticated
  USING (auth.uid() = company_owner_id);

-- Política para que los empleados puedan ver su propia información
CREATE POLICY "Employees can view their own data"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Política para que los empleados puedan actualizar su propia información básica
CREATE POLICY "Employees can update their basic info"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);