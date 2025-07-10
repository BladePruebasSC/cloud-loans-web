
-- Tabla para días feriados
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para rutas
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_location TEXT,
  end_location TEXT,
  estimated_duration_minutes INTEGER,
  distance_km NUMERIC,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para empleados/usuarios de la empresa
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_owner_id UUID REFERENCES auth.users NOT NULL, -- El dueño de la empresa
  user_id UUID REFERENCES auth.users, -- Usuario asociado (si tiene cuenta)
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  dni TEXT,
  position TEXT,
  department TEXT,
  hire_date DATE DEFAULT CURRENT_DATE,
  salary NUMERIC,
  status TEXT DEFAULT 'active',
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para configuraciones generales del sistema
CREATE TABLE public.system_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, config_key)
);

-- Tabla para gastos/egresos
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  receipt_url TEXT,
  status TEXT DEFAULT 'approved',
  created_by UUID REFERENCES auth.users,
  approved_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para ingresos
CREATE TABLE public.income (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT DEFAULT 'other',
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para caja/movimientos de efectivo
CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL, -- 'in' o 'out'
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  reference_id UUID, -- Para referenciar préstamos, ventas, etc.
  reference_type TEXT, -- 'loan', 'sale', 'expense', etc.
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para reportes guardados
CREATE TABLE public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agregar campos faltantes a la tabla loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_name TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_phone TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_address TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS guarantor_dni TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approval_date DATE;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users;

-- Habilitar RLS en todas las nuevas tablas
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para holidays
CREATE POLICY "Users can manage their holidays" ON public.holidays
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para routes
CREATE POLICY "Users can manage their routes" ON public.routes
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para employees
CREATE POLICY "Company owners can manage their employees" ON public.employees
  FOR ALL USING (auth.uid() = company_owner_id);

-- Políticas RLS para system_configurations
CREATE POLICY "Users can manage their configurations" ON public.system_configurations
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para expenses
CREATE POLICY "Users can manage their expenses" ON public.expenses
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para income
CREATE POLICY "Users can manage their income" ON public.income
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para cash_movements
CREATE POLICY "Users can manage their cash movements" ON public.cash_movements
  FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para saved_reports
CREATE POLICY "Users can manage their saved reports" ON public.saved_reports
  FOR ALL USING (auth.uid() = user_id);
