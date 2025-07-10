/*
  # Add appointments table for scheduling

  1. New Tables
    - `appointments`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `client_id` (uuid, references clients)
      - `title` (text)
      - `description` (text)
      - `appointment_date` (date)
      - `appointment_time` (time)
      - `duration_minutes` (integer)
      - `location` (text)
      - `type` (text) - meeting, collection, consultation, etc.
      - `status` (text) - scheduled, confirmed, completed, cancelled
      - `reminder_sent` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `appointments` table
    - Add policies for users to manage their appointments
*/

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  title TEXT NOT NULL,
  description TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  type TEXT DEFAULT 'meeting' CHECK (type IN ('meeting', 'collection', 'consultation', 'documentation', 'other')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their appointments"
  ON public.appointments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);