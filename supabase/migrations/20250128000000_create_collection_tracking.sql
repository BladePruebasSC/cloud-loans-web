-- Crear tabla de seguimiento de cobro
CREATE TABLE IF NOT EXISTS collection_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    contact_type VARCHAR(50) NOT NULL CHECK (contact_type IN ('phone', 'email', 'sms', 'visit', 'letter', 'other')),
    contact_date DATE NOT NULL,
    contact_time TIME NOT NULL,
    client_response TEXT,
    additional_notes TEXT,
    next_contact_date DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_collection_tracking_loan_id ON collection_tracking(loan_id);
CREATE INDEX IF NOT EXISTS idx_collection_tracking_contact_date ON collection_tracking(contact_date);
CREATE INDEX IF NOT EXISTS idx_collection_tracking_created_by ON collection_tracking(created_by);

-- Habilitar RLS
ALTER TABLE collection_tracking ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios solo vean los seguimientos de su empresa
CREATE POLICY "Users can view collection tracking for their company loans" ON collection_tracking
    FOR SELECT USING (
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.company_id = (
                SELECT company_id FROM employees 
                WHERE user_id = auth.uid()
                UNION
                SELECT id FROM companies 
                WHERE owner_id = auth.uid()
            )
        )
    );

-- Política para que los usuarios puedan insertar seguimientos
CREATE POLICY "Users can insert collection tracking for their company loans" ON collection_tracking
    FOR INSERT WITH CHECK (
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.company_id = (
                SELECT company_id FROM employees 
                WHERE user_id = auth.uid()
                UNION
                SELECT id FROM companies 
                WHERE owner_id = auth.uid()
            )
        ) AND created_by = auth.uid()
    );

-- Política para que los usuarios puedan actualizar sus propios seguimientos
CREATE POLICY "Users can update their own collection tracking" ON collection_tracking
    FOR UPDATE USING (
        created_by = auth.uid() AND
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.company_id = (
                SELECT company_id FROM employees 
                WHERE user_id = auth.uid()
                UNION
                SELECT id FROM companies 
                WHERE owner_id = auth.uid()
            )
        )
    );

-- Política para que los usuarios puedan eliminar sus propios seguimientos
CREATE POLICY "Users can delete their own collection tracking" ON collection_tracking
    FOR DELETE USING (
        created_by = auth.uid() AND
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.company_id = (
                SELECT company_id FROM employees 
                WHERE user_id = auth.uid()
                UNION
                SELECT id FROM companies 
                WHERE owner_id = auth.uid()
            )
        )
    );

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_collection_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER update_collection_tracking_updated_at
    BEFORE UPDATE ON collection_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_collection_tracking_updated_at();
