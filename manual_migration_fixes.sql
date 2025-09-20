-- Migración manual para corregir políticas RLS y constraints
-- Ejecutar este script en el SQL Editor del dashboard de Supabase

-- ============================================
-- CORRECCIÓN DE POLÍTICAS RLS PARA company_settings
-- ============================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Company users can manage company settings" ON public.company_settings;

-- Crear política para SELECT (lectura) - empleados y dueños pueden leer
DROP POLICY IF EXISTS "Company users and employees can read company settings" ON public.company_settings;
CREATE POLICY "Company users and employees can read company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    user_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.employees 
      WHERE employees.auth_user_id = auth.uid() 
      AND employees.company_owner_id = company_settings.user_id
      AND employees.status = 'active'
    )
  );

-- Crear política para INSERT (creación) - solo dueños pueden crear
DROP POLICY IF EXISTS "Only company owners can create company settings" ON public.company_settings;
CREATE POLICY "Only company owners can create company settings"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());

-- Crear política para UPDATE (actualización) - solo dueños pueden actualizar
DROP POLICY IF EXISTS "Only company owners can update company settings" ON public.company_settings;
CREATE POLICY "Only company owners can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = get_user_company_id())
  WITH CHECK (user_id = get_user_company_id());

-- También permitir acceso para validación de códigos de empresa (sin autenticación)
DROP POLICY IF EXISTS "Allow company code validation" ON public.company_settings;
CREATE POLICY "Allow company code validation"
  ON public.company_settings
  FOR SELECT
  TO anon
  USING (company_code_enabled = true);

-- Permitir inserción de configuraciones de empresa para nuevos usuarios
DROP POLICY IF EXISTS "Allow company settings creation" ON public.company_settings;
CREATE POLICY "Allow company settings creation"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());

-- ============================================
-- CORRECCIÓN DE CONSTRAINTS PARA loan_requests
-- ============================================

-- Agregar columnas si no existen
ALTER TABLE loan_requests 
ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS term_months INTEGER,
ADD COLUMN IF NOT EXISTS loan_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS amortization_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(50),
ADD COLUMN IF NOT EXISTS first_payment_date DATE,
ADD COLUMN IF NOT EXISTS closing_costs DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS late_fee BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS minimum_payment_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS minimum_payment_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS guarantor_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS guarantor_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS guarantor_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS guarantor_dni VARCHAR(20),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Agregar valores por defecto para campos requeridos
UPDATE loan_requests 
SET 
  interest_rate = COALESCE(interest_rate, 0),
  term_months = COALESCE(term_months, 12),
  loan_type = COALESCE(loan_type, 'personal'),
  amortization_type = COALESCE(amortization_type, 'simple'),
  payment_frequency = COALESCE(payment_frequency, 'monthly'),
  first_payment_date = COALESCE(first_payment_date, CURRENT_DATE + INTERVAL '1 month'),
  closing_costs = COALESCE(closing_costs, 0),
  late_fee = COALESCE(late_fee, FALSE),
  minimum_payment_type = COALESCE(minimum_payment_type, 'interest'),
  minimum_payment_percentage = COALESCE(minimum_payment_percentage, 100),
  guarantor_required = COALESCE(guarantor_required, FALSE)
WHERE 
  interest_rate IS NULL 
  OR term_months IS NULL 
  OR loan_type IS NULL 
  OR amortization_type IS NULL 
  OR payment_frequency IS NULL 
  OR first_payment_date IS NULL 
  OR closing_costs IS NULL 
  OR late_fee IS NULL 
  OR minimum_payment_type IS NULL 
  OR minimum_payment_percentage IS NULL 
  OR guarantor_required IS NULL;

-- Eliminar constraints existentes para evitar conflictos
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_interest_rate;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_term_months;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_closing_costs;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_minimum_payment_percentage;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_loan_type;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_amortization_type;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_payment_frequency;
ALTER TABLE loan_requests DROP CONSTRAINT IF EXISTS check_minimum_payment_type;

-- Agregar constraints para validación de datos
ALTER TABLE loan_requests 
ADD CONSTRAINT check_interest_rate CHECK (interest_rate >= 0),
ADD CONSTRAINT check_term_months CHECK (term_months > 0),
ADD CONSTRAINT check_closing_costs CHECK (closing_costs >= 0),
ADD CONSTRAINT check_minimum_payment_percentage CHECK (minimum_payment_percentage >= 0 AND minimum_payment_percentage <= 100);

-- Agregar constraints para valores enum-like
ALTER TABLE loan_requests 
ADD CONSTRAINT check_loan_type CHECK (loan_type IN ('personal', 'business', 'mortgage', 'auto', 'education')),
ADD CONSTRAINT check_amortization_type CHECK (amortization_type IN ('simple', 'german', 'american', 'indefinite')),
ADD CONSTRAINT check_payment_frequency CHECK (payment_frequency IN ('monthly', 'biweekly', 'weekly', 'daily')),
ADD CONSTRAINT check_minimum_payment_type CHECK (minimum_payment_type IN ('interest', 'principal', 'both'));

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_loan_requests_loan_type ON loan_requests(loan_type);
CREATE INDEX IF NOT EXISTS idx_loan_requests_amortization_type ON loan_requests(amortization_type);
CREATE INDEX IF NOT EXISTS idx_loan_requests_payment_frequency ON loan_requests(payment_frequency);
CREATE INDEX IF NOT EXISTS idx_loan_requests_first_payment_date ON loan_requests(first_payment_date);
