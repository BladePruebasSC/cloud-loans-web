-- Agregar campo remaining_interest a pawn_payments para guardar el interés pendiente histórico
ALTER TABLE pawn_payments 
ADD COLUMN IF NOT EXISTS remaining_interest DECIMAL(10,2) DEFAULT 0;

-- Comentario para documentar el campo
COMMENT ON COLUMN pawn_payments.remaining_interest IS 'Interés pendiente al momento del pago (valor histórico para recibos)';

