/*
  # Agregar código de empresa para autenticación

  1. Modificar tabla `company_settings`
    - Agregar campo `company_code` (text, unique) para identificar empresas
    - Agregar campo `company_code_enabled` (boolean) para habilitar/deshabilitar el código

  2. Seguridad
    - El código de empresa debe ser único
    - Solo el dueño de la empresa puede modificar el código
*/

-- Agregar campos a company_settings
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS company_code TEXT UNIQUE NOT NULL,
ADD COLUMN IF NOT EXISTS company_code_enabled BOOLEAN DEFAULT true;

-- Crear índice para búsquedas rápidas por código
CREATE INDEX IF NOT EXISTS idx_company_settings_company_code 
ON public.company_settings(company_code) 
WHERE company_code IS NOT NULL;

-- Función para generar códigos únicos de empresa
CREATE OR REPLACE FUNCTION generate_company_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  counter INTEGER := 0;
BEGIN
  LOOP
    -- Generar código de 6 caracteres alfanuméricos
    code := upper(substring(md5(random()::text) from 1 for 6));
    
    -- Verificar si el código ya existe
    IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE company_code = code) THEN
      RETURN code;
    END IF;
    
    counter := counter + 1;
    -- Evitar bucle infinito
    IF counter > 100 THEN
      RAISE EXCEPTION 'No se pudo generar un código único después de 100 intentos';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar automáticamente el código de empresa al crear una nueva configuración
CREATE OR REPLACE FUNCTION auto_generate_company_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Si no se proporciona un código, generarlo automáticamente
  IF NEW.company_code IS NULL OR NEW.company_code = '' THEN
    NEW.company_code := generate_company_code();
  END IF;
  
  -- Siempre habilitar el código de empresa
  NEW.company_code_enabled := true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_company_code ON public.company_settings;
CREATE TRIGGER trigger_auto_generate_company_code
  BEFORE INSERT ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_company_code();

-- Actualizar registros existentes que no tengan código
UPDATE public.company_settings 
SET company_code = generate_company_code(),
    company_code_enabled = true
WHERE company_code IS NULL OR company_code = '';

-- Comentarios para documentación
COMMENT ON COLUMN public.company_settings.company_code IS 'Código único de 6 caracteres para identificación de empresa en el login de empleados';
COMMENT ON COLUMN public.company_settings.company_code_enabled IS 'Indica si el código de empresa está habilitado (siempre true)';
COMMENT ON FUNCTION generate_company_code() IS 'Genera un código único de 6 caracteres alfanuméricos para empresas';
COMMENT ON FUNCTION auto_generate_company_code() IS 'Trigger que genera automáticamente el código de empresa al crear una nueva configuración';
