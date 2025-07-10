/*
  # Add loan requests table

  1. New Tables
    - `loan_requests`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `client_id` (uuid, references clients)
      - `requested_amount` (numeric)
      - `purpose` (text)
      - `monthly_income` (numeric)
      - `employment_status` (text)
      - `existing_debts` (numeric)
      - `collateral_description` (text)
      - `income_verification` (text)
      - `status` (text) - pending, approved, rejected, under_review
      - `review_notes` (text)
      - `reviewed_by` (uuid, references auth.users)
      - `reviewed_at` (timestamp)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `loan_requests` table
    - Add policies for users to manage loan requests for their clients
*/

CREATE TABLE IF NOT EXISTS public.loan_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  requested_amount NUMERIC NOT NULL,
  purpose TEXT,
  monthly_income NUMERIC,
  employment_status TEXT,
  existing_debts NUMERIC DEFAULT 0,
  collateral_description TEXT,
  income_verification TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'under_review')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage loan requests for their clients"
  ON public.loan_requests
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loan_requests.client_id 
      AND clients.user_id = auth.uid()
    )
  );