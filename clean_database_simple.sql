-- Script simplificado para limpiar la base de datos
-- MANTIENE: Usuarios registrados
-- ELIMINA: Todos los datos de negocio

-- Deshabilitar temporalmente las restricciones de clave foránea
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

-- 1. Eliminar datos de pagos (payments) - si existe
DO $$
BEGIN
    IF table_exists('payments') THEN
        DELETE FROM public.payments;
        RAISE NOTICE 'Datos de payments eliminados';
    END IF;
END $$;

-- 2. Eliminar datos de préstamos - si existe
DO $$
BEGIN
    IF table_exists('loans') THEN
        DELETE FROM public.loans;
        RAISE NOTICE 'Datos de loans eliminados';
    END IF;
END $$;

-- 3. Eliminar datos de clientes - si existe
DO $$
BEGIN
    IF table_exists('clients') THEN
        DELETE FROM public.clients;
        RAISE NOTICE 'Datos de clients eliminados';
    END IF;
END $$;

-- 4. Eliminar datos de empleados - si existe
DO $$
BEGIN
    IF table_exists('employees') THEN
        DELETE FROM public.employees;
        RAISE NOTICE 'Datos de employees eliminados';
    END IF;
END $$;

-- 5. Eliminar datos de seguimiento de cobro - si existe
DO $$
BEGIN
    IF table_exists('collection_tracking') THEN
        DELETE FROM public.collection_tracking;
        RAISE NOTICE 'Datos de collection_tracking eliminados';
    END IF;
END $$;

-- 6. Eliminar datos de gastos - si existe
DO $$
BEGIN
    IF table_exists('expenses') THEN
        DELETE FROM public.expenses;
        RAISE NOTICE 'Datos de expenses eliminados';
    END IF;
END $$;

-- 7. Eliminar datos de ingresos - si existe
DO $$
BEGIN
    IF table_exists('income') THEN
        DELETE FROM public.income;
        RAISE NOTICE 'Datos de income eliminados';
    END IF;
END $$;

-- 8. Eliminar datos de movimientos de caja - si existe
DO $$
BEGIN
    IF table_exists('cash_movements') THEN
        DELETE FROM public.cash_movements;
        RAISE NOTICE 'Datos de cash_movements eliminados';
    END IF;
END $$;

-- 9. Eliminar datos de reportes guardados - si existe
DO $$
BEGIN
    IF table_exists('saved_reports') THEN
        DELETE FROM public.saved_reports;
        RAISE NOTICE 'Datos de saved_reports eliminados';
    END IF;
END $$;

-- 10. Eliminar datos de días feriados - si existe
DO $$
BEGIN
    IF table_exists('holidays') THEN
        DELETE FROM public.holidays;
        RAISE NOTICE 'Datos de holidays eliminados';
    END IF;
END $$;

-- 11. Eliminar datos de rutas - si existe
DO $$
BEGIN
    IF table_exists('routes') THEN
        DELETE FROM public.routes;
        RAISE NOTICE 'Datos de routes eliminados';
    END IF;
END $$;

-- 12. Eliminar datos de productos - si existe
DO $$
BEGIN
    IF table_exists('products') THEN
        DELETE FROM public.products;
        RAISE NOTICE 'Datos de products eliminados';
    END IF;
END $$;

-- 13. Eliminar datos de proveedores - si existe
DO $$
BEGIN
    IF table_exists('suppliers') THEN
        DELETE FROM public.suppliers;
        RAISE NOTICE 'Datos de suppliers eliminados';
    END IF;
END $$;

-- 14. Eliminar datos de compras - si existe
DO $$
BEGIN
    IF table_exists('purchases') THEN
        DELETE FROM public.purchases;
        RAISE NOTICE 'Datos de purchases eliminados';
    END IF;
END $$;

-- 15. Eliminar datos de ventas - si existe
DO $$
BEGIN
    IF table_exists('sales') THEN
        DELETE FROM public.sales;
        RAISE NOTICE 'Datos de sales eliminados';
    END IF;
END $$;

-- 16. Eliminar datos de cotizaciones - si existe
DO $$
BEGIN
    IF table_exists('quotes') THEN
        DELETE FROM public.quotes;
        RAISE NOTICE 'Datos de quotes eliminados';
    END IF;
END $$;

-- 17. Eliminar datos de detalles de venta - si existe
DO $$
BEGIN
    IF table_exists('sale_details') THEN
        DELETE FROM public.sale_details;
        RAISE NOTICE 'Datos de sale_details eliminados';
    END IF;
END $$;

-- 18. Eliminar datos de detalles de compra - si existe
DO $$
BEGIN
    IF table_exists('purchase_details') THEN
        DELETE FROM public.purchase_details;
        RAISE NOTICE 'Datos de purchase_details eliminados';
    END IF;
END $$;

-- 19. Eliminar datos de detalles de cotización - si existe
DO $$
BEGIN
    IF table_exists('quote_details') THEN
        DELETE FROM public.quote_details;
        RAISE NOTICE 'Datos de quote_details eliminados';
    END IF;
END $$;

-- 20. Eliminar datos de carteras/portfolios - si existe
DO $$
BEGIN
    IF table_exists('portfolios') THEN
        DELETE FROM public.portfolios;
        RAISE NOTICE 'Datos de portfolios eliminados';
    END IF;
END $$;

-- 21. Eliminar datos de historial de préstamos - si existe
DO $$
BEGIN
    IF table_exists('loan_history') THEN
        DELETE FROM public.loan_history;
        RAISE NOTICE 'Datos de loan_history eliminados';
    END IF;
END $$;

-- 22. Eliminar datos de configuraciones del sistema - si existe
DO $$
BEGIN
    IF table_exists('system_configurations') THEN
        DELETE FROM public.system_configurations;
        RAISE NOTICE 'Datos de system_configurations eliminados';
    END IF;
END $$;

-- 23. Eliminar datos de configuraciones del sistema - si existe
DO $$
BEGIN
    IF table_exists('system_settings') THEN
        DELETE FROM public.system_settings;
        RAISE NOTICE 'Datos de system_settings eliminados';
    END IF;
END $$;

-- 24. Eliminar datos de códigos de registro - si existe
DO $$
BEGIN
    IF table_exists('registration_codes') THEN
        DELETE FROM public.registration_codes;
        RAISE NOTICE 'Datos de registration_codes eliminados';
    END IF;
END $$;

-- 25. Eliminar datos de capital e inversiones - si existe
DO $$
BEGIN
    IF table_exists('capital_funds') THEN
        DELETE FROM public.capital_funds;
        RAISE NOTICE 'Datos de capital_funds eliminados';
    END IF;
END $$;

-- Rehabilitar las restricciones de clave foránea
SET session_replication_role = DEFAULT;

-- Limpiar la función auxiliar
DROP FUNCTION IF EXISTS table_exists(TEXT);

-- Verificar que los usuarios principales se mantienen
SELECT 
    'Usuarios mantenidos:' as info,
    count(*) as total_usuarios
FROM auth.users;

-- Mostrar resumen de limpieza
SELECT 
    'Limpieza completada' as status,
    'Usuarios preservados, datos de negocio eliminados' as resultado;

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Limpieza de base de datos completada exitosamente.';
    RAISE NOTICE 'Se eliminaron todos los datos de negocio manteniendo usuarios.';
    RAISE NOTICE 'Solo se eliminaron tablas que existían en la base de datos.';
END $$;
