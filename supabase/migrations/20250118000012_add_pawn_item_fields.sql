-- Agregar campos adicionales para datos del artículo en pawn_transactions
ALTER TABLE pawn_transactions 
ADD COLUMN IF NOT EXISTS item_category TEXT,
ADD COLUMN IF NOT EXISTS item_condition TEXT DEFAULT 'excellent',
ADD COLUMN IF NOT EXISTS item_brand TEXT,
ADD COLUMN IF NOT EXISTS item_model TEXT;

-- Agregar comentarios para documentar los campos
COMMENT ON COLUMN pawn_transactions.item_category IS 'Categoría del artículo (ej: Electrónicos, Joyería, Herramientas)';
COMMENT ON COLUMN pawn_transactions.item_condition IS 'Estado del artículo (excellent, good, fair, poor)';
COMMENT ON COLUMN pawn_transactions.item_brand IS 'Marca del artículo (ej: Apple, Samsung, Dell)';
COMMENT ON COLUMN pawn_transactions.item_model IS 'Modelo del artículo (ej: iPhone 13, Galaxy S21)';

-- Crear tabla para historial de cambios de tasa de interés
CREATE TABLE IF NOT EXISTS pawn_rate_changes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pawn_transaction_id UUID NOT NULL REFERENCES pawn_transactions(id) ON DELETE CASCADE,
    old_rate DECIMAL(5,2) NOT NULL,
    new_rate DECIMAL(5,2) NOT NULL,
    reason TEXT,
    effective_date DATE NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar campos adicionales a pawn_payments para el desglose de pagos
ALTER TABLE pawn_payments 
ADD COLUMN IF NOT EXISTS interest_payment DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS principal_payment DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10,2) DEFAULT 0;

-- Comentarios para los nuevos campos de pagos
COMMENT ON COLUMN pawn_payments.interest_payment IS 'Monto del pago aplicado al interés';
COMMENT ON COLUMN pawn_payments.principal_payment IS 'Monto del pago aplicado al capital';
COMMENT ON COLUMN pawn_payments.remaining_balance IS 'Balance restante después del pago';

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_pawn_rate_changes_transaction_id ON pawn_rate_changes(pawn_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pawn_rate_changes_changed_at ON pawn_rate_changes(changed_at);
CREATE INDEX IF NOT EXISTS idx_pawn_transactions_item_category ON pawn_transactions(item_category);
CREATE INDEX IF NOT EXISTS idx_pawn_transactions_item_condition ON pawn_transactions(item_condition);

-- Habilitar RLS en la nueva tabla
ALTER TABLE pawn_rate_changes ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS para pawn_rate_changes
CREATE POLICY "Users can view their own rate changes" ON pawn_rate_changes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rate changes" ON pawn_rate_changes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rate changes" ON pawn_rate_changes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rate changes" ON pawn_rate_changes
    FOR DELETE USING (auth.uid() = user_id);
