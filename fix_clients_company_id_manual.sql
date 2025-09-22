-- Script manual para asignar company_id a clientes
-- INSTRUCCIONES: 
-- 1. Reemplaza 'YOUR_COMPANY_ID_HERE' con el UUID real de tu empresa
-- 2. Ejecuta este script en Supabase SQL Editor

DO $$
DECLARE
    target_company_id UUID := 'YOUR_COMPANY_ID_HERE'; -- ⚠️ CAMBIAR ESTE VALOR
    updated_count INTEGER;
    total_clients INTEGER;
BEGIN
    -- Verificar que el company_id no sea el placeholder
    IF target_company_id = 'YOUR_COMPANY_ID_HERE'::UUID THEN
        RAISE EXCEPTION 'Por favor, reemplaza YOUR_COMPANY_ID_HERE con el UUID real de tu empresa';
    END IF;
    
    -- Verificar cuántos clientes hay en total
    SELECT COUNT(*) INTO total_clients FROM public.clients;
    RAISE NOTICE 'Total de clientes en la base de datos: %', total_clients;
    
    -- Verificar cuántos clientes tienen company_id
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id IS NOT NULL;
    
    RAISE NOTICE 'Clientes que ya tienen company_id: %', updated_count;
    
    -- Actualizar todos los clientes con el company_id especificado
    UPDATE public.clients 
    SET company_id = target_company_id
    WHERE company_id IS NULL OR company_id != target_company_id;
    
    -- Contar cuántos se actualizaron
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Clientes actualizados con company_id %: %', target_company_id, updated_count;
    
    -- Verificar el resultado final
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id = target_company_id;
    
    RAISE NOTICE 'Total de clientes con company_id %: %', target_company_id, updated_count;
    
END $$;

-- Verificar el resultado final
SELECT 
    company_id, 
    COUNT(*) as client_count 
FROM public.clients 
GROUP BY company_id
ORDER BY client_count DESC;

-- Mostrar algunos clientes de ejemplo
SELECT 
    id, 
    full_name, 
    company_id, 
    created_at 
FROM public.clients 
LIMIT 5;
