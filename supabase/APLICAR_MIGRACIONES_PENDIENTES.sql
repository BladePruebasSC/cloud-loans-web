-- ============================================================================
-- MIGRACIONES PENDIENTES — pegar entero en el SQL Editor de Supabase y ejecutar
-- ============================================================================
-- Reúne las migraciones que el código ya usa pero que la base de datos todavía no tiene.
-- Mientras falten, estas operaciones fallan con un 400:
--
--   · Crear o editar un préstamo   -> falta `loans.closing_costs_financed`
--   · Pago avanzado                -> falta `payments.superseded_at`. Llega a decir que el
--                                     préstamo NO TIENE CUOTAS PENDIENTES, que es falso.
--   · Ruta de cobro                -> falta `payments.superseded_at`
--   · Extensión de plazo           -> falta `payments.superseded_at`
--   · Guardar un cliente           -> faltan `clients.document_type`, `latitude`, `longitude`,
--                                     `location_accuracy`, `location_note`, `jce_verified`…
--   · Verificar una cédula (JCE)   -> faltan `personas_cache`, `persona_lookups`, `jce-photos`
--     (la consulta devuelve los datos igual, pero sin caché, sin foto y sin auditoría)
--
-- Es IDEMPOTENTE: todo va con IF NOT EXISTS o ON CONFLICT, así que ejecutarlo dos veces no
-- rompe nada ni pisa datos existentes. No borra ni modifica ninguna fila salvo los UPDATE
-- del final, que solo rellenan valores por defecto en columnas recién creadas.
--
-- Equivale a aplicar, en este orden:
--   20260902000000_jce_lookup_and_client_gps.sql
--   20260903000000_supersede_payments_on_term_extension.sql  (solo las columnas; la función
--       `calculate_loan_remaining_balance` de esa migración NO se toca aquí, para no pisar
--       una versión posterior. Aplícala desde su archivo si hace falta.)
--   20260904000000_add_closing_costs_financed.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Gastos de cierre financiados            (desbloquea CREAR PRÉSTAMOS)
-- ----------------------------------------------------------------------------
-- true: los gastos de cierre están dentro de `amount` y devengan interés.
-- false: se cobran aparte como un cargo al final del cronograma.
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS closing_costs_financed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.loans.closing_costs_financed IS
  'true: los gastos de cierre están dentro de `amount` y devengan interés. false: se cobran aparte como cargo.';


-- ----------------------------------------------------------------------------
-- 2. Pagos anulados por una extensión     (desbloquea PAGO AVANZADO y RUTA DE COBRO)
-- ----------------------------------------------------------------------------
-- Tres pantallas consultan `payments.superseded_at` (pago avanzado, ruta de cobro y
-- extensión de plazo). Sin la columna esas consultas devuelven 400 y las pantallas se
-- quedan sin datos — el pago avanzado llega a decir que no quedan cuotas pendientes.
--
-- Al extender un plazo el pago se DESVINCULA de la cuota (`due_date` a NULL) pero la fila
-- NO se borra: el dinero se recibió y debe seguir contando como ingreso en los informes,
-- que agrupan por `payment_date` y no por `due_date`.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_due_date DATE;

COMMENT ON COLUMN public.payments.superseded_at IS
  'Cuándo dejó de aplicarse este pago al préstamo (extensión de plazo). Sigue contando como ingreso.';
COMMENT ON COLUMN public.payments.original_due_date IS
  'Cuota a la que estaba aplicado antes de anularse. `due_date` queda en NULL.';

CREATE INDEX IF NOT EXISTS idx_payments_superseded
  ON public.payments (loan_id)
  WHERE superseded_at IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 3. Cliente: tipo de documento, verificación JCE y ubicación GPS
-- ----------------------------------------------------------------------------
-- El NÚMERO del documento sigue en `clients.dni` (renombrar esa columna rompería medio
-- sistema); aquí va solo de qué documento se trata.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cedula',
  ADD COLUMN IF NOT EXISTS jce_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jce_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC,
  ADD COLUMN IF NOT EXISTS location_note TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_document_type_valid'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_document_type_valid
      CHECK (document_type IN ('cedula', 'pasaporte', 'dni', 'id'));
  END IF;

  -- Coordenadas dentro del rango del planeta. No se restringe a República Dominicana:
  -- una empresa puede tener un cliente fuera y bloquearlo sería inventar una regla.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_coords_range'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_coords_range CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.clients.document_type IS 'cedula | pasaporte | dni | id. El número va en `dni`.';
COMMENT ON COLUMN public.clients.jce_verified IS 'Nombre, sexo y fecha de nacimiento fueron confirmados contra la JCE.';
COMMENT ON COLUMN public.clients.latitude IS 'Ubicación GPS de la vivienda del cliente (ruta de cobro).';
COMMENT ON COLUMN public.clients.location_accuracy IS 'Radio de error en metros que informó el GPS. NULL si se fijó en el mapa.';

-- Localizar rápido los clientes con coordenadas al armar la ruta del día
CREATE INDEX IF NOT EXISTS idx_clients_has_location
  ON public.clients (user_id)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 4. Caché de personas consultadas a la JCE
-- ----------------------------------------------------------------------------
-- La cédula en claro NUNCA se guarda: la clave es sha256(cédula).
CREATE TABLE IF NOT EXISTS public.personas_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula_hash        CHAR(64) NOT NULL UNIQUE,
  nombre             TEXT NOT NULL DEFAULT '',
  apellido           TEXT NOT NULL DEFAULT '',
  fecha_nacimiento   DATE,
  sexo               TEXT CHECK (sexo IS NULL OR sexo IN ('M', 'F')),
  nacionalidad       TEXT,
  estado_civil       TEXT,
  ciudad             TEXT,
  -- Nombre del archivo dentro del bucket `jce-photos`, nunca una ruta absoluta.
  imagen_path        TEXT,
  fuente             TEXT NOT NULL DEFAULT 'persona_segura',
  consultas_count    INTEGER NOT NULL DEFAULT 1,
  ultima_consulta_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personas_cache IS
  'Caché de respuestas de la JCE. Clave: sha256 de la cédula — la cédula en claro nunca se guarda.';

CREATE INDEX IF NOT EXISTS idx_personas_cache_fecha ON public.personas_cache (ultima_consulta_en);


-- ----------------------------------------------------------------------------
-- 5. Auditoría de consultas (Ley 172-13)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.persona_lookups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Solo un PREFIJO del hash: suficiente para correlacionar consultas repetidas,
  -- insuficiente para reconstruir nada.
  cedula_hash VARCHAR(16) NOT NULL,
  resultado   TEXT NOT NULL,
  fuente      TEXT NOT NULL DEFAULT 'persona_segura',
  company_id  UUID,
  user_id     UUID,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.persona_lookups IS
  'Auditoría Ley 172-13: quién consultó qué cédula (hash corto), cuándo y con qué resultado.';

CREATE INDEX IF NOT EXISTS idx_persona_lookups_created ON public.persona_lookups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_persona_lookups_company ON public.persona_lookups (company_id, created_at DESC);


-- ----------------------------------------------------------------------------
-- 6. RLS: estas dos tablas quedan cerradas al navegador
-- ----------------------------------------------------------------------------
-- Se activa RLS y NO se crea ninguna política. En Postgres eso significa "nadie pasa",
-- salvo `service_role`, que salta RLS y es la identidad con la que corre la Edge Function.
-- La aplicación nunca consulta la caché directamente.
ALTER TABLE public.personas_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_lookups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.personas_cache  FROM anon, authenticated;
REVOKE ALL ON public.persona_lookups FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Bucket PRIVADO para las fotos de la JCE
-- ----------------------------------------------------------------------------
-- Sin políticas de storage para `authenticated`: las URLs las firma la Edge Function.
INSERT INTO storage.buckets (id, name, public)
VALUES ('jce-photos', 'jce-photos', false)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 8. Datos existentes
-- ----------------------------------------------------------------------------
-- Los préstamos anteriores se crearon con el modelo antiguo (gastos de cierre aparte).
UPDATE public.loans   SET closing_costs_financed = false WHERE closing_costs_financed IS NULL;
-- Los clientes existentes se dieron de alta cuando solo había cédula.
UPDATE public.clients SET document_type = 'cedula'       WHERE document_type IS NULL;


-- ============================================================================
-- Comprobación: las cuatro filas deben decir OK
-- ============================================================================
SELECT
  'loans.closing_costs_financed' AS objeto,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'loans'
       AND column_name = 'closing_costs_financed'
  ) THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'payments.superseded_at',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payments'
       AND column_name = 'superseded_at'
  ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'clients.location_accuracy',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'clients'
       AND column_name = 'location_accuracy'
  ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'personas_cache',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'personas_cache'
  ) THEN 'OK' ELSE 'FALTA' END;
