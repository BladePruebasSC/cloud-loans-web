-- Add document_templates column to company_settings for storing custom document templates
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS document_templates JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_settings.document_templates IS 'Plantillas personalizadas de documentos en formato JSON. Cada clave es el tipo de documento y el valor contiene el contenido y metadatos de la plantilla.';

