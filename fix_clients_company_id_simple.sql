-- Solución simple para agregar company_id a clientes
-- Este script asigna un company_id por defecto a todos los clientes

DO $$
DECLARE
    default_company_id UUID;
    updated_count INTEGER;
BEGIN
    -- Intentar obtener el company_id del usuario autenticado
    BEGIN
        SELECT (raw_user_meta_data->>'company_id')::UUID INTO default_company_id
        FROM auth.users 
        WHERE id = auth.uid();
        
        RAISE NOTICE 'Company ID del usuario autenticado: %', default_company_id;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'No se pudo obtener company_id del usuario: %', SQLERRM;
            default_company_id := NULL;
    END;
    
    -- Si no se pudo obtener, usar un UUID por defecto
    IF default_company_id IS NULL THEN
        -- Generar un UUID por defecto o usar uno específico
        default_company_id := '00000000-0000-0000-0000-000000000001'::UUID;
        RAISE NOTICE 'Usando company_id por defecto: %', default_company_id;
    END IF;
    
    -- Verificar cuántos clientes necesitan actualización
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
