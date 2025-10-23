-- Create pawn_transactions table for pawn shop module
CREATE TABLE IF NOT EXISTS public.pawn_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_description TEXT,
  estimated_value DECIMAL(12,2) NOT NULL,
  loan_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) NOT NULL DEFAULT 5.0,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'forfeited', 'extended')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create pawn_payments table to track payments
CREATE TABLE IF NOT EXISTS public.pawn_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pawn_transaction_id UUID REFERENCES public.pawn_transactions(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('partial', 'full', 'interest')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pawn_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pawn_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for pawn_transactions
CREATE POLICY "Users can view their own pawn transactions"
  ON public.pawn_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pawn transactions"
  ON public.pawn_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pawn transactions"
  ON public.pawn_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pawn transactions"
  ON public.pawn_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Create policies for pawn_payments
CREATE POLICY "Users can view their own pawn payments"
  ON public.pawn_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pawn_transactions 
    WHERE pawn_transactions.id = pawn_payments.pawn_transaction_id 
    AND pawn_transactions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create their own pawn payments"
  ON public.pawn_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pawn_transactions 
    WHERE pawn_transactions.id = pawn_payments.pawn_transaction_id 
    AND pawn_transactions.user_id = auth.uid()
  ));

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_pawn_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pawn_transactions_updated_at
  BEFORE UPDATE ON public.pawn_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pawn_transactions_updated_at();

-- Create indexes for better performance
CREATE INDEX idx_pawn_transactions_user_id ON public.pawn_transactions(user_id);
CREATE INDEX idx_pawn_transactions_client_id ON public.pawn_transactions(client_id);
CREATE INDEX idx_pawn_transactions_status ON public.pawn_transactions(status);
CREATE INDEX idx_pawn_payments_pawn_transaction_id ON public.pawn_payments(pawn_transaction_id);