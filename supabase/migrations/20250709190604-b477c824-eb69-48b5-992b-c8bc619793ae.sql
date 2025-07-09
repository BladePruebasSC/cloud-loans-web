
-- Crear tabla de perfiles de usuarios
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  dni TEXT UNIQUE,
  address TEXT,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);

-- Crear tabla de clientes (puede ser diferente del usuario logueado, para agentes)
CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  address TEXT,
  city TEXT,
  birth_date DATE,
  occupation TEXT,
  monthly_income DECIMAL(10,2),
  credit_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de préstamos
CREATE TABLE public.loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  loan_officer_id UUID REFERENCES auth.users(id),
  amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) NOT NULL,
  term_months INTEGER NOT NULL,
  monthly_payment DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  remaining_balance DECIMAL(12,2) NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  next_payment_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'paid', 'overdue', 'defaulted', 'cancelled')),
  loan_type TEXT DEFAULT 'personal' CHECK (loan_type IN ('personal', 'business', 'emergency', 'vehicle', 'home')),
  purpose TEXT,
  collateral TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de pagos
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.loans(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  principal_amount DECIMAL(10,2) NOT NULL,
  interest_amount DECIMAL(10,2) NOT NULL,
  late_fee DECIMAL(10,2) DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card', 'online')),
  reference_number TEXT,
  notes TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de capital invertido/fondos
CREATE TABLE public.capital_funds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_id UUID REFERENCES auth.users(id),
  amount DECIMAL(12,2) NOT NULL,
  fund_type TEXT DEFAULT 'investment' CHECK (fund_type IN ('investment', 'loan', 'equity', 'other')),
  investment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_rate DECIMAL(5,2),
  maturity_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'matured')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de gastos operativos
CREATE TABLE public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  receipt_url TEXT,
  status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear tabla de configuración del sistema
CREATE TABLE public.system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Políticas RLS para clients (los usuarios pueden ver sus propios clientes)
CREATE POLICY "Users can view their own clients" ON public.clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create clients" ON public.clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" ON public.clients
  FOR UPDATE USING (auth.uid() = user_id);

-- Políticas RLS para loans
CREATE POLICY "Users can view loans for their clients" ON public.loans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create loans for their clients" ON public.loans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update loans for their clients" ON public.loans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = auth.uid()
    )
  );

-- Políticas RLS para payments
CREATE POLICY "Users can view payments for their loans" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = payments.loan_id 
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create payments for their loans" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = payments.loan_id 
      AND clients.user_id = auth.uid()
    )
  );

-- Políticas RLS para capital_funds
CREATE POLICY "Users can view their own capital funds" ON public.capital_funds
  FOR SELECT USING (auth.uid() = investor_id);

CREATE POLICY "Users can create their own capital funds" ON public.capital_funds
  FOR INSERT WITH CHECK (auth.uid() = investor_id);

CREATE POLICY "Users can update their own capital funds" ON public.capital_funds
  FOR UPDATE USING (auth.uid() = investor_id);

-- Políticas RLS para expenses
CREATE POLICY "Users can view expenses they created" ON public.expenses
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Políticas RLS para system_settings (solo lectura para usuarios autenticados)
CREATE POLICY "Authenticated users can view system settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

-- Función para crear perfil automáticamente cuando un usuario se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, dni)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario'),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'dni'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil automáticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insertar configuraciones básicas del sistema
INSERT INTO public.system_settings (setting_key, setting_value, description) VALUES
('default_interest_rate', '15.0', 'Tasa de interés por defecto'),
('late_fee_percentage', '5.0', 'Porcentaje de mora'),
('max_loan_amount', '100000.00', 'Monto máximo de préstamo'),
('min_loan_amount', '1000.00', 'Monto mínimo de préstamo'),
('max_loan_term', '60', 'Plazo máximo en meses'),
('min_loan_term', '6', 'Plazo mínimo en meses'),
('company_name', 'PrestamosFácil', 'Nombre de la empresa'),
('company_phone', '+1-234-567-8900', 'Teléfono de la empresa'),
('company_email', 'info@prestamosfacil.com', 'Email de la empresa');
