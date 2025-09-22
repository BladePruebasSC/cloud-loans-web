-- Script para insertar datos de prueba que coincidan con las estadísticas
-- NOTA: Este script inserta datos de prueba. Ajusta los UUIDs según tu configuración.

-- 1. Insertar clientes de prueba
INSERT INTO public.clients (id, full_name, dni, phone, email, address, created_at, updated_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Juan Pérez', '12345678901', '809-123-4567', 'juan@email.com', 'Santo Domingo', now(), now()),
    ('22222222-2222-2222-2222-222222222222', 'María García', '12345678902', '809-234-5678', 'maria@email.com', 'Santiago', now(), now()),
    ('33333333-3333-3333-3333-333333333333', 'Carlos López', '12345678903', '809-345-6789', 'carlos@email.com', 'La Romana', now(), now()),
    ('44444444-4444-4444-4444-444444444444', 'Ana Rodríguez', '12345678904', '809-456-7890', 'ana@email.com', 'San Pedro', now(), now()),
    ('55555555-5555-5555-5555-555555555555', 'Luis Martínez', '12345678905', '809-567-8901', 'luis@email.com', 'Puerto Plata', now(), now()),
    ('66666666-6666-6666-6666-666666666666', 'Carmen Silva', '12345678906', '809-678-9012', 'carmen@email.com', 'Higüey', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. Insertar préstamos de prueba (6 préstamos total, 2 activos)
INSERT INTO public.loans (
    id, client_id, amount, interest_rate, term_months, loan_type, 
    monthly_payment, total_amount, remaining_balance, start_date, end_date, 
    next_payment_date, status, loan_officer_id, created_at, updated_at
)
VALUES 
    -- Préstamos activos (2)
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 100000, 2.5, 12, 'personal', 8500, 102000, 85000, '2024-01-01', '2024-12-31', '2024-02-01', 'active', '00000000-0000-0000-0000-000000000001', now(), now()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 150000, 3.0, 18, 'business', 9500, 171000, 142500, '2024-01-15', '2025-06-15', '2024-02-15', 'active', '00000000-0000-0000-0000-000000000001', now(), now()),
    
    -- Préstamos pagados (1)
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 50000, 2.0, 6, 'personal', 8500, 51000, 0, '2023-06-01', '2023-11-30', '2023-12-01', 'paid', '00000000-0000-0000-0000-000000000001', now(), now()),
    
    -- Préstamos pendientes (3)
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 75000, 2.8, 10, 'personal', 7800, 78000, 78000, '2024-02-01', '2024-11-30', '2024-03-01', 'pending', '00000000-0000-0000-0000-000000000001', now(), now()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 120000, 3.2, 15, 'business', 8800, 132000, 132000, '2024-02-10', '2025-05-10', '2024-03-10', 'pending', '00000000-0000-0000-0000-000000000001', now(), now()),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', '66666666-6666-6666-6666-666666666666', 95000, 2.7, 12, 'personal', 8200, 98200, 98200, '2024-02-20', '2025-02-20', '2024-03-20', 'pending', '00000000-0000-0000-0000-000000000001', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 3. Insertar pagos de prueba (0 pagos en el período para que coincida con la imagen)
-- No insertamos pagos para que coincida con "0 transacciones"

-- 4. Verificar los datos insertados
SELECT 'Verificación de datos insertados:' as info;

SELECT 
    'Préstamos por estado' as categoria,
    status,
    COUNT(*) as cantidad,
    SUM(amount) as monto_total
FROM public.loans 
GROUP BY status
ORDER BY status;

SELECT 
    'Resumen general' as categoria,
    COUNT(*) as total_prestamos,
    SUM(amount) as monto_total_prestamos,
    SUM(remaining_balance) as balance_total,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as prestamos_activos
FROM public.loans;
