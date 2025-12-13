-- Agregar campo para categorías de gastos en company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS expense_categories JSONB DEFAULT '["Oficina", "Marketing", "Transporte", "Servicios", "Equipos", "Otros"]'::jsonb;

-- Comentario para documentación
COMMENT ON COLUMN public.company_settings.expense_categories IS 'Lista de categorías de gastos personalizadas para la empresa';

