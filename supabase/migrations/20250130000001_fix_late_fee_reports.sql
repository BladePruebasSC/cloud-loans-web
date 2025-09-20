-- Verificar y corregir la estructura de la tabla clients si es necesario
-- Agregar company_id si no existe
DO $$ 
BEGIN
    -- Verificar si la columna company_id existe en la tabla clients
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clients' 
        AND column_name = 'company_id'
        AND table_schema = 'public'
    ) THEN
        -- Agregar la columna company_id si no existe
        ALTER TABLE public.clients ADD COLUMN company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        
        -- Crear índice para mejor performance
        CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);
        
        -- Actualizar RLS si es necesario
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE tablename = 'clients' 
            AND policyname = 'Allow users to access their company clients'
        ) THEN
            -- Crear política RLS para clients
            CREATE POLICY "Allow users to access their company clients" ON public.clients
                FOR ALL USING (
                    company_id = auth.uid() OR 
                    company_id IN (
                        SELECT id FROM auth.users 
                        WHERE user_metadata->>'company_id' = (SELECT user_metadata->>'company_id' FROM auth.users WHERE id = auth.uid())
                    )
                );
        END IF;
    END IF;
END $$;

-- Verificar que la tabla late_fee_history existe y tiene la estructura correcta
CREATE TABLE IF NOT EXISTS public.late_fee_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    days_overdue INTEGER NOT NULL,
    late_fee_rate DECIMAL(5,2) NOT NULL,
    late_fee_amount DECIMAL(10,2) NOT NULL,
    total_late_fee DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Crear índices para late_fee_history si no existen
CREATE INDEX IF NOT EXISTS idx_late_fee_history_loan_id ON public.late_fee_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_late_fee_history_calculation_date ON public.late_fee_history(calculation_date);

-- Habilitar RLS en late_fee_history
ALTER TABLE public.late_fee_history ENABLE ROW LEVEL SECURITY;

-- Crear política RLS para late_fee_history
DROP POLICY IF EXISTS "Allow users to access their company late fee history" ON public.late_fee_history;
CREATE POLICY "Allow users to access their company late fee history" ON public.late_fee_history
    FOR ALL USING (
        loan_id IN (
            SELECT l.id FROM public.loans l
            JOIN public.clients c ON l.client_id = c.id
            WHERE c.company_id = auth.uid() OR 
                  c.company_id IN (
                      SELECT id FROM auth.users 
                      WHERE user_metadata->>'company_id' = (SELECT user_metadata->>'company_id' FROM auth.users WHERE id = auth.uid())
                  )
        )
    );
