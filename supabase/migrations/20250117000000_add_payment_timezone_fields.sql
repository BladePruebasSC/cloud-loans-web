-- Agregar campos de zona horaria a la tabla payments
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_timezone VARCHAR(50) DEFAULT 'America/Santo_Domingo',
ADD COLUMN IF NOT EXISTS payment_time_local TIMESTAMPTZ DEFAULT NOW();

-- Crear índice para mejorar consultas por fecha local
CREATE INDEX IF NOT EXISTS idx_payments_payment_time_local ON payments(payment_time_local);

-- Comentarios para documentar los campos
COMMENT ON COLUMN payments.payment_timezone IS 'Zona horaria donde se realizó el pago (ej: America/Santo_Domingo)';
COMMENT ON COLUMN payments.payment_time_local IS 'Fecha y hora del pago en la zona horaria local del usuario';
