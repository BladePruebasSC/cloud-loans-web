-- Eliminar triggers problemáticos que están causando fechas incorrectas
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Eliminar triggers problemáticos
DROP TRIGGER IF EXISTS set_timezone_payments ON public.payments;
DROP TRIGGER IF EXISTS set_timezone_loans ON public.loans;

-- 2. Eliminar funciones problemáticas
DROP FUNCTION IF EXISTS set_payment_timezone();
DROP FUNCTION IF EXISTS set_loan_timezone();
DROP FUNCTION IF EXISTS set_santo_domingo_timezone();

-- 3. Restaurar DEFAULT original para payment_date
ALTER TABLE public.payments ALTER COLUMN payment_date DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT CURRENT_DATE;

-- 4. Configurar solo la zona horaria de la sesión
SET timezone = 'America/Santo_Domingo';

-- 5. Verificar que se eliminaron los triggers
SELECT 
    'Triggers eliminados' as status,
    current_setting('timezone') as timezone_actual,
    CURRENT_DATE as fecha_actual;
