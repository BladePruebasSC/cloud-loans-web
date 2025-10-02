-- Script para limpiar la base de datos manteniendo solo usuarios que ya tienen su empresa registrada
-- Este script elimina todos los datos de negocio pero preserva los usuarios y sus empresas

-- IMPORTANTE: Ejecutar este script con precaución. Hacer backup antes de ejecutar.

-- Deshabilitar temporalmente las restricciones de foreign key para evitar problemas de orden
SET session_replication_role = replica;

-- Función para verificar si una tabla existe
CREATE OR REPLACE FUNCTION table_exists(tablename TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND information_schema.tables.table_name = tablename
    );
END;
$$ LANGUAGE plpgsql;

-- 1. Eliminar datos de seguimiento de cobro (si existe)
DO $$
BEGIN
    IF table_exists('collection_tracking') THEN
        DELETE FROM collection_tracking;
        RAISE NOTICE 'Datos de collection_tracking eliminados';
    END IF;
END $$;

-- 2. Eliminar datos de pagos (si existe)
DO $$
BEGIN
    IF table_exists('payments') THEN
        DELETE FROM payments;
        RAISE NOTICE 'Datos de payments eliminados';
    END IF;
END $$;

-- 3. Eliminar datos de préstamos (si existe)
DO $$
BEGIN
    IF table_exists('loans') THEN
        DELETE FROM loans;
        RAISE NOTICE 'Datos de loans eliminados';
    END IF;
END $$;

-- 4. Eliminar datos de clientes (si existe)
DO $$
BEGIN
    IF table_exists('clients') THEN
        DELETE FROM clients;
        RAISE NOTICE 'Datos de clients eliminados';
    END IF;
END $$;

-- 5. Eliminar datos de empleados (pero NO los usuarios dueños de empresa)
DO $$
BEGIN
    IF table_exists('employees') THEN
        DELETE FROM employees;
        RAISE NOTICE 'Datos de employees eliminados';
    END IF;
END $$;

-- 6. Eliminar datos de inventario y ventas (si existen)
DO $$
BEGIN
    IF table_exists('sale_details') THEN
        DELETE FROM sale_details;
        RAISE NOTICE 'Datos de sale_details eliminados';
    END IF;
    IF table_exists('sales') THEN
        DELETE FROM sales;
        RAISE NOTICE 'Datos de sales eliminados';
    END IF;
    IF table_exists('purchase_details') THEN
        DELETE FROM purchase_details;
        RAISE NOTICE 'Datos de purchase_details eliminados';
    END IF;
    IF table_exists('purchases') THEN
        DELETE FROM purchases;
        RAISE NOTICE 'Datos de purchases eliminados';
    END IF;
    IF table_exists('suppliers') THEN
        DELETE FROM suppliers;
        RAISE NOTICE 'Datos de suppliers eliminados';
    END IF;
    IF table_exists('products') THEN
        DELETE FROM products;
        RAISE NOTICE 'Datos de products eliminados';
    END IF;
    IF table_exists('quote_details') THEN
        DELETE FROM quote_details;
        RAISE NOTICE 'Datos de quote_details eliminados';
    END IF;
    IF table_exists('quotes') THEN
        DELETE FROM quotes;
        RAISE NOTICE 'Datos de quotes eliminados';
    END IF;
END $$;

-- 7. Eliminar datos de gastos e ingresos (si existen)
DO $$
BEGIN
    IF table_exists('expenses') THEN
        DELETE FROM expenses;
        RAISE NOTICE 'Datos de expenses eliminados';
    END IF;
    IF table_exists('income') THEN
        DELETE FROM income;
        RAISE NOTICE 'Datos de income eliminados';
    END IF;
    IF table_exists('cash_movements') THEN
        DELETE FROM cash_movements;
        RAISE NOTICE 'Datos de cash_movements eliminados';
    END IF;
END $$;

-- 8. Eliminar datos de capital e inversiones (si existe)
DO $$
BEGIN
    IF table_exists('capital_funds') THEN
        DELETE FROM capital_funds;
        RAISE NOTICE 'Datos de capital_funds eliminados';
    END IF;
END $$;

-- 9. Eliminar datos de reportes guardados (si existe)
DO $$
BEGIN
    IF table_exists('saved_reports') THEN
        DELETE FROM saved_reports;
        RAISE NOTICE 'Datos de saved_reports eliminados';
    END IF;
END $$;

-- 10. Eliminar datos de configuración del sistema (excepto configuraciones globales)
DO $$
BEGIN
    IF table_exists('system_configurations') THEN
        DELETE FROM system_configurations WHERE config_key NOT IN ('default_late_fee_config', 'global_timezone');
        RAISE NOTICE 'Datos de system_configurations eliminados';
    END IF;
END $$;

-- 11. Eliminar datos de días feriados (si existe)
DO $$
BEGIN
    IF table_exists('holidays') THEN
        DELETE FROM holidays;
        RAISE NOTICE 'Datos de holidays eliminados';
    END IF;
END $$;

-- 12. Eliminar datos de rutas (si existe)
DO $$
BEGIN
    IF table_exists('routes') THEN
        DELETE FROM routes;
        RAISE NOTICE 'Datos de routes eliminados';
    END IF;
END $$;

-- 13. Eliminar datos de carteras/portfolios (si existe)
DO $$
BEGIN
    IF table_exists('portfolios') THEN
        DELETE FROM portfolios;
        RAISE NOTICE 'Datos de portfolios eliminados';
    END IF;
END $$;

-- 14. Eliminar datos de historial de préstamos (si existe)
DO $$
BEGIN
    IF table_exists('loan_history') THEN
        DELETE FROM loan_history;
        RAISE NOTICE 'Datos de loan_history eliminados';
    END IF;
END $$;

-- 15. Eliminar datos de códigos de registro usados (mantener los no usados)
DO $$
BEGIN
    IF table_exists('registration_codes') THEN
        DELETE FROM registration_codes WHERE is_used = true;
        RAISE NOTICE 'Códigos de registro usados eliminados';
    END IF;
END $$;

-- 16. Limpiar datos de configuración del sistema que no son globales (si existe)
DO $$
BEGIN
    IF table_exists('system_settings') THEN
        DELETE FROM system_settings 
        WHERE created_by NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Configuraciones específicas de usuarios sin empresa eliminadas';
    END IF;
END $$;

-- 17. Limpiar datos de perfiles que no tienen empresa asociada (si existe)
DO $$
BEGIN
    IF table_exists('profiles') THEN
        DELETE FROM profiles 
        WHERE id NOT IN (
            -- Usuarios que son dueños de empresa
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            -- Usuarios que son empleados de una empresa
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Perfiles de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 18. Limpiar usuarios de auth.users que no tienen empresa
-- NOTA: Esto es más delicado, solo eliminar usuarios que no tienen empresa
DO $$
BEGIN
    DELETE FROM auth.users 
    WHERE id NOT IN (
        -- Usuarios que son dueños de empresa
        SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
        UNION
        -- Usuarios que son empleados de una empresa
        SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        UNION
        -- Usuarios que tienen perfil y están asociados a una empresa
        SELECT DISTINCT p.id FROM profiles p
        JOIN employees e ON p.id = e.user_id
        WHERE e.user_id IS NOT NULL
    );
    RAISE NOTICE 'Usuarios sin empresa eliminados de auth.users';
END $$;

-- 19. Limpiar configuraciones específicas de usuarios que no tienen empresa (si existe)
DO $$
BEGIN
    IF table_exists('system_configurations') THEN
        DELETE FROM system_configurations 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Configuraciones de usuarios sin empresa eliminadas';
    END IF;
END $$;

-- 20. Limpiar datos de gastos de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('expenses') THEN
        DELETE FROM expenses 
        WHERE created_by NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Gastos de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 21. Limpiar datos de ingresos de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('income') THEN
        DELETE FROM income 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Ingresos de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 22. Limpiar datos de movimientos de caja de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('cash_movements') THEN
        DELETE FROM cash_movements 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Movimientos de caja de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 23. Limpiar datos de reportes guardados de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('saved_reports') THEN
        DELETE FROM saved_reports 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Reportes guardados de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 24. Limpiar datos de días feriados de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('holidays') THEN
        DELETE FROM holidays 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Días feriados de usuarios sin empresa eliminados';
    END IF;
END $$;

-- 25. Limpiar datos de rutas de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('routes') THEN
        DELETE FROM routes 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Rutas de usuarios sin empresa eliminadas';
    END IF;
END $$;

-- 26. Limpiar datos de inventario de usuarios sin empresa (si existen)
DO $$
BEGIN
    IF table_exists('products') THEN
        DELETE FROM products 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Productos de usuarios sin empresa eliminados';
    END IF;
    
    IF table_exists('suppliers') THEN
        DELETE FROM suppliers 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Proveedores de usuarios sin empresa eliminados';
    END IF;
    
    IF table_exists('purchases') THEN
        DELETE FROM purchases 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Compras de usuarios sin empresa eliminadas';
    END IF;
    
    IF table_exists('sales') THEN
        DELETE FROM sales 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Ventas de usuarios sin empresa eliminadas';
    END IF;
    
    IF table_exists('quotes') THEN
        DELETE FROM quotes 
        WHERE user_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Cotizaciones de usuarios sin empresa eliminadas';
    END IF;
END $$;

-- 27. Limpiar datos de capital e inversiones de usuarios sin empresa (si existe)
DO $$
BEGIN
    IF table_exists('capital_funds') THEN
        DELETE FROM capital_funds 
        WHERE investor_id NOT IN (
            SELECT DISTINCT owner_id FROM companies WHERE owner_id IS NOT NULL
            UNION
            SELECT DISTINCT user_id FROM employees WHERE user_id IS NOT NULL
        );
        RAISE NOTICE 'Fondos de capital de usuarios sin empresa eliminados';
    END IF;
END $$;

-- Restaurar las restricciones de foreign key
SET session_replication_role = DEFAULT;

-- 28. Verificar que solo quedan usuarios con empresa
-- Esta consulta te mostrará qué usuarios quedan después de la limpieza
SELECT 
    u.id,
    u.email,
    p.full_name,
    CASE 
        WHEN c.owner_id = u.id THEN 'Empresa Propia'
        WHEN e.user_id = u.id THEN 'Empleado'
        ELSE 'Sin Empresa'
    END as tipo_usuario
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
LEFT JOIN companies c ON u.id = c.owner_id
LEFT JOIN employees e ON u.id = e.user_id
WHERE u.id IS NOT NULL
ORDER BY u.created_at;

-- 29. Mostrar estadísticas de limpieza
SELECT 
    'Usuarios restantes' as tabla,
    COUNT(*) as cantidad
FROM auth.users
UNION ALL
SELECT 
    'Empresas restantes' as tabla,
    COUNT(*) as cantidad
FROM companies
UNION ALL
SELECT 
    'Empleados restantes' as tabla,
    COUNT(*) as cantidad
FROM employees
UNION ALL
SELECT 
    'Clientes restantes' as tabla,
    COUNT(*) as cantidad
FROM clients
UNION ALL
SELECT 
    'Préstamos restantes' as tabla,
    COUNT(*) as cantidad
FROM loans
UNION ALL
SELECT 
    'Pagos restantes' as tabla,
    COUNT(*) as cantidad
FROM payments;

-- 30. Limpiar la función auxiliar
DROP FUNCTION IF EXISTS table_exists(TEXT);

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Limpieza de base de datos completada. Solo se mantuvieron usuarios que tienen empresa registrada.';
    RAISE NOTICE 'Se eliminaron todos los datos de negocio: préstamos, clientes, pagos, empleados, etc.';
    RAISE NOTICE 'Se preservaron los usuarios dueños de empresa y sus configuraciones básicas.';
END $$;
