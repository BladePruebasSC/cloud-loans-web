/*
  # Add company settings table

  1. New Tables
    - `company_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `company_name` (text)
      - `business_type` (text)
      - `tax_id` (text)
      - `phone` (text)
      - `email` (text)
      - `address` (text)
      - `city` (text)
      - `state` (text)
      - `postal_code` (text)
      - `country` (text)
      - `logo_url` (text)
      - `website` (text)
      - `description` (text)
      - `currency` (text)
      - `interest_rate_default` (numeric)
      - `late_fee_percentage` (numeric)
      - `grace_period_days` (integer)
      - `min_loan_amount` (numeric)
      - `max_loan_amount` (numeric)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `company_settings` table
    - Add policy for users to manage their own company settings
*/

CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_name TEXT NOT NULL,
  business_type TEXT,
  tax_id TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Dominican Republic',
  logo_url TEXT,
  website TEXT,
  description TEXT,
  currency TEXT DEFAULT 'DOP',
  interest_rate_default NUMERIC DEFAULT 15.0,
  late_fee_percentage NUMERIC DEFAULT 5.0,
  grace_period_days INTEGER DEFAULT 3,
  min_loan_amount NUMERIC DEFAULT 1000,
  max_loan_amount NUMERIC DEFAULT 500000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company settings"
  ON public.company_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);