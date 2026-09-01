-- ============================================================================
-- Verificación de cédula contra la JCE (persona_segura) + ubicación GPS del cliente
-- ============================================================================
-- Adaptación del diseño PHP/MySQL de referencia a este stack (React + Supabase, sin
-- servidor de aplicación). El equivalente del controlador y el servicio es la Edge
-- Function `jce-lookup`, que es lo único que toca estas tablas: la API key y toda la
-- lógica de red viven ahí, nunca en el navegador.
--
-- PRIVACIDAD (Ley 172-13 RD) — reglas que este esquema hace cumplir:
--   · La cédula en claro NUNCA se persiste. En la caché se guarda `sha256(cedula)`;
--     en la auditoría, solo los 16 primeros caracteres de ese hash.
--   · RLS SIN POLÍTICAS en ambas tablas: ningún usuario autenticado puede leerlas ni
--     escribirlas desde el navegador. Solo la Edge Function (service_role, que salta
--     RLS) entra. La app nunca consulta la caché directamente.
--   · La foto se guarda en un bucket PRIVADO y se sirve por el id de la fila de caché
--     mediante URL firmada de corta duración: el nombre del archivo no deriva de la
--     cédula, así que no la expone ni por el path.
--   · Cada consulta queda auditada con empresa, usuario, resultado, IP y user-agent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Caché de personas consultadas
-- ----------------------------------------------------------------------------
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
  -- Nombre del archivo dentro del bucket `jce-photos` (portable entre entornos:
  -- nunca una ruta absoluta, que es uno de los tropiezos documentados del diseño original)
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
-- 2. Auditoría de consultas
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
-- 3. RLS: cerradas a cal y canto para el navegador
-- ----------------------------------------------------------------------------
-- Se activa RLS y NO se crea ninguna política. En Postgres eso significa "nadie pasa",
-- salvo `service_role`, que salta RLS y es la identidad con la que corre la Edge Function.
ALTER TABLE public.personas_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_lookups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.personas_cache  FROM anon, authenticated;
REVOKE ALL ON public.persona_lookups FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Bucket privado para las fotos de la JCE
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('jce-photos', 'jce-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Sin políticas de storage para `authenticated`: las URLs se firman desde la Edge Function.

-- ----------------------------------------------------------------------------
-- 5. Cliente: tipo de documento, verificación JCE y ubicación GPS
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients
  -- El NÚMERO sigue guardándose en `clients.dni` (renombrar esa columna rompería medio
  -- sistema); aquí va solo de qué documento se trata.
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cedula',
  ADD COLUMN IF NOT EXISTS jce_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jce_verified_at TIMESTAMPTZ,
  -- Ubicación de la VIVIENDA, para que el cobrador llegue sin dar vueltas
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

-- Los clientes existentes se dieron de alta cuando solo había cédula.
UPDATE public.clients SET document_type = 'cedula' WHERE document_type IS NULL;

-- Localizar rápido los clientes con coordenadas al armar la ruta del día
CREATE INDEX IF NOT EXISTS idx_clients_has_location
  ON public.clients (user_id)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
