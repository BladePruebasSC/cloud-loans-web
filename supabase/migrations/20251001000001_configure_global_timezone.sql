-- Configurar zona horaria global de Supabase para República Dominicana
-- Esta migración establece la zona horaria por defecto del servidor

-- Configurar la zona horaria del servidor a Santo Domingo (UTC-4)
ALTER DATABASE postgres SET timezone = 'America/Santo_Domingo';

-- Configurar la zona horaria de la sesión actual
SET timezone = 'America/Santo_Domingo';

-- Crear una función de utilidad para obtener la fecha actual en Santo Domingo
CREATE OR REPLACE FUNCTION current_santo_domingo_date()
RETURNS DATE AS $$
BEGIN
    RETURN CURRENT_DATE AT TIME ZONE 'America/Santo_Domingo';
END;
$$ LANGUAGE plpgsql;

-- Crear una función de utilidad para obtener el timestamp actual en Santo Domingo
CREATE OR REPLACE FUNCTION current_santo_domingo_timestamp()
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    RETURN NOW() AT TIME ZONE 'America/Santo_Domingo';
END;
$$ LANGUAGE plpgsql;

-- Actualizar todas las columnas de fecha para usar la zona horaria correcta
-- Esto afecta a todas las tablas que tienen campos de fecha

-- Tabla payments
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT current_santo_domingo_date();
ALTER TABLE public.payments ALTER COLUMN created_at SET DEFAULT current_santo_domingo_timestamp();

-- Tabla loans  
ALTER TABLE public.loans ALTER COLUMN start_date SET DEFAULT current_santo_domingo_date();
ALTER TABLE public.loans ALTER COLUMN created_at SET DEFAULT current_santo_domingo_timestamp();

-- Tabla clients
ALTER TABLE public.clients ALTER COLUMN created_at SET DEFAULT current_santo_domingo_timestamp();

-- Tabla profiles
ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT current_santo_domingo_timestamp();
ALTER TABLE public.profiles ALTER COLUMN updated_at SET DEFAULT current_santo_domingo_timestamp();

-- Comentarios para documentación
COMMENT ON FUNCTION current_santo_domingo_date() IS 'Returns current date in Santo Domingo timezone (UTC-4)';
COMMENT ON FUNCTION current_santo_domingo_timestamp() IS 'Returns current timestamp in Santo Domingo timezone (UTC-4)';

-- Verificar la configuración
SELECT 
    name, 
    setting 
FROM pg_settings 
WHERE name = 'timezone';
