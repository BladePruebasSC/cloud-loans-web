-- Script para diagnosticar las estadísticas
-- Este script verifica los datos que deberían aparecer en las estadísticas

-- 1. Verificar préstamos totales y activos
SELECT 
    'Préstamos por estado' as categoria,
    status,
    COUNT(*) as cantidad,
    SUM(amount) as monto_total,
    SUM(remaining_balance) as balance_restante
FROM public.loans 
GROUP BY status
ORDER BY status;

-- 2. Verificar pagos del período (últimos 30 días)
SELECT 
    'Pagos del período' as categoria,
    COUNT(*) as transacciones,
    SUM(amount) as monto_total,
    SUM(interest_amount) as intereses_total
FROM public.payments 
WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days';

-- 3. Verificar clientes
SELECT 
    'Clientes totales' as categoria,
    COUNT(*) as cantidad
FROM public.clients;

-- 4. Verificar gastos del período
SELECT 
    'Gastos del período' as categoria,
    COUNT(*) as cantidad,
    SUM(amount) as monto_total
FROM public.expenses 
WHERE expense_date >= CURRENT_DATE - INTERVAL '30 days';

-- 5. Resumen general
SELECT 
    'RESUMEN GENERAL' as categoria,
    (SELECT COUNT(*) FROM public.loans) as total_prestamos,
    (SELECT COUNT(*) FROM public.loans WHERE status = 'active') as prestamos_activos,
    (SELECT SUM(amount) FROM public.loans) as monto_total_prestamos,
    (SELECT SUM(remaining_balance) FROM public.loans) as balance_total,
    (SELECT COUNT(*) FROM public.payments WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days') as pagos_periodo,
    (SELECT SUM(amount) FROM public.payments WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days') as monto_pagos_periodo,
    (SELECT COUNT(*) FROM public.clients) as total_clientes;

-- 6. Verificar filtros por company_id (si existe)
SELECT 
    'Filtros por empresa' as categoria,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'company_id') 
        THEN 'Columna company_id existe'
        ELSE 'Columna company_id NO existe'
    END as company_id_status;

-- 7. Verificar algunos préstamos de ejemplo
SELECT 
    'Préstamos de ejemplo' as categoria,
    id,
    amount,
    remaining_balance,
    status,
    created_at
FROM public.loans 
ORDER BY created_at DESC 
LIMIT 5;
