-- Add logo_url column to company_settings if it doesn't exist
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.company_settings.logo_url IS 'URL del logo de la empresa almacenado en Supabase Storage';

