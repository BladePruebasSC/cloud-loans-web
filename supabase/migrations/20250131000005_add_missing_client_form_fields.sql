/*
  # Add missing client form fields
  
  This migration adds all the missing fields from the client registration form
  that are being sent but don't exist in the database:
  - attachment_url (for file attachments)
  - bank_user, bank_code, bank_token_identifier (banking details)
  - recommended_by (referral information)
  - color_classification (client color coding)
  - visible_in_loan_data (boolean flag)
  - custom_field_1, custom_field_2 (custom fields)
  - created_by (user who created the client)
  - nickname (client nickname)
  - province, municipality, sector (location details)
  - collection_route (collection route)
  - housing, dependents (household information)
  - employment_status (employment status)
  - rnc (tax ID)
  - whatsapp, phone_secondary (additional contact info)
  - gender (gender field)
*/

DO $$
BEGIN
  -- Add attachment_url for file attachments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN attachment_url TEXT;
  END IF;

  -- Add nickname
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'nickname'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN nickname TEXT;
  END IF;

  -- Add gender
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'gender'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN gender TEXT;
  END IF;

  -- Add nationality
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'nationality'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN nationality TEXT DEFAULT 'Dominicano';
  END IF;

  -- Add province, municipality, sector (location details)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'province'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN province TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'municipality'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN municipality TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'sector'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN sector TEXT;
  END IF;

  -- Add collection_route
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'collection_route'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN collection_route TEXT;
  END IF;

  -- Add housing and dependents
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'housing'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN housing DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'dependents'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN dependents INTEGER;
  END IF;

  -- Add employment_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'employment_status'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN employment_status TEXT;
  END IF;

  -- Add RNC (tax ID)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'rnc'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN rnc TEXT;
  END IF;

  -- Add additional contact fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'whatsapp'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN whatsapp TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'phone_secondary'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN phone_secondary TEXT;
  END IF;

  -- Add banking details
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bank_user'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN bank_user TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bank_code'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN bank_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bank_token_identifier'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN bank_token_identifier TEXT;
  END IF;

  -- Add recommended_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'recommended_by'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN recommended_by TEXT;
  END IF;

  -- Add color_classification
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'color_classification'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN color_classification TEXT;
  END IF;

  -- Add visible_in_loan_data (boolean)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'visible_in_loan_data'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN visible_in_loan_data BOOLEAN DEFAULT true;
  END IF;

  -- Add custom fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'custom_field_1'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN custom_field_1 TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'custom_field_2'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN custom_field_2 TEXT;
  END IF;

  -- Add created_by (user who created the client)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.clients.attachment_url IS 'URL del archivo adjunto del cliente';
COMMENT ON COLUMN public.clients.nickname IS 'Apodo o sobrenombre del cliente';
COMMENT ON COLUMN public.clients.gender IS 'Género del cliente';
COMMENT ON COLUMN public.clients.nationality IS 'Nacionalidad del cliente';
COMMENT ON COLUMN public.clients.province IS 'Provincia del cliente';
COMMENT ON COLUMN public.clients.municipality IS 'Municipio del cliente';
COMMENT ON COLUMN public.clients.sector IS 'Sector del cliente';
COMMENT ON COLUMN public.clients.collection_route IS 'Ruta de cobro/entrega';
COMMENT ON COLUMN public.clients.housing IS 'Gasto en vivienda';
COMMENT ON COLUMN public.clients.dependents IS 'Número de dependientes';
COMMENT ON COLUMN public.clients.employment_status IS 'Estado de empleo';
COMMENT ON COLUMN public.clients.rnc IS 'RNC (Registro Nacional del Contribuyente)';
COMMENT ON COLUMN public.clients.whatsapp IS 'Número de WhatsApp';
COMMENT ON COLUMN public.clients.phone_secondary IS 'Teléfono secundario';
COMMENT ON COLUMN public.clients.bank_user IS 'Usuario bancario';
COMMENT ON COLUMN public.clients.bank_code IS 'Código bancario';
COMMENT ON COLUMN public.clients.bank_token_identifier IS 'Identificador de token bancario';
COMMENT ON COLUMN public.clients.recommended_by IS 'Recomendado por';
COMMENT ON COLUMN public.clients.color_classification IS 'Clasificación por color del cliente';
COMMENT ON COLUMN public.clients.visible_in_loan_data IS 'Visible en datos de préstamos';
COMMENT ON COLUMN public.clients.custom_field_1 IS 'Campo personalizado 1';
COMMENT ON COLUMN public.clients.custom_field_2 IS 'Campo personalizado 2';
COMMENT ON COLUMN public.clients.created_by IS 'Usuario que creó el cliente';

