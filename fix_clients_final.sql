-- Script final para arreglar el problema de clientes
-- Este script asigna company_id a todos los clientes basado en sus préstamos

-- Paso 1: Verificar la estructura actual
SELECT 'Estructura de la tabla clients:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Paso 2: Verificar cuántos clientes hay
SELECT 'Total de clientes:' as info, COUNT(*) as count FROM public.clients;

-- Paso 3: Verificar cuántos clientes tienen company_id
SELECT 'Clientes con company_id:' as info, COUNT(*) as count 
FROM public.clients 
WHERE company_id IS NOT NULL;

-- Paso 4: Verificar cuántos clientes tienen préstamos
SELECT 'Clientes con préstamos:' as info, COUNT(DISTINCT c.id) as count
FROM public.clients c
INNER JOIN public.loans l ON c.id = l.client_id;

-- Paso 5: Asignar company_id basado en préstamos existentes
UPDATE public.clients 
SET company_id = (
    SELECT DISTINCT l.loan_officer_id
    FROM public.loans l
    WHERE l.client_id = clients.id
    AND l.loan_officer_id IS NOT NULL
    LIMIT 1
)
WHERE company_id IS NULL
AND EXISTS (
    SELECT 1 
    FROM public.loans l
    WHERE l.client_id = clients.id
    AND l.loan_officer_id IS NOT NULL
);

-- Paso 6: Para clientes sin préstamos, usar el primer loan_officer_id disponible
UPDATE public.clients 
SET company_id = (
    SELECT loan_officer_id 
    FROM public.loans 
    WHERE loan_officer_id IS NOT NULL 
    LIMIT 1
)
WHERE company_id IS NULL;

-- Paso 7: Verificar el resultado final
SELECT 'Resultado final:' as info;
SELECT 
    company_id, 
    COUNT(*) as client_count 
FROM public.clients 
GROUP BY company_id
ORDER BY client_count DESC;

-- Paso 8: Mostrar algunos clientes de ejemplo
SELECT 'Clientes de ejemplo:' as info;
SELECT 
    id, 
    full_name, 
    company_id, 
    created_at 
FROM public.clients 
LIMIT 5;
