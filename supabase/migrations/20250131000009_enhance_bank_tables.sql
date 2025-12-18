-- Migración para mejorar las tablas de banco
-- Agrega campos necesarios para transferencias, conciliación y mejor gestión

-- Agregar campos a bank_transactions para transferencias
ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'transfer', 'card', 'online', 'other')) DEFAULT 'transfer';

-- Comentarios para documentar los nuevos campos
COMMENT ON COLUMN public.bank_transactions.to_account_id IS 'ID de la cuenta destino para transferencias entre cuentas';
COMMENT ON COLUMN public.bank_transactions.is_reconciled IS 'Indica si la transacción ha sido conciliada con el estado de cuenta del banco';
COMMENT ON COLUMN public.bank_transactions.reconciled_at IS 'Fecha y hora en que se concilió la transacción';
COMMENT ON COLUMN public.bank_transactions.reconciled_by IS 'Usuario que realizó la conciliación';
COMMENT ON COLUMN public.bank_transactions.category IS 'Categoría de la transacción (ej: nómina, servicios, préstamos, etc.)';
COMMENT ON COLUMN public.bank_transactions.payment_method IS 'Método de pago utilizado';

-- Agregar campos a bank_accounts para mejor gestión
ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'DOP',
ADD COLUMN IF NOT EXISTS last_reconciled_date DATE,
ADD COLUMN IF NOT EXISTS last_reconciled_balance NUMERIC(15, 2);

-- Comentarios para los nuevos campos de bank_accounts
COMMENT ON COLUMN public.bank_accounts.currency IS 'Moneda de la cuenta (DOP, USD, etc.)';
COMMENT ON COLUMN public.bank_accounts.last_reconciled_date IS 'Última fecha en que se concilió esta cuenta';
COMMENT ON COLUMN public.bank_accounts.last_reconciled_balance IS 'Balance al momento de la última conciliación';

-- Crear tabla para conciliaciones bancarias
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.bank_accounts(id) ON DELETE CASCADE NOT NULL,
  company_owner_id UUID REFERENCES auth.users(id) NOT NULL,
  reconciliation_date DATE NOT NULL,
  system_balance NUMERIC(15, 2) NOT NULL,
  bank_balance NUMERIC(15, 2) NOT NULL,
  difference NUMERIC(15, 2) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_bank_transactions_to_account ON public.bank_transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON public.bank_transactions(is_reconciled);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON public.bank_transactions(category);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_account ON public.bank_reconciliations(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company ON public.bank_reconciliations(company_owner_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_date ON public.bank_reconciliations(reconciliation_date);

-- Habilitar RLS para bank_reconciliations
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para bank_reconciliations
CREATE POLICY "Company users can view their bank reconciliations"
  ON public.bank_reconciliations
  FOR SELECT
  TO authenticated
  USING (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can create bank reconciliations"
  ON public.bank_reconciliations
  FOR INSERT
  TO authenticated
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can update their bank reconciliations"
  ON public.bank_reconciliations
  FOR UPDATE
  TO authenticated
  USING (company_owner_id = get_user_company_id())
  WITH CHECK (company_owner_id = get_user_company_id());

CREATE POLICY "Company users can delete their bank reconciliations"
  ON public.bank_reconciliations
  FOR DELETE
  TO authenticated
  USING (company_owner_id = get_user_company_id());

-- Función para actualizar el balance de la cuenta automáticamente cuando se crea una transacción
CREATE OR REPLACE FUNCTION update_account_balance_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  account_balance NUMERIC(15, 2);
  transaction_amount NUMERIC(15, 2);
BEGIN
  -- Obtener el balance actual de la cuenta
  SELECT balance INTO account_balance
  FROM public.bank_accounts
  WHERE id = NEW.account_id;

  -- Calcular el nuevo balance según el tipo de transacción
  IF NEW.type = 'income' THEN
    account_balance := account_balance + NEW.amount;
  ELSIF NEW.type = 'expense' THEN
    account_balance := account_balance - NEW.amount;
  ELSIF NEW.type = 'transfer' AND NEW.to_account_id IS NOT NULL THEN
    -- Para transferencias, restar de la cuenta origen
    account_balance := account_balance - NEW.amount;
    
    -- Actualizar la cuenta destino
    UPDATE public.bank_accounts
    SET balance = balance + NEW.amount,
        updated_at = now()
    WHERE id = NEW.to_account_id;
  END IF;

  -- Actualizar el balance de la cuenta origen
  UPDATE public.bank_accounts
  SET balance = account_balance,
      updated_at = now()
  WHERE id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar balance automáticamente
DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.bank_transactions;
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance_on_transaction();

-- Función para revertir el balance cuando se elimina una transacción
CREATE OR REPLACE FUNCTION revert_account_balance_on_transaction_delete()
RETURNS TRIGGER AS $$
DECLARE
  account_balance NUMERIC(15, 2);
BEGIN
  -- Obtener el balance actual de la cuenta
  SELECT balance INTO account_balance
  FROM public.bank_accounts
  WHERE id = OLD.account_id;

  -- Revertir el balance según el tipo de transacción
  IF OLD.type = 'income' THEN
    account_balance := account_balance - OLD.amount;
  ELSIF OLD.type = 'expense' THEN
    account_balance := account_balance + OLD.amount;
  ELSIF OLD.type = 'transfer' AND OLD.to_account_id IS NOT NULL THEN
    -- Para transferencias, revertir ambas cuentas
    account_balance := account_balance + OLD.amount;
    
    -- Revertir la cuenta destino
    UPDATE public.bank_accounts
    SET balance = balance - OLD.amount,
        updated_at = now()
    WHERE id = OLD.to_account_id;
  END IF;

  -- Actualizar el balance de la cuenta origen
  UPDATE public.bank_accounts
  SET balance = account_balance,
      updated_at = now()
  WHERE id = OLD.account_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger para revertir balance al eliminar
DROP TRIGGER IF EXISTS trigger_revert_account_balance ON public.bank_transactions;
CREATE TRIGGER trigger_revert_account_balance
  AFTER DELETE ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION revert_account_balance_on_transaction_delete();

