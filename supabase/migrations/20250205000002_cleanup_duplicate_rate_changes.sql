-- Limpiar cambios de tasa duplicados en pawn_rate_changes
-- Esta migración elimina todos los cambios programados duplicados,
-- manteniendo solo el más reciente para cada combinación de transacción y fecha efectiva

-- Eliminar cambios duplicados, manteniendo solo el más reciente (por changed_at) para cada combinación
-- de pawn_transaction_id y effective_date
DELETE FROM public.pawn_rate_changes
WHERE id NOT IN (
    SELECT DISTINCT ON (pawn_transaction_id, effective_date) id
    FROM public.pawn_rate_changes
    ORDER BY pawn_transaction_id, effective_date, changed_at DESC
);

-- Comentario explicativo
COMMENT ON TABLE public.pawn_rate_changes IS 'Historial de cambios de tasa de interés para transacciones de empeño. Solo debe haber un cambio programado por transacción y fecha efectiva (el más reciente).';

