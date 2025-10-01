-- SOLUCIÓN SIMPLE: Solo configurar la zona horaria de la sesión
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Configurar zona horaria de la sesión
SET timezone = 'America/Santo_Domingo';

-- 2. Verificar que se aplicó correctamente
SELECT 
    'Zona horaria configurada:' as status,
    current_setting('timezone') as timezone_actual,
    CURRENT_DATE as fecha_actual,
    NOW() as timestamp_actual;
