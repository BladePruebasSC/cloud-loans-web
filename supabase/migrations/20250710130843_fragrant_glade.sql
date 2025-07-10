/*
  # Add missing fields to clients table

  1. Changes
    - Add missing fields to clients table for complete client management
    - Add fields for marital status, emergency contacts, work information, banking info
    - Add references field as JSONB for storing multiple references

  2. Security
    - Maintain existing RLS policies
*/

DO $$
BEGIN
  -- Add marital status fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'marital_status'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN marital_status TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'spouse_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN spouse_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'spouse_phone'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN spouse_phone TEXT;
  END IF;

  -- Add emergency contact fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN emergency_contact_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN emergency_contact_phone TEXT;
  END IF;

  -- Add workplace information
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'workplace_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN workplace_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'workplace_address'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN workplace_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'workplace_phone'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN workplace_phone TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'years_employed'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN years_employed INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'supervisor_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN supervisor_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'supervisor_phone'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN supervisor_phone TEXT;
  END IF;

  -- Add banking information
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN bank_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN account_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'routing_number'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN routing_number TEXT;
  END IF;

  -- Add references as JSONB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'references_json'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN references_json JSONB;
  END IF;

  -- Add updated_at field if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  END IF;
END $$;