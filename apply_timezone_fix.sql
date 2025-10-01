-- Script para aplicar la corrección de zona horaria manualmente
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Configurar zona horaria global
SET timezone = 'America/Santo_Domingo';

-- 2. Crear función para fecha actual en Santo Domingo
CREATE OR REPLACE FUNCTION current_santo_domingo_date()
RETURNS DATE AS $$
BEGIN
    RETURN CURRENT_DATE AT TIME ZONE 'America/Santo_Domingo';
END;
$$ LANGUAGE plpgsql;

-- 3. Crear función para timestamp actual en Santo Domingo
CREATE OR REPLACE FUNCTION current_santo_domingo_timestamp()
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    RETURN NOW() AT TIME ZONE 'America/Santo_Domingo';
END;
$$ LANGUAGE plpgsql;

-- 4. Actualizar DEFAULT de payment_date (SOLO esta tabla para evitar errores)
ALTER TABLE public.payments ALTER COLUMN payment_date DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT current_santo_domingo_date();

-- 5. Actualizar created_at en payments
ALTER TABLE public.payments ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN created_at SET DEFAULT current_santo_domingo_timestamp();

-- 6. Verificar la configuración
SELECT 
    'Zona horaria configurada:' as status,
    current_setting('timezone') as timezone,
    current_santo_domingo_date() as fecha_actual_santo_domingo,
    current_santo_domingo_timestamp() as timestamp_actual_santo_domingo;
