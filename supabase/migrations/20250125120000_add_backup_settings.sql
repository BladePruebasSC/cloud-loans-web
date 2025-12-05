-- Agregar campos de configuración de backup automático a company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS auto_backup_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_backup_interval_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS auto_backup_format TEXT DEFAULT 'excel' CHECK (auto_backup_format IN ('excel', 'csv', 'pdf')),
  ADD COLUMN IF NOT EXISTS last_backup_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_backup_date TIMESTAMP WITH TIME ZONE;

-- Comentarios
COMMENT ON COLUMN public.company_settings.auto_backup_enabled IS 'Habilitar backups automáticos';
COMMENT ON COLUMN public.company_settings.auto_backup_interval_hours IS 'Intervalo en horas entre backups automáticos';
COMMENT ON COLUMN public.company_settings.auto_backup_format IS 'Formato de backup automático (excel, csv, pdf)';
COMMENT ON COLUMN public.company_settings.last_backup_date IS 'Fecha del último backup automático';
COMMENT ON COLUMN public.company_settings.next_backup_date IS 'Fecha del próximo backup automático programado';

