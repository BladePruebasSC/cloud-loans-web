-- Función para insertar cambios de tasa con fecha parseada correctamente como DATE local
-- Esto evita problemas de zona horaria cuando se envía una fecha como string YYYY-MM-DD
CREATE OR REPLACE FUNCTION insert_pawn_rate_change(
  p_pawn_transaction_id UUID,
  p_old_rate DECIMAL(5,2),
  p_new_rate DECIMAL(5,2),
  p_reason TEXT,
  p_effective_date TEXT, -- Recibir como string para parsear correctamente
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_effective_date DATE;
BEGIN
  -- Parsear la fecha como DATE local (no UTC) para evitar problemas de zona horaria
  -- La fecha viene en formato YYYY-MM-DD, parsearla directamente como DATE
  v_effective_date := p_effective_date::DATE;
  
  -- Insertar el registro
  INSERT INTO pawn_rate_changes (
    pawn_transaction_id,
    old_rate,
    new_rate,
    reason,
    effective_date,
    user_id,
    changed_at
  ) VALUES (
    p_pawn_transaction_id,
    p_old_rate,
    p_new_rate,
    p_reason,
    v_effective_date, -- Usar la fecha parseada como DATE
    p_user_id,
    NOW()
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Comentario para documentación
COMMENT ON FUNCTION insert_pawn_rate_change IS 'Inserta un cambio de tasa parseando la fecha como DATE local para evitar problemas de zona horaria';

