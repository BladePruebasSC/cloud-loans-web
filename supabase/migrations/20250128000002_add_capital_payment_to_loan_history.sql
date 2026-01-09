-- Agregar 'capital_payment' a los valores permitidos en loan_history.change_type
-- Primero, encontrar y eliminar la restricción existente (puede tener diferentes nombres según la versión de PostgreSQL)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Buscar el nombre de la restricción CHECK en change_type
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.loan_history'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%change_type%';
    
    -- Si se encontró, eliminarla
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.loan_history DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
END $$;

-- Actualizar cualquier fila que tenga valores no permitidos antes de agregar la nueva restricción
-- Esto asegura que todas las filas cumplan con la nueva restricción
UPDATE public.loan_history
SET change_type = 'balance_adjustment'
WHERE change_type NOT IN (
  'payment', 
  'partial_payment', 
  'interest_adjustment', 
  'term_extension', 
  'balance_adjustment', 
  'rate_change', 
  'status_change',
  'capital_payment'
);

-- Agregar la nueva restricción con 'capital_payment' incluido
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
  'capital_payment'
));

