/*
  # Agregar campo amount como alias de total_amount en installments

  1. Nuevo campo
    - amount: DECIMAL(10,2) - Alias de total_amount para mantener compatibilidad con el código existente
    - Se calcula automáticamente como total_amount para mantener consistencia

  2. Razón
    - El código usa `installment.amount` pero la tabla solo tiene `total_amount`
    - Agregar `amount` como campo calculado o columna adicional para evitar problemas de redondeo
*/

-- Agregar campo amount a la tabla installments (si no existe)
ALTER TABLE public.installments 
ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);

-- Actualizar amount con el valor de total_amount para registros existentes
UPDATE public.installments 
SET amount = total_amount 
WHERE amount IS NULL OR amount = 0;

-- Hacer que amount sea NOT NULL después de la actualización
ALTER TABLE public.installments 
ALTER COLUMN amount SET NOT NULL;

-- Crear índice para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_installments_amount ON public.installments(amount);

-- Comentario para documentar el campo
COMMENT ON COLUMN public.installments.amount IS 'Monto total de la cuota (alias de total_amount para compatibilidad). Debe ser igual a principal_amount + interest_amount.';

-- Crear trigger para mantener amount sincronizado con total_amount
CREATE OR REPLACE FUNCTION sync_installment_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Si amount no está definido o es diferente de total_amount, sincronizar
  IF NEW.amount IS NULL OR NEW.amount != NEW.total_amount THEN
    NEW.amount := NEW.total_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger antes de insertar o actualizar
DROP TRIGGER IF EXISTS trigger_sync_installment_amount ON public.installments;
CREATE TRIGGER trigger_sync_installment_amount
  BEFORE INSERT OR UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION sync_installment_amount();

