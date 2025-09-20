-- =====================================================
-- MIGRACIÓN MANUAL: Sistema de Configuración Global
-- =====================================================
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Crear tabla system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Crear índices
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);

-- 3. Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas RLS
DROP POLICY IF EXISTS "Allow authenticated users to read system settings" ON public.system_settings;
CREATE POLICY "Allow authenticated users to read system settings" ON public.system_settings
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to manage system settings" ON public.system_settings;
CREATE POLICY "Allow authenticated users to manage system settings" ON public.system_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- 5. Crear trigger para updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trigger_update_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();

-- 6. Insertar configuración por defecto de mora
INSERT INTO public.system_settings (key, value, description) VALUES 
(
    'default_late_fee_config',
    '{"default_late_fee_enabled": false, "default_late_fee_rate": 2.0, "default_grace_period_days": 0, "default_max_late_fee": 0, "default_late_fee_calculation_type": "daily"}',
    'Configuración por defecto para la mora en nuevos préstamos'
) ON CONFLICT (key) DO NOTHING;

-- 7. Verificar y corregir tabla clients
DO $$ 
BEGIN
    -- Verificar si la columna company_id existe en la tabla clients
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clients' 
        AND column_name = 'company_id'
        AND table_schema = 'public'
    ) THEN
        -- Agregar la columna company_id si no existe
        ALTER TABLE public.clients ADD COLUMN company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        
        -- Crear índice para mejor performance
        CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);
    END IF;
END $$;

-- 8. Actualizar políticas RLS para clients
DROP POLICY IF EXISTS "Allow users to access their company clients" ON public.clients;
CREATE POLICY "Allow users to access their company clients" ON public.clients
    FOR ALL USING (
        company_id = auth.uid() OR 
        company_id IN (
            SELECT id FROM auth.users 
            WHERE user_metadata->>'company_id' = (SELECT user_metadata->>'company_id' FROM auth.users WHERE id = auth.uid())
        )
    );

-- 9. Verificar que la tabla late_fee_history existe
CREATE TABLE IF NOT EXISTS public.late_fee_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    days_overdue INTEGER NOT NULL,
    late_fee_rate DECIMAL(5,2) NOT NULL,
    late_fee_amount DECIMAL(10,2) NOT NULL,
    total_late_fee DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 10. Crear índices para late_fee_history
CREATE INDEX IF NOT EXISTS idx_late_fee_history_loan_id ON public.late_fee_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_late_fee_history_calculation_date ON public.late_fee_history(calculation_date);

-- 11. Habilitar RLS en late_fee_history
ALTER TABLE public.late_fee_history ENABLE ROW LEVEL SECURITY;

-- 12. Crear política RLS para late_fee_history
DROP POLICY IF EXISTS "Allow users to access their company late fee history" ON public.late_fee_history;
CREATE POLICY "Allow users to access their company late fee history" ON public.late_fee_history
    FOR ALL USING (
        loan_id IN (
            SELECT l.id FROM public.loans l
            JOIN public.clients c ON l.client_id = c.id
            WHERE c.company_id = auth.uid() OR 
                  c.company_id IN (
                      SELECT id FROM auth.users 
                      WHERE user_metadata->>'company_id' = (SELECT user_metadata->>'company_id' FROM auth.users WHERE id = auth.uid())
                  )
        )
    );

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- Verificar que las tablas se crearon correctamente
SELECT 'system_settings' as tabla, count(*) as registros FROM public.system_settings
UNION ALL
SELECT 'clients' as tabla, count(*) as registros FROM public.clients
UNION ALL
SELECT 'late_fee_history' as tabla, count(*) as registros FROM public.late_fee_history;

-- Verificar la configuración por defecto
SELECT key, value, description FROM public.system_settings WHERE key = 'default_late_fee_config';
