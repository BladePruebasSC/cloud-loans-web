-- Actualizar tabla loan_history para soportar agregar cargo y eliminar mora
-- Agregar nuevos tipos de cambio
ALTER TABLE public.loan_history 
  DROP CONSTRAINT IF EXISTS loan_history_change_type_check;

ALTER TABLE public.loan_history 
  ADD CONSTRAINT loan_history_change_type_check 
  CHECK (change_type IN (
    'payment', 
    'partial_payment', 
    'interest_adjustment', 
    'term_extension', 
    'balance_adjustment', 
    'rate_change', 
    'status_change',
    'add_charge',
    'remove_late_fee'
  ));

-- Agregar nuevas columnas para soportar la estructura completa
ALTER TABLE public.loan_history 
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS charge_date DATE,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Migrar datos existentes de old_value y new_value a old_values y new_values si existen
-- (Esto es para mantener compatibilidad con datos antiguos)
UPDATE public.loan_history 
SET old_values = jsonb_build_object('value', old_value),
    new_values = jsonb_build_object('value', new_value)
WHERE (old_values IS NULL OR new_values IS NULL) 
  AND (old_value IS NOT NULL OR new_value IS NOT NULL);

-- Crear índice para mejorar búsquedas por tipo de cambio
CREATE INDEX IF NOT EXISTS idx_loan_history_change_type_new ON public.loan_history(change_type);

-- Habilitar RLS si no está habilitado
ALTER TABLE public.loan_history ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Users can view loan history for their loans" ON public.loan_history;
DROP POLICY IF EXISTS "Users can insert loan history for their loans" ON public.loan_history;

-- Crear políticas RLS para loan_history
-- Permitir ver historial de préstamos propios
CREATE POLICY "Users can view loan history for their loans" ON public.loan_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = loan_history.loan_id 
      AND clients.user_id = auth.uid()
    )
  );

-- Permitir insertar historial de préstamos propios
CREATE POLICY "Users can insert loan history for their loans" ON public.loan_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = loan_history.loan_id 
      AND clients.user_id = auth.uid()
    )
  );

