-- Arreglar políticas de RLS para company_settings
-- Permitir que empleados puedan acceder a configuraciones de su empresa

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Company users can manage company settings" ON public.company_settings;

-- Crear política para SELECT (lectura) - empleados y dueños pueden leer
DROP POLICY IF EXISTS "Company users and employees can read company settings" ON public.company_settings;
CREATE POLICY "Company users and employees can read company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    user_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE employees.auth_user_id = auth.uid() 
      AND employees.company_owner_id = company_settings.user_id
      AND employees.status = 'active'
    )
  );

-- Crear política para INSERT (creación) - solo dueños pueden crear
DROP POLICY IF EXISTS "Only company owners can create company settings" ON public.company_settings;
CREATE POLICY "Only company owners can create company settings"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());

-- Crear política para UPDATE (actualización) - solo dueños pueden actualizar
DROP POLICY IF EXISTS "Only company owners can update company settings" ON public.company_settings;
CREATE POLICY "Only company owners can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = get_user_company_id())
  WITH CHECK (user_id = get_user_company_id());

-- También permitir acceso para validación de códigos de empresa (sin autenticación)
DROP POLICY IF EXISTS "Allow company code validation" ON public.company_settings;
CREATE POLICY "Allow company code validation"
  ON public.company_settings
  FOR SELECT
  TO anon
  USING (company_code_enabled = true);

-- Permitir inserción de configuraciones de empresa para nuevos usuarios
DROP POLICY IF EXISTS "Allow company settings creation" ON public.company_settings;
CREATE POLICY "Allow company settings creation"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());
