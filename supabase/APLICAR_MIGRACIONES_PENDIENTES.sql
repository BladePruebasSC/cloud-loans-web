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
-- La sección 4 es una RED DE SEGURIDAD: declara de golpe todas las columnas que escriben
-- los formularios de cliente y préstamo, repartidas por una docena de migraciones. Basta
-- con que UNA no se haya aplicado para que el guardado falle entero, y arreglarlas de una
-- en una es un goteo sin fin.
--
-- Es IDEMPOTENTE: todo va con IF NOT EXISTS o ON CONFLICT, así que ejecutarlo dos veces no
-- rompe nada ni pisa datos existentes. `ADD COLUMN IF NOT EXISTS` no toca las columnas que
-- ya existen: ni el tipo, ni los datos, ni el valor por defecto. No borra ni modifica
-- ninguna fila salvo los UPDATE del final, que solo rellenan valores por defecto en
-- columnas recién creadas.
--
-- AL TERMINAR, la consulta del final no debe devolver NINGUNA fila.
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
-- 4. RED DE SEGURIDAD: el resto de columnas que escriben los formularios
-- ----------------------------------------------------------------------------
-- Arreglar las columnas de una en una es un goteo sin fin: el formulario de clientes
-- escribe ~50 campos repartidos por una docena de migraciones y basta con que UNA no se
-- haya aplicado para que el guardado falle entero. Aquí se declaran TODAS de golpe.
--
-- `ADD COLUMN IF NOT EXISTS` no toca las que ya existen: ni el tipo, ni los datos, ni el
-- valor por defecto. Para una base al día esto no hace absolutamente nada.
--
-- Los tipos coinciden con los de las migraciones originales; donde hubo dos versiones
-- (NUMERIC(10,2) y DECIMAL(10,2), que en Postgres son lo mismo) se usa la primera.
ALTER TABLE public.clients
  -- Identidad
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  -- Contacto
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS phone_secondary TEXT,
  -- Ubicación (la cascada provincia -> municipio -> distrito -> sector)
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS municipal_district TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS collection_route TEXT,
  -- Trabajo e ingresos
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS employment_status TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS housing NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dependents INTEGER,
  ADD COLUMN IF NOT EXISTS rnc TEXT,
  ADD COLUMN IF NOT EXISTS workplace_name TEXT,
  ADD COLUMN IF NOT EXISTS workplace_address TEXT,
  -- Datos bancarios
  ADD COLUMN IF NOT EXISTS card_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_user TEXT,
  ADD COLUMN IF NOT EXISTS bank_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_token_identifier TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  -- Clasificación y extras
  ADD COLUMN IF NOT EXISTS recommended_by TEXT,
  ADD COLUMN IF NOT EXISTS color_classification TEXT,
  ADD COLUMN IF NOT EXISTS visible_in_loan_data BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_field_1 TEXT,
  ADD COLUMN IF NOT EXISTS custom_field_2 TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS credit_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by UUID;

COMMENT ON COLUMN public.clients.municipal_district IS
  'Distrito municipal dentro del municipio. Opcional: muchos municipios no tienen.';

-- Lo mismo para los préstamos: el formulario escribe columnas de varias migraciones.
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS amortization_type TEXT DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS first_payment_date DATE,
  ADD COLUMN IF NOT EXISTS closing_costs NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excluded_days TEXT[],
  ADD COLUMN IF NOT EXISTS portfolio_id UUID,
  ADD COLUMN IF NOT EXISTS minimum_payment_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS minimum_payment_type TEXT,
  ADD COLUMN IF NOT EXISTS minimum_payment_percentage NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_fee_rate NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_late_fee NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS late_fee_calculation_type TEXT,
  ADD COLUMN IF NOT EXISTS add_expense_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fixed_payment_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fixed_payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS guarantor_name TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_phone TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_dni TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;


-- ----------------------------------------------------------------------------
-- 5. Caché de personas consultadas a la JCE
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
-- 6. Auditoría de consultas (Ley 172-13)
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
-- 7. RLS: estas dos tablas quedan cerradas al navegador
-- ----------------------------------------------------------------------------
-- Se activa RLS y NO se crea ninguna política. En Postgres eso significa "nadie pasa",
-- salvo `service_role`, que salta RLS y es la identidad con la que corre la Edge Function.
-- La aplicación nunca consulta la caché directamente.
ALTER TABLE public.personas_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_lookups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.personas_cache  FROM anon, authenticated;
REVOKE ALL ON public.persona_lookups FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 8. Bucket PRIVADO para las fotos de la JCE
-- ----------------------------------------------------------------------------
-- Sin políticas de storage para `authenticated`: las URLs las firma la Edge Function.
INSERT INTO storage.buckets (id, name, public)
VALUES ('jce-photos', 'jce-photos', false)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 9. Datos existentes
-- ----------------------------------------------------------------------------
-- Los préstamos anteriores se crearon con el modelo antiguo (gastos de cierre aparte).
UPDATE public.loans   SET closing_costs_financed = false WHERE closing_costs_financed IS NULL;
-- Los clientes existentes se dieron de alta cuando solo había cédula.
UPDATE public.clients SET document_type = 'cedula'       WHERE document_type IS NULL;


-- ============================================================================
-- COMPROBACIÓN — no debe devolver NINGUNA fila
-- ============================================================================
-- En vez de comprobar cuatro columnas sueltas, se listan TODAS las que los formularios
-- escriben y se muestran solo las que siguen sin existir. Cero filas = nada que arreglar.
-- Si aparece alguna, ese nombre es exactamente el que dirá el mensaje de error de la
-- aplicación, y significa que su ALTER TABLE de arriba no llegó a ejecutarse.
WITH esperadas(tabla, columna) AS (
  VALUES
    ('loans','closing_costs_financed'), ('loans','closing_costs'),
    ('loans','amortization_type'), ('loans','payment_frequency'),
    ('loans','first_payment_date'), ('loans','excluded_days'), ('loans','portfolio_id'),
    ('loans','fixed_payment_enabled'), ('loans','fixed_payment_amount'),
    ('loans','late_fee_enabled'), ('loans','late_fee_rate'), ('loans','grace_period_days'),
    ('loans','max_late_fee'), ('loans','late_fee_calculation_type'),
    ('loans','minimum_payment_enabled'), ('loans','minimum_payment_type'),
    ('loans','minimum_payment_percentage'), ('loans','add_expense_enabled'),
    ('loans','guarantor_name'), ('loans','guarantor_phone'), ('loans','guarantor_dni'),
    ('loans','notes'),
    ('payments','superseded_at'), ('payments','original_due_date'),
    ('clients','first_name'), ('clients','last_name'), ('clients','nickname'),
    ('clients','document_type'), ('clients','jce_verified'), ('clients','jce_verified_at'),
    ('clients','nationality'), ('clients','birth_date'), ('clients','gender'),
    ('clients','marital_status'), ('clients','photo_url'), ('clients','whatsapp'),
    ('clients','phone_secondary'), ('clients','province'), ('clients','municipality'),
    ('clients','municipal_district'), ('clients','sector'), ('clients','neighborhood'),
    ('clients','city'), ('clients','collection_route'), ('clients','occupation'),
    ('clients','employment_status'), ('clients','monthly_income'), ('clients','housing'),
    ('clients','dependents'), ('clients','rnc'), ('clients','workplace_name'),
    ('clients','workplace_address'), ('clients','card_number'), ('clients','bank_user'),
    ('clients','bank_code'), ('clients','bank_token_identifier'), ('clients','bank_name'),
    ('clients','recommended_by'), ('clients','color_classification'),
    ('clients','visible_in_loan_data'), ('clients','custom_field_1'),
    ('clients','custom_field_2'), ('clients','attachment_url'), ('clients','credit_score'),
    ('clients','status'), ('clients','created_by'),
    ('clients','latitude'), ('clients','longitude'), ('clients','location_accuracy'),
    ('clients','location_note'), ('clients','location_updated_at')
)
SELECT e.tabla || '.' || e.columna AS falta_todavia
  FROM esperadas e
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = e.tabla AND c.column_name = e.columna
 )
UNION ALL
SELECT 'tabla ' || t
  FROM (VALUES ('personas_cache'), ('persona_lookups')) AS x(t)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = x.t
 );
