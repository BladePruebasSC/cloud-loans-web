-- Corregir políticas de RLS para la tabla registration_codes
-- Primero eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Admin can view all registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Admin can create registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Admin can update registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Anyone can validate registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Allow all operations on registration codes" ON public.registration_codes;
DROP POLICY IF EXISTS "Allow insert without auth" ON public.registration_codes;
DROP POLICY IF EXISTS "Allow update without auth" ON public.registration_codes;
DROP POLICY IF EXISTS "Allow select without auth" ON public.registration_codes;

-- Deshabilitar RLS temporalmente para permitir acceso completo
ALTER TABLE public.registration_codes DISABLE ROW LEVEL SECURITY;

-- Crear una política simple que permita todo el acceso
ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;

-- Política que permite todas las operaciones sin restricciones
CREATE POLICY "Allow all operations" ON public.registration_codes
  FOR ALL USING (true) WITH CHECK (true);
