-- Agregar columna company_id a la tabla clients si no existe
DO $$
BEGIN
    -- Verificar si la columna company_id existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clients' 
        AND column_name = 'company_id'
        AND table_schema = 'public'
    ) THEN
        -- Agregar la columna company_id
        ALTER TABLE public.clients 
        ADD COLUMN company_id UUID;
        
        RAISE NOTICE 'Columna company_id agregada a la tabla clients';
    ELSE
        RAISE NOTICE 'La columna company_id ya existe en la tabla clients';
    END IF;
END $$;

-- Verificar la estructura actualizada
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Mostrar algunos registros para verificar
SELECT id, full_name, company_id, created_at 
FROM public.clients 
LIMIT 5;
