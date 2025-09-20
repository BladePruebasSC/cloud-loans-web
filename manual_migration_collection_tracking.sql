-- Migración manual para crear la tabla de seguimiento de cobro
-- Ejecutar este script en el SQL Editor del dashboard de Supabase

-- Crear función para obtener el ID de la empresa del usuario (si no existe)
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
  company_id UUID;
  employee_record RECORD;
BEGIN
  -- Get the current authenticated user ID
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if the user is an employee
  SELECT company_owner_id, status INTO employee_record
  FROM public.employees 
  WHERE auth_user_id = user_id AND status = 'active'
  LIMIT 1;
  
  -- If user is an active employee, return their company owner ID
  IF FOUND AND employee_record.company_owner_id IS NOT NULL THEN
    RETURN employee_record.company_owner_id;
  END IF;
  
  -- Otherwise, assume user is a company owner and return their own ID
  RETURN user_id;
END;
$$;

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
DROP POLICY IF EXISTS "Users can view collection tracking for their company loans" ON collection_tracking;
CREATE POLICY "Users can view collection tracking for their company loans" ON collection_tracking
    FOR SELECT USING (
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.user_id = get_user_company_id()
        )
    );

-- Política para que los usuarios puedan insertar seguimientos
DROP POLICY IF EXISTS "Users can insert collection tracking for their company loans" ON collection_tracking;
CREATE POLICY "Users can insert collection tracking for their company loans" ON collection_tracking
    FOR INSERT WITH CHECK (
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.user_id = get_user_company_id()
        ) AND created_by = auth.uid()
    );

-- Política para que los usuarios puedan actualizar sus propios seguimientos
DROP POLICY IF EXISTS "Users can update their own collection tracking" ON collection_tracking;
CREATE POLICY "Users can update their own collection tracking" ON collection_tracking
    FOR UPDATE USING (
        created_by = auth.uid() AND
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.user_id = get_user_company_id()
        )
    );

-- Política para que los usuarios puedan eliminar sus propios seguimientos
DROP POLICY IF EXISTS "Users can delete their own collection tracking" ON collection_tracking;
CREATE POLICY "Users can delete their own collection tracking" ON collection_tracking
    FOR DELETE USING (
        created_by = auth.uid() AND
        loan_id IN (
            SELECT l.id FROM loans l
            JOIN clients c ON l.client_id = c.id
            WHERE c.user_id = get_user_company_id()
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
DROP TRIGGER IF EXISTS update_collection_tracking_updated_at ON collection_tracking;
CREATE TRIGGER update_collection_tracking_updated_at
    BEFORE UPDATE ON collection_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_collection_tracking_updated_at();
