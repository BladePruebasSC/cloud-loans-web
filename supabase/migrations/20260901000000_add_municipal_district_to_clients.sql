-- ============================================================================
-- Distrito municipal del cliente
-- ============================================================================
-- `clients` ya tenía `province`, `municipality` y `sector` (20250131000002 / 20250131000005),
-- pero faltaba el nivel intermedio de la división territorial dominicana:
--
--     Provincia → Municipio → Distrito Municipal → Sector
--
-- El formulario de clientes ahora los pide en cascada. `sector` sigue siendo texto libre
-- (los sectores/barrios no tienen catálogo oficial manejable).
--
-- Además se hace `phone` obligatorio a nivel de datos: ya era NOT NULL en el esquema, pero
-- nada impedía guardar una cadena vacía, y un cliente sin teléfono es incobrable.
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS municipal_district TEXT;

COMMENT ON COLUMN public.clients.municipal_district IS
  'Distrito municipal donde reside el cliente (nivel entre municipio y sector)';

-- Búsquedas y agrupaciones por zona (mapa, rutas de cobro, informes)
CREATE INDEX IF NOT EXISTS idx_clients_territory
  ON public.clients (user_id, province, municipality);

-- ----------------------------------------------------------------------------
-- Teléfono obligatorio
-- ----------------------------------------------------------------------------
-- Los registros existentes sin teléfono se marcan para que se vean en la aplicación en vez
-- de bloquear la migración. NO se inventan datos: se deja una marca explícita y revisable.
UPDATE public.clients
   SET phone = 'SIN TELEFONO'
 WHERE phone IS NULL OR btrim(phone) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass
       AND conname = 'clients_phone_not_blank'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_phone_not_blank CHECK (btrim(phone) <> '');
  END IF;
END $$;
