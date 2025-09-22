-- Actualizar clientes existentes con company_id por defecto
-- NOTA: Reemplaza 'YOUR_COMPANY_ID_HERE' con el UUID real de tu empresa

DO $$
DECLARE
    default_company_id UUID := 'YOUR_COMPANY_ID_HERE'; -- ⚠️ CAMBIAR ESTE VALOR
    updated_count INTEGER;
BEGIN
    -- Verificar si hay clientes sin company_id
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id IS NULL;
    
    RAISE NOTICE 'Clientes sin company_id encontrados: %', updated_count;
    
    IF updated_count > 0 THEN
        -- Actualizar clientes sin company_id
        UPDATE public.clients 
        SET company_id = default_company_id
        WHERE company_id IS NULL;
        
        RAISE NOTICE 'Actualizados % clientes con company_id: %', updated_count, default_company_id;
    ELSE
        RAISE NOTICE 'Todos los clientes ya tienen company_id asignado';
    END IF;
    
    -- Verificar el resultado
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id = default_company_id;
    
    RAISE NOTICE 'Total de clientes con company_id %: %', default_company_id, updated_count;
    
END $$;

-- Verificar el resultado final
SELECT 
    company_id, 
    COUNT(*) as client_count 
FROM public.clients 
GROUP BY company_id
ORDER BY client_count DESC;
