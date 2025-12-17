/*
  # Crear tablas para gestión bancaria

  1. Tabla bank_accounts
    - Almacena las cuentas bancarias de la empresa
    - Relacionada con company_owner_id para multi-tenant

  2. Tabla bank_transactions
    - Almacena los movimientos bancarios
    - Relacionada con bank_accounts
*/

-- Tabla de cuentas bancarias
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_owner_id UUID REFERENCES auth.users(id) NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'business')),
  account_number TEXT NOT NULL,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de transacciones bancarias
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.bank_accounts(id) ON DELETE CASCADE NOT NULL,
  company_owner_id UUID REFERENCES auth.users(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(15, 2) NOT NULL,
  description TEXT NOT NULL,
  reference_number TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_owner ON public.bank_accounts(company_owner_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_status ON public.bank_accounts(status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON public.bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_owner ON public.bank_transactions(company_owner_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_type ON public.bank_transactions(type);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_bank_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_accounts_updated_at();

-- Habilitar RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para bank_accounts
CREATE POLICY "Company users can view their bank accounts"
  ON public.bank_accounts
  FOR SELECT
  TO authenticated
  USING (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can create bank accounts"
  ON public.bank_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can update their bank accounts"
  ON public.bank_accounts
  FOR UPDATE
  TO authenticated
  USING (company_owner_id = get_user_company_id())
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can delete their bank accounts"
  ON public.bank_accounts
  FOR DELETE
  TO authenticated
  USING (company_owner_id = get_user_company_id());

-- Políticas RLS para bank_transactions
CREATE POLICY "Company users can view their bank transactions"
  ON public.bank_transactions
  FOR SELECT
  TO authenticated
  USING (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can create bank transactions"
  ON public.bank_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can update their bank transactions"
  ON public.bank_transactions
  FOR UPDATE
  TO authenticated
  USING (company_owner_id = get_user_company_id())
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can delete their bank transactions"
  ON public.bank_transactions
  FOR DELETE
  TO authenticated
  USING (company_owner_id = get_user_company_id());

