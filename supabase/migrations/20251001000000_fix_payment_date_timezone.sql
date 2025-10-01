-- Configurar zona horaria de Supabase para República Dominicana (UTC-4)
-- Esto afecta a todas las funciones de fecha y hora en la base de datos

-- Configurar la zona horaria de la sesión a Santo Domingo
SET timezone = 'America/Santo_Domingo';

-- Crear una función que siempre devuelva la fecha actual en zona horaria de Santo Domingo
CREATE OR REPLACE FUNCTION get_santo_domingo_date()
RETURNS DATE AS $$
BEGIN
    -- Forzar zona horaria de Santo Domingo
    RETURN (NOW() AT TIME ZONE 'America/Santo_Domingo')::DATE;
END;
$$ LANGUAGE plpgsql;

-- Crear una función que devuelva timestamp en zona horaria de Santo Domingo
CREATE OR REPLACE FUNCTION get_santo_domingo_timestamp()
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    RETURN NOW() AT TIME ZONE 'America/Santo_Domingo';
END;
$$ LANGUAGE plpgsql;

-- Actualizar los DEFAULT de las tablas para usar la zona horaria correcta
ALTER TABLE public.payments ALTER COLUMN payment_date DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT get_santo_domingo_date();

ALTER TABLE public.loans ALTER COLUMN start_date DROP DEFAULT;
ALTER TABLE public.loans ALTER COLUMN start_date SET DEFAULT get_santo_domingo_date();

-- Actualizar created_at para usar zona horaria de Santo Domingo
ALTER TABLE public.payments ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN created_at SET DEFAULT get_santo_domingo_timestamp();

ALTER TABLE public.loans ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.loans ALTER COLUMN created_at SET DEFAULT get_santo_domingo_timestamp();

-- Crear triggers específicos para cada tabla
-- Trigger para tabla payments
CREATE OR REPLACE FUNCTION set_payment_timezone()
RETURNS TRIGGER AS $$
BEGIN
    -- Asegurar que payment_date esté en zona horaria de Santo Domingo
    IF NEW.payment_date IS NOT NULL THEN
        NEW.payment_date = (NEW.payment_date AT TIME ZONE 'America/Santo_Domingo')::DATE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para tabla loans
CREATE OR REPLACE FUNCTION set_loan_timezone()
RETURNS TRIGGER AS $$
BEGIN
    -- Asegurar que start_date esté en zona horaria de Santo Domingo
    IF NEW.start_date IS NOT NULL THEN
        NEW.start_date = (NEW.start_date AT TIME ZONE 'America/Santo_Domingo')::DATE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar los triggers específicos
DROP TRIGGER IF EXISTS set_timezone_payments ON public.payments;
CREATE TRIGGER set_timezone_payments
    BEFORE INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION set_payment_timezone();

DROP TRIGGER IF EXISTS set_timezone_loans ON public.loans;
CREATE TRIGGER set_timezone_loans
    BEFORE INSERT OR UPDATE ON public.loans
    FOR EACH ROW
    EXECUTE FUNCTION set_loan_timezone();

-- Comentarios para documentación
COMMENT ON FUNCTION get_santo_domingo_date() IS 'Returns current date in Santo Domingo timezone (UTC-4)';
COMMENT ON FUNCTION get_santo_domingo_timestamp() IS 'Returns current timestamp in Santo Domingo timezone (UTC-4)';
COMMENT ON FUNCTION set_santo_domingo_timezone() IS 'Trigger function to ensure dates are stored in Santo Domingo timezone';
COMMENT ON COLUMN public.payments.payment_date IS 'Payment date in Santo Domingo timezone (UTC-4)';
COMMENT ON COLUMN public.loans.start_date IS 'Loan start date in Santo Domingo timezone (UTC-4)';
