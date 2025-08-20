-- Crear tabla de códigos de registro para empresas (solo si no existe)
CREATE TABLE IF NOT EXISTS public.registration_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para mejorar el rendimiento (solo si no existen)
CREATE INDEX IF NOT EXISTS idx_registration_codes_code ON public.registration_codes(code);
CREATE INDEX IF NOT EXISTS idx_registration_codes_is_used ON public.registration_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_registration_codes_expires_at ON public.registration_codes(expires_at);

-- Crear función para generar códigos únicos
CREATE OR REPLACE FUNCTION generate_registration_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generar un código de 8 caracteres alfanuméricos
    new_code := upper(substring(md5(random()::text) from 1 for 8));
    
    -- Verificar si el código ya existe
    SELECT EXISTS(SELECT 1 FROM public.registration_codes WHERE code = new_code) INTO code_exists;
    
    -- Si no existe, salir del bucle
    IF NOT code_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Crear función para validar y usar un código de registro
CREATE OR REPLACE FUNCTION validate_and_use_registration_code(
  p_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  code_record RECORD;
BEGIN
  -- Buscar el código
  SELECT * INTO code_record 
  FROM public.registration_codes 
  WHERE code = p_code;
  
  -- Verificar si el código existe
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de registro inválido';
  END IF;
  
  -- Verificar si ya fue usado
  IF code_record.is_used THEN
    RAISE EXCEPTION 'Este código ya ha sido utilizado';
  END IF;
  
  -- Verificar si ha expirado
  IF code_record.expires_at IS NOT NULL AND code_record.expires_at < NOW() THEN
    RAISE EXCEPTION 'Este código ha expirado';
  END IF;
  
  -- Marcar el código como usado
  UPDATE public.registration_codes 
  SET is_used = TRUE, 
      used_by = p_user_id, 
      used_at = NOW(),
      updated_at = NOW()
  WHERE id = code_record.id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Crear RLS (Row Level Security) para la tabla
ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;

-- Política para permitir acceso completo a la tabla (sin autenticación requerida)
CREATE POLICY "Allow all operations on registration codes" ON public.registration_codes
  FOR ALL USING (true);

-- Política para permitir inserción sin autenticación
CREATE POLICY "Allow insert without auth" ON public.registration_codes
  FOR INSERT WITH CHECK (true);

-- Política para permitir actualización sin autenticación
CREATE POLICY "Allow update without auth" ON public.registration_codes
  FOR UPDATE USING (true);

-- Política para que cualquier usuario pueda validar códigos (solo lectura)
CREATE POLICY "Anyone can validate registration codes" ON public.registration_codes
  FOR SELECT USING (true);
