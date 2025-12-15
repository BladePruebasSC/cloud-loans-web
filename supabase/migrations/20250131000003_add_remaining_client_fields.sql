/*
  # Add remaining client fields for complete form
  
  This migration adds the final missing fields from the client registration form:
  - first_name, last_name (separated from full_name for better organization)
  - photo_url (for client photo/avatar)
  - card_number (bank card number)
  
  Note: bank_name already exists from previous migrations
*/

DO $$
BEGIN
  -- Add first_name and last_name (separated from full_name)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN first_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN last_name TEXT;
  END IF;

  -- Add photo_url for client photo/avatar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN photo_url TEXT;
  END IF;

  -- Add card_number for bank card
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'card_number'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN card_number TEXT;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.clients.first_name IS 'Nombre del cliente';
COMMENT ON COLUMN public.clients.last_name IS 'Apellido del cliente';
COMMENT ON COLUMN public.clients.photo_url IS 'URL de la foto del cliente';
COMMENT ON COLUMN public.clients.card_number IS 'Número de tarjeta bancaria del cliente';

