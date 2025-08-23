-- Eliminar la restricción única de email que no permite duplicados
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_email_key;

-- Crear una restricción única compuesta que permita emails duplicados pero no en la misma empresa
-- Esto permite que un email exista en múltiples empresas, pero no duplicado en la misma empresa
ALTER TABLE public.employees 
ADD CONSTRAINT employees_email_company_unique 
UNIQUE (email, company_owner_id);

-- Crear un índice para mejorar el rendimiento de búsquedas por email
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees(email);

-- Crear un índice para búsquedas por empresa y email
CREATE INDEX IF NOT EXISTS idx_employees_company_email ON public.employees(company_owner_id, email);
