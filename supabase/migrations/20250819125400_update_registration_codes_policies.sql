-- Actualizar políticas de RLS para permitir acceso sin autenticación
-- Primero eliminar las políticas existentes
DROP POLICY IF EXISTS "Admin can view all registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Admin can create registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Admin can update registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Anyone can validate registration codes" ON public.registration_codes;

-- Crear nuevas políticas que permitan acceso completo sin autenticación
CREATE POLICY "Allow all operations on registration codes" ON public.registration_codes
  FOR ALL USING (true);

CREATE POLICY "Allow insert without auth" ON public.registration_codes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update without auth" ON public.registration_codes
  FOR UPDATE USING (true);

CREATE POLICY "Allow select without auth" ON public.registration_codes
  FOR SELECT USING (true);
