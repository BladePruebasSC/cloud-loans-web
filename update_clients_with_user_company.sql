-- Actualizar clientes existentes con el company_id del usuario autenticado
-- Este script asigna el company_id del usuario actual a todos los clientes que no tengan uno

DO $$
DECLARE
    user_company_id UUID;
    updated_count INTEGER;
BEGIN
    -- Obtener el company_id del usuario autenticado
    SELECT (raw_user_meta_data->>'company_id')::UUID INTO user_company_id
    FROM auth.users 
    WHERE id = auth.uid();
    
    RAISE NOTICE 'Company ID del usuario autenticado: %', user_company_id;
    
    IF user_company_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo obtener el company_id del usuario autenticado';
    END IF;
    
    -- Verificar cuántos clientes necesitan actualización
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id IS NULL;
    
    RAISE NOTICE 'Clientes sin company_id encontrados: %', updated_count;
    
    IF updated_count > 0 THEN
        -- Actualizar clientes sin company_id
        UPDATE public.clients 
        SET company_id = user_company_id
        WHERE company_id IS NULL;
        
        RAISE NOTICE 'Actualizados % clientes con company_id: %', updated_count, user_company_id;
    ELSE
        RAISE NOTICE 'Todos los clientes ya tienen company_id asignado';
    END IF;
    
    -- Verificar el resultado
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id = user_company_id;
    
    RAISE NOTICE 'Total de clientes con company_id %: %', user_company_id, updated_count;
    
END $$;

-- Verificar el resultado final
SELECT 
    company_id, 
    COUNT(*) as client_count 
FROM public.clients 
GROUP BY company_id
ORDER BY client_count DESC;
