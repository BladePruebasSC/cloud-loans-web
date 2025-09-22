-- Verificar la estructura de la tabla clients
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar si hay datos en la tabla clients
SELECT COUNT(*) as total_clients FROM public.clients;

-- Verificar algunos registros de ejemplo
SELECT id, full_name, company_id, created_at 
FROM public.clients 
LIMIT 5;

-- Verificar si la columna company_id existe y tiene valores
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'company_id') 
        THEN 'company_id column exists'
        ELSE 'company_id column does NOT exist'
    END as column_status;

-- Si la columna existe, verificar valores únicos
SELECT 
    company_id, 
    COUNT(*) as client_count 
FROM public.clients 
WHERE company_id IS NOT NULL
GROUP BY company_id
ORDER BY client_count DESC;
