-- Migración completa para tabla portfolios con RLS y campos adicionales
-- Esta migración mejora la tabla portfolios existente y agrega funcionalidades necesarias

-- Asegurar que la tabla portfolios exista con los campos básicos
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar columnas adicionales si no existen
DO $$ 
BEGIN
    -- Si existe user_id pero no company_id, copiar user_id a company_id y luego eliminar user_id
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'portfolios' 
               AND column_name = 'user_id' 
               AND table_schema = 'public')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'portfolios' 
                       AND column_name = 'company_id' 
                       AND table_schema = 'public') THEN
        -- Agregar company_id y copiar valores de user_id
        ALTER TABLE public.portfolios ADD COLUMN company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        UPDATE public.portfolios SET company_id = user_id WHERE company_id IS NULL;
        -- Eliminar políticas que dependen de user_id antes de eliminar la columna
        DROP POLICY IF EXISTS "Users can manage their portfolios" ON public.portfolios;
        -- Solo eliminar política de portfolio_loans si la tabla existe
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portfolio_loans' AND table_schema = 'public') THEN
            DROP POLICY IF EXISTS "Users can manage portfolio loans" ON public.portfolio_loans;
        END IF;
        -- Eliminar la columna user_id ya que usaremos company_id
        ALTER TABLE public.portfolios DROP COLUMN IF EXISTS user_id;
    END IF;
    
    -- Agregar company_id si no existe (es la columna más importante)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'company_id' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN company_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        -- Si existe user_id, copiar sus valores a company_id
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'user_id' 
                   AND table_schema = 'public') THEN
            UPDATE public.portfolios SET company_id = user_id WHERE company_id IS NULL;
        END IF;
    END IF;
    
    -- Si user_id existe y company_id también, eliminar políticas dependientes y luego user_id
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'portfolios' 
               AND column_name = 'user_id' 
               AND table_schema = 'public')
       AND EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'company_id' 
                   AND table_schema = 'public') THEN
        -- Eliminar políticas que dependen de user_id
        DROP POLICY IF EXISTS "Users can manage their portfolios" ON public.portfolios;
        -- Solo eliminar política de portfolio_loans si la tabla existe
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portfolio_loans' AND table_schema = 'public') THEN
            DROP POLICY IF EXISTS "Users can manage portfolio loans" ON public.portfolio_loans;
        END IF;
        -- Ahora eliminar la columna user_id
        ALTER TABLE public.portfolios DROP COLUMN IF EXISTS user_id;
    END IF;
    
    -- Agregar status si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'status' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived'));
        -- Actualizar registros existentes
        UPDATE public.portfolios SET status = 'active' WHERE status IS NULL;
    END IF;
    
    -- Agregar color si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'color' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN color TEXT DEFAULT '#3B82F6';
        -- Actualizar registros existentes
        UPDATE public.portfolios SET color = '#3B82F6' WHERE color IS NULL;
    END IF;
    
    -- Agregar target_yield si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'target_yield' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN target_yield DECIMAL(5,2);
    END IF;
    
    -- Agregar max_loan_amount si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'max_loan_amount' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN max_loan_amount DECIMAL(12,2);
    END IF;
    
    -- Agregar min_loan_amount si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'min_loan_amount' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN min_loan_amount DECIMAL(12,2);
    END IF;
    
    -- Agregar updated_at si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'portfolios' 
                   AND column_name = 'updated_at' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.portfolios ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        -- Actualizar registros existentes
        UPDATE public.portfolios SET updated_at = created_at WHERE updated_at IS NULL;
    END IF;
END $$;

-- Asegurar que la columna portfolio_id existe en loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE SET NULL;

-- Crear índices para mejorar el rendimiento (después de agregar las columnas)
-- Solo crear índices si las columnas existen
DO $$
BEGIN
    -- Índice para company_id
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'portfolios' 
               AND column_name = 'company_id' 
               AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_portfolios_company_id ON public.portfolios(company_id);
    END IF;
    
    -- Índice para status
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'portfolios' 
               AND column_name = 'status' 
               AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_portfolios_status ON public.portfolios(status);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loans_portfolio_id ON public.loans(portfolio_id);

-- Habilitar RLS
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si las hay (incluyendo las nuevas)
DROP POLICY IF EXISTS "Users can view their own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can create their own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can update their own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can delete their own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can view their own company portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can create portfolios for their company" ON public.portfolios;
DROP POLICY IF EXISTS "Users can update their own company portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "Users can delete their own company portfolios" ON public.portfolios;

-- Crear función para obtener company_id del usuario
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
  -- Si el usuario es un empleado, obtener el company_owner_id de la tabla employees
  -- Si no es empleado (es dueño), usar directamente auth.uid()
  RETURN COALESCE(
    (SELECT company_owner_id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1),
    auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas RLS para portfolios
CREATE POLICY "Users can view their own company portfolios" 
ON public.portfolios 
FOR SELECT 
USING (company_id = get_user_company_id());

CREATE POLICY "Users can create portfolios for their company" 
ON public.portfolios 
FOR INSERT 
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update their own company portfolios" 
ON public.portfolios 
FOR UPDATE 
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can delete their own company portfolios" 
ON public.portfolios 
FOR DELETE 
USING (company_id = get_user_company_id());

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_portfolios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS portfolios_updated_at_trigger ON public.portfolios;
CREATE TRIGGER portfolios_updated_at_trigger
    BEFORE UPDATE ON public.portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_portfolios_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE public.portfolios IS 'Tabla para gestionar carteras de préstamos';
COMMENT ON COLUMN public.portfolios.name IS 'Nombre de la cartera';
COMMENT ON COLUMN public.portfolios.description IS 'Descripción de la cartera';
COMMENT ON COLUMN public.portfolios.company_id IS 'ID de la empresa propietaria';
COMMENT ON COLUMN public.portfolios.status IS 'Estado de la cartera: active, inactive, archived';
COMMENT ON COLUMN public.portfolios.color IS 'Color hexadecimal para identificación visual';
COMMENT ON COLUMN public.portfolios.target_yield IS 'Rendimiento objetivo anual en porcentaje';
COMMENT ON COLUMN public.portfolios.max_loan_amount IS 'Monto máximo de préstamo permitido en esta cartera';
COMMENT ON COLUMN public.portfolios.min_loan_amount IS 'Monto mínimo de préstamo permitido en esta cartera';

