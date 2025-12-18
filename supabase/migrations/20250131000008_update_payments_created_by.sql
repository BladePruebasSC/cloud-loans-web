-- Migración para actualizar el campo created_by en pagos existentes
-- Esto actualiza los pagos antiguos que tienen created_by = companyId del dueño
-- para que tengan created_by = loan_officer_id del préstamo asociado

-- Actualizar pagos existentes donde created_by no coincide con el loan_officer_id del préstamo
-- Solo actualizar si el loan_officer_id existe y es diferente del created_by actual
UPDATE public.payments p
SET created_by = l.loan_officer_id
FROM public.loans l
WHERE p.loan_id = l.id
  AND l.loan_officer_id IS NOT NULL
  AND (p.created_by IS NULL OR p.created_by != l.loan_officer_id);

-- Comentario para documentar el cambio
COMMENT ON COLUMN public.payments.created_by IS 'Usuario que registró el pago. Para pagos antiguos, se actualizó para coincidir con el loan_officer_id del préstamo.';

