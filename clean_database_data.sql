-- Script para limpiar datos de la base de datos
-- MANTIENE: Usuarios registrados y sus empresas
-- ELIMINA: Préstamos, clientes, pagos, empleados, carteras, acuerdos, etc.

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

-- 2. Eliminar datos de historial de mora - si existe
DO $$
BEGIN
    IF table_exists('late_fee_history') THEN
        DELETE FROM public.late_fee_history;
        RAISE NOTICE 'Datos de late_fee_history eliminados';
    END IF;
END $$;

-- 3. Eliminar datos de préstamos - si existe
DO $$
BEGIN
    IF table_exists('loans') THEN
        DELETE FROM public.loans;
        RAISE NOTICE 'Datos de loans eliminados';
    END IF;
END $$;

-- 4. Eliminar datos de clientes - si existe
DO $$
BEGIN
    IF table_exists('clients') THEN
        DELETE FROM public.clients;
        RAISE NOTICE 'Datos de clients eliminados';
    END IF;
END $$;

-- 5. Eliminar datos de empleados (pero mantener usuarios principales) - si existe
DO $$
BEGIN
    IF table_exists('employees') THEN
        DELETE FROM public.employees;
        RAISE NOTICE 'Datos de employees eliminados';
    END IF;
END $$;

-- 6. Eliminar datos de carteras - si existe
DO $$
BEGIN
    IF table_exists('carteras') THEN
        DELETE FROM public.carteras;
        RAISE NOTICE 'Datos de carteras eliminados';
    END IF;
END $$;

-- 7. Eliminar datos de acuerdos de pago - si existe
DO $$
BEGIN
    IF table_exists('payment_agreements') THEN
        DELETE FROM public.payment_agreements;
        RAISE NOTICE 'Datos de payment_agreements eliminados';
    END IF;
END $$;

-- 8. Eliminar datos de códigos de registro - si existe
DO $$
BEGIN
    IF table_exists('registration_codes') THEN
        DELETE FROM public.registration_codes;
        RAISE NOTICE 'Datos de registration_codes eliminados';
    END IF;
END $$;

-- 9. Eliminar datos de turnos - si existe
DO $$
BEGIN
    IF table_exists('shifts') THEN
        DELETE FROM public.shifts;
        RAISE NOTICE 'Datos de shifts eliminados';
    END IF;
END $$;

-- 10. Eliminar datos de solicitudes - si existe
DO $$
BEGIN
    IF table_exists('requests') THEN
        DELETE FROM public.requests;
        RAISE NOTICE 'Datos de requests eliminados';
    END IF;
END $$;

-- 11. Eliminar datos de inventario - si existe
DO $$
BEGIN
    IF table_exists('inventory') THEN
        DELETE FROM public.inventory;
        RAISE NOTICE 'Datos de inventory eliminados';
    END IF;
END $$;

-- 12. Eliminar datos de documentos - si existe
DO $$
BEGIN
    IF table_exists('documents') THEN
        DELETE FROM public.documents;
        RAISE NOTICE 'Datos de documents eliminados';
    END IF;
END $$;

-- 13. Eliminar datos de rutas - si existe
DO $$
BEGIN
    IF table_exists('routes') THEN
        DELETE FROM public.routes;
        RAISE NOTICE 'Datos de routes eliminados';
    END IF;
END $$;

-- 14. Eliminar datos de días festivos - si existe
DO $$
BEGIN
    IF table_exists('holidays') THEN
        DELETE FROM public.holidays;
        RAISE NOTICE 'Datos de holidays eliminados';
    END IF;
END $$;

-- 15. Eliminar datos de bancos - si existe
DO $$
BEGIN
    IF table_exists('banks') THEN
        DELETE FROM public.banks;
        RAISE NOTICE 'Datos de banks eliminados';
    END IF;
END $$;

-- 16. Eliminar datos de reportes - si existe
DO $$
BEGIN
    IF table_exists('reports') THEN
        DELETE FROM public.reports;
        RAISE NOTICE 'Datos de reports eliminados';
    END IF;
END $$;

-- 17. Eliminar datos de estadísticas - si existe
DO $$
BEGIN
    IF table_exists('statistics') THEN
        DELETE FROM public.statistics;
        RAISE NOTICE 'Datos de statistics eliminados';
    END IF;
END $$;

-- 18. Eliminar datos de seguimiento de cobranza - si existe
DO $$
BEGIN
    IF table_exists('collection_tracking') THEN
        DELETE FROM public.collection_tracking;
        RAISE NOTICE 'Datos de collection_tracking eliminados';
    END IF;
END $$;

-- 19. Eliminar datos de configuraciones de mora - si existe
DO $$
BEGIN
    IF table_exists('late_fee_configs') THEN
        DELETE FROM public.late_fee_configs;
        RAISE NOTICE 'Datos de late_fee_configs eliminados';
    END IF;
END $$;

-- 20. Eliminar datos de notificaciones - si existe
DO $$
BEGIN
    IF table_exists('notifications') THEN
        DELETE FROM public.notifications;
        RAISE NOTICE 'Datos de notifications eliminados';
    END IF;
END $$;

-- 21. Eliminar datos de sesiones - si existe
DO $$
BEGIN
    IF table_exists('sessions') THEN
        DELETE FROM public.sessions;
        RAISE NOTICE 'Datos de sessions eliminados';
    END IF;
END $$;

-- 22. Eliminar datos de logs de auditoría - si existe
DO $$
BEGIN
    IF table_exists('audit_logs') THEN
        DELETE FROM public.audit_logs;
        RAISE NOTICE 'Datos de audit_logs eliminados';
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

-- 24. Eliminar datos de metadatos de usuario - si existe
DO $$
BEGIN
    IF table_exists('user_metadata') THEN
        DELETE FROM public.user_metadata;
        RAISE NOTICE 'Datos de user_metadata eliminados';
    END IF;
END $$;

-- 25. Eliminar datos de perfiles de usuario - si existe
DO $$
BEGIN
    IF table_exists('user_profiles') THEN
        DELETE FROM public.user_profiles;
        RAISE NOTICE 'Datos de user_profiles eliminados';
    END IF;
END $$;

-- 26. Eliminar datos de tokens de autenticación - si existe
DO $$
BEGIN
    IF table_exists('auth_tokens') THEN
        DELETE FROM public.auth_tokens;
        RAISE NOTICE 'Datos de auth_tokens eliminados';
    END IF;
END $$;

-- 27. Eliminar datos de configuraciones de empresa - si existe
DO $$
BEGIN
    IF table_exists('company_settings') THEN
        DELETE FROM public.company_settings;
        RAISE NOTICE 'Datos de company_settings eliminados';
    END IF;
END $$;

-- 28. Eliminar datos de configuraciones de préstamos - si existe
DO $$
BEGIN
    IF table_exists('loan_settings') THEN
        DELETE FROM public.loan_settings;
        RAISE NOTICE 'Datos de loan_settings eliminados';
    END IF;
END $$;

-- 29. Eliminar datos de configuraciones de pagos - si existe
DO $$
BEGIN
    IF table_exists('payment_settings') THEN
        DELETE FROM public.payment_settings;
        RAISE NOTICE 'Datos de payment_settings eliminados';
    END IF;
END $$;

-- 30. Eliminar datos de configuraciones de mora global - si existe
DO $$
BEGIN
    IF table_exists('global_late_fee_config') THEN
        DELETE FROM public.global_late_fee_config;
        RAISE NOTICE 'Datos de global_late_fee_config eliminados';
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

-- Verificar que las empresas se mantienen (si existe la tabla)
DO $$
BEGIN
    IF table_exists('companies') THEN
        EXECUTE 'SELECT ''Empresas mantenidas:'' as info, count(*) as total_empresas FROM public.companies';
    ELSE
        RAISE NOTICE 'Tabla companies no existe - saltando verificación';
    END IF;
END $$;

-- Mostrar resumen de limpieza
SELECT 
    'Limpieza completada' as status,
    'Usuarios y empresas preservados' as resultado;

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Limpieza de base de datos completada exitosamente.';
    RAISE NOTICE 'Se eliminaron todos los datos de negocio manteniendo usuarios y empresas.';
    RAISE NOTICE 'Solo se eliminaron tablas que existían en la base de datos.';
END $$;
