-- Agregar 'french' como tipo de amortización válido
-- Primero eliminar la restricción existente
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_amortization_type_check;

-- Agregar la nueva restricción que incluye 'french'
ALTER TABLE public.loans ADD CONSTRAINT loans_amortization_type_check 
CHECK (amortization_type IN ('simple', 'french', 'german', 'american', 'indefinite'));
