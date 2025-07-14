/*
  # Sistema de Empleados con Usuarios Afiliados

  1. New Tables
    - `employees` - Empleados de la empresa con usuarios afiliados
      - `id` (uuid, primary key)
      - `company_owner_id` (uuid, references auth.users) - El dueño de la empresa
      - `auth_user_id` (uuid, references auth.users) - Usuario de autenticación del empleado
      - `full_name` (text)
      - `email` (text)
      - `phone` (text)
      - `dni` (text)
      - `position` (text)
      - `department` (text)
      - `hire_date` (date)
      - `salary` (numeric)
      - `status` (text) - active, inactive, suspended
      - `role` (text) - admin, manager, employee, collector
      - `permissions` (jsonb) - Permisos específicos del empleado
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `employees` table
    - Add policies for company owners to manage their employees
    - Add policies for employees to view their own data
*/

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_owner_id UUID REFERENCES auth.users(id) NOT NULL,
  auth_user_id UUID REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  dni TEXT,
  position TEXT,
  department TEXT,
  hire_date DATE DEFAULT CURRENT_DATE,
  salary NUMERIC,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'collector', 'accountant')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Políticas para que los dueños de empresa puedan gestionar sus empleados
CREATE POLICY "Company owners can manage their employees"
  ON public.employees
  FOR ALL
  TO authenticated
  USING (auth.uid() = company_owner_id);

-- Política para que los empleados puedan ver su propia información
CREATE POLICY "Employees can view their own data"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_employees_updated_at 
    BEFORE UPDATE ON public.employees 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();