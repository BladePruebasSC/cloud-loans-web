-- Asignar company_id a clientes basado en los préstamos existentes
-- Este script usa el loan_officer_id de los préstamos para determinar el company_id de los clientes

DO $$
DECLARE
    updated_count INTEGER;
    total_clients INTEGER;
BEGIN
    -- Verificar cuántos clientes hay en total
    SELECT COUNT(*) INTO total_clients FROM public.clients;
    RAISE NOTICE 'Total de clientes en la base de datos: %', total_clients;
    
    -- Verificar cuántos clientes tienen company_id
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id IS NOT NULL;
    
    RAISE NOTICE 'Clientes que ya tienen company_id: %', updated_count;
    
    -- Actualizar clientes basado en los préstamos existentes
    UPDATE public.clients 
    SET company_id = (
        SELECT DISTINCT l.loan_officer_id
        FROM public.loans l
        WHERE l.client_id = clients.id
        LIMIT 1
    )
    WHERE company_id IS NULL
    AND EXISTS (
        SELECT 1 
        FROM public.loans l
        WHERE l.client_id = clients.id
        AND l.loan_officer_id IS NOT NULL
    );
    
    -- Contar cuántos se actualizaron
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Clientes actualizados basado en préstamos: %', updated_count;
    
    -- Para clientes que no tienen préstamos, asignar un company_id por defecto
    UPDATE public.clients 
    SET company_id = '00000000-0000-0000-0000-000000000001'::UUID
    WHERE company_id IS NULL;
    
    -- Contar cuántos se actualizaron con el valor por defecto
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Clientes actualizados con company_id por defecto: %', updated_count;
    
    -- Verificar el resultado final
    SELECT COUNT(*) INTO updated_count
    FROM public.clients 
    WHERE company_id IS NOT NULL;
    
    RAISE NOTICE 'Total de clientes con company_id: %', updated_count;
    
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
