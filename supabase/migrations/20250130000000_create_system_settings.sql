-- Crear tabla system_settings para configuración global
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);

-- Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura a usuarios autenticados
CREATE POLICY "Allow authenticated users to read system settings" ON public.system_settings
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política para permitir inserción/actualización a usuarios autenticados
CREATE POLICY "Allow authenticated users to manage system settings" ON public.system_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- Crear trigger para updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();

-- Insertar configuración por defecto de mora
INSERT INTO public.system_settings (key, value, description) VALUES 
(
    'default_late_fee_config',
    '{"default_late_fee_enabled": false, "default_late_fee_rate": 2.0, "default_grace_period_days": 0, "default_max_late_fee": 0, "default_late_fee_calculation_type": "daily"}',
    'Configuración por defecto para la mora en nuevos préstamos'
) ON CONFLICT (key) DO NOTHING;
