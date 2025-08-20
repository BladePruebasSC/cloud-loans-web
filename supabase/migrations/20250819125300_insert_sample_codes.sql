-- Insertar códigos de ejemplo para testing
-- Estos códigos son solo para desarrollo y testing

INSERT INTO public.registration_codes (code, company_name, expires_at) VALUES
('ABC12345', 'Empresa Ejemplo 1', NOW() + INTERVAL '30 days'),
('DEF67890', 'Empresa Ejemplo 2', NOW() + INTERVAL '60 days'),
('GHI11111', 'Empresa Ejemplo 3', NULL),
('JKL22222', 'Empresa Ejemplo 4', NOW() + INTERVAL '90 days'),
('MNO33333', 'Empresa Ejemplo 5', NULL);

-- Nota: Estos códigos son solo para testing
-- En producción, los códigos deben ser generados por el administrador
