/*
  # Add complete client fields for comprehensive client management
  
  This migration adds all missing fields from the client registration form
  to support a complete client management system.
  
  Fields added:
  - Personal: nickname, nationality, gender, housing, dependents
  - Employment: employment_status
  - Business: rnc, recommended_by
  - Classification: color_classification, visible_in_loan_data
  - Custom: custom_field_1, custom_field_2
  - Contact: whatsapp, phone_secondary
  - Location: province, municipality, sector, collection_route
  - Banking: bank_user, bank_code, bank_token_identifier
  - Files: attachment_url
*/

DO $$
BEGIN
  -- Personal information fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'nickname'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN nickname TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'nationality'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN nationality TEXT DEFAULT 'Dominicano';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'gender'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN gender TEXT CHECK (gender IN ('M', 'F', 'MASCULINO', 'FEMENINO', 'Masculino', 'Femenino'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'housing'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN housing NUMERIC(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'dependents'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN dependents INTEGER DEFAULT 0;
  END IF;

  -- Employment status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'employment_status'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN employment_status TEXT;
  END IF;

  -- Business fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'rnc'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN rnc TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'recommended_by'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN recommended_by TEXT;
  END IF;

  -- Classification fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'color_classification'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN color_classification TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'visible_in_loan_data'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN visible_in_loan_data BOOLEAN DEFAULT true;
  END IF;

  -- Custom fields
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

  -- Contact fields
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

  -- Location fields
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

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'collection_route'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN collection_route TEXT;
  END IF;

  -- Banking additional fields
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

  -- File attachment
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN attachment_url TEXT;
  END IF;

  -- Created by field for tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.clients.nickname IS 'Apodo del cliente';
COMMENT ON COLUMN public.clients.nationality IS 'Nacionalidad del cliente';
COMMENT ON COLUMN public.clients.gender IS 'Sexo del cliente (M/F)';
COMMENT ON COLUMN public.clients.housing IS 'Gasto mensual en vivienda';
COMMENT ON COLUMN public.clients.dependents IS 'Número de dependientes';
COMMENT ON COLUMN public.clients.employment_status IS 'Situación laboral del cliente';
COMMENT ON COLUMN public.clients.rnc IS 'Registro Nacional del Contribuyente';
COMMENT ON COLUMN public.clients.recommended_by IS 'Persona que recomendó al cliente';
COMMENT ON COLUMN public.clients.color_classification IS 'Clasificación por color para organización';
COMMENT ON COLUMN public.clients.visible_in_loan_data IS 'Si el cliente es visible en los datos de préstamos';
COMMENT ON COLUMN public.clients.custom_field_1 IS 'Campo personalizado 1';
COMMENT ON COLUMN public.clients.custom_field_2 IS 'Campo personalizado 2';
COMMENT ON COLUMN public.clients.whatsapp IS 'Número de WhatsApp del cliente';
COMMENT ON COLUMN public.clients.phone_secondary IS 'Teléfono secundario del cliente';
COMMENT ON COLUMN public.clients.province IS 'Provincia donde reside el cliente';
COMMENT ON COLUMN public.clients.municipality IS 'Municipio donde reside el cliente';
COMMENT ON COLUMN public.clients.sector IS 'Sector donde reside el cliente';
COMMENT ON COLUMN public.clients.collection_route IS 'Ruta de cobro/entrega asignada';
COMMENT ON COLUMN public.clients.bank_user IS 'Usuario del internet banking';
COMMENT ON COLUMN public.clients.bank_code IS 'Código/clave del internet banking';
COMMENT ON COLUMN public.clients.bank_token_identifier IS 'Identificador del token o tarjeta de claves';
COMMENT ON COLUMN public.clients.attachment_url IS 'URL del archivo adjunto del cliente';

