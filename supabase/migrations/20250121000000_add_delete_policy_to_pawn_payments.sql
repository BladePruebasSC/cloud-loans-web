-- Agregar política de eliminación para pawn_payments
-- Esta política permite a los usuarios eliminar pagos de sus propias transacciones

CREATE POLICY "Users can delete their own pawn payments"
  ON public.pawn_payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.pawn_transactions 
    WHERE pawn_transactions.id = pawn_payments.pawn_transaction_id 
    AND pawn_transactions.user_id = auth.uid()
  ));

-- Comentario para documentar la política
COMMENT ON POLICY "Users can delete their own pawn payments" ON public.pawn_payments IS 
'Permite a los usuarios eliminar pagos de sus propias transacciones de compra-venta';

