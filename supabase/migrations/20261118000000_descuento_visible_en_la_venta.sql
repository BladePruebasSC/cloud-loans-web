-- ============================================================================
-- EL DESCUENTO Y LA FORMA DE PAGO QUEDAN ESCRITOS EN LA VENTA
-- ============================================================================
-- FALLO REPORTADO (2026-11-18): "en las facturas no se ve el descuento, tampoco en los
-- reportes... muchas de esas ventas fue con descuento pero no hay forma de saberlo porque no lo
-- indica".
--
-- El descuento sí llegaba al precio —lo que se cobra y lo que se guarda ya está rebajado—, pero
-- no quedaba escrito en ninguna parte: una venta de 123,900 con 10% se guardaba como una venta
-- de 111,510 a secas. Sin el precio de LISTA no hay forma de saber que hubo descuento.
--
-- Esta migración:
--   1. añade a la venta (y a su detalle) el precio de lista, el descuento y el % aplicado;
--   2. añade el desglose (subtotal, ITBIS) donde falte;
--   3. permite guardar la forma de pago real —financiamiento, mixto, crédito— y el reparto
--      cuando la venta se pagó con varias;
--   4. DEDUCE el precio de lista de las ventas ya hechas a partir del precio de venta actual del
--      producto, para que las de estos días enseñen por fin su descuento.
--
-- Sobre el punto 4: si un producto cambió de precio después de vendido, lo deducido no es
-- exacto. De aquí en adelante no hace falta deducir nada: el punto de venta guarda el precio de
-- lista del día, y queda congelado.
--
-- Es idempotente: se puede aplicar varias veces.

-- ---------------------------------------------------------------------------
-- 1. Columnas en `sales`
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sales') IS NULL THEN
    RAISE NOTICE 'No hay tabla public.sales: nada que hacer.';
    RETURN;
  END IF;

  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC;
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_amount NUMERIC;
  -- Sin DEFAULT a propósito: NULL significa "esta venta no lo guardó" (y entonces se deduce del
  -- precio de lista), que no es lo mismo que "no hubo descuento".
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC;
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS list_unit_price NUMERIC;
  ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_details JSONB;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sales') IS NULL THEN RETURN; END IF;
  EXECUTE $c$COMMENT ON COLUMN public.sales.list_unit_price IS
    'Precio de LISTA por unidad, CON ITBIS, el día de la venta. Comparado con unit_price (lo
     realmente cobrado) da el descuento que se aplicó.'$c$;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Columnas en `sale_details` (las bases que guardan la venta con su detalle)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sale_details') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.sale_details ADD COLUMN IF NOT EXISTS list_unit_price NUMERIC;
  ALTER TABLE public.sale_details ADD COLUMN IF NOT EXISTS discount_amount NUMERIC;
  ALTER TABLE public.sale_details ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;
  ALTER TABLE public.sale_details ADD COLUMN IF NOT EXISTS itbis_rate NUMERIC;
END $$;

-- ---------------------------------------------------------------------------
-- 3. La forma de pago real
-- ---------------------------------------------------------------------------
-- La tabla solo admitía 'cash', 'card', 'transfer' y 'check', así que una venta FINANCIADA se
-- guardaba como efectivo y en los reportes salía mezclada con las de contado. Ahora se admite
-- también 'financing' (financiada), 'credit' (a crédito) y 'mixed' (pagada con varias formas,
-- cuyo reparto va en `payment_details`).
DO $$
DECLARE
  nombre text;
BEGIN
  IF to_regclass('public.sales') IS NULL THEN RETURN; END IF;

  FOR nombre IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'sales' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', nombre);
  END LOOP;

  BEGIN
    ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN
        ('cash', 'card', 'transfer', 'check', 'financing', 'credit', 'mixed', 'other'));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo recrear el CHECK de payment_method: %', SQLERRM;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sales') IS NULL THEN RETURN; END IF;
  EXECUTE $c$COMMENT ON COLUMN public.sales.payment_details IS
    'Reparto de la venta entre formas de pago, p. ej. [{"method":"cash","amount":5000}].
     Se usa cuando payment_method = ''mixed''.'$c$;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Deducir el precio de lista de lo ya vendido
-- ---------------------------------------------------------------------------
-- Solo donde la venta NO lo guardó. El precio de venta del producto va sin ITBIS; el precio de
-- lista de una venta va con ITBIS, igual que `unit_price`.
DO $$
DECLARE
  tocadas bigint := 0;
BEGIN
  IF to_regclass('public.sales') IS NULL OR to_regclass('public.products') IS NULL THEN RETURN; END IF;

  -- Esquema simple: cada fila de `sales` es una línea de venta.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'product_id'
  ) THEN
    UPDATE public.sales s
    SET list_unit_price = ROUND(p.selling_price * (1 + COALESCE(p.itbis_rate, 18) / 100.0), 2)
    FROM public.products p
    WHERE s.product_id = p.id
      AND s.list_unit_price IS NULL
      AND COALESCE(p.selling_price, 0) > 0;
    GET DIAGNOSTICS tocadas = ROW_COUNT;
    RAISE NOTICE 'Precio de lista deducido en % ventas del esquema simple.', tocadas;
  END IF;

  -- Esquema con detalle.
  IF to_regclass('public.sale_details') IS NOT NULL THEN
    UPDATE public.sale_details d
    SET list_unit_price = ROUND(p.selling_price * (1 + COALESCE(p.itbis_rate, 18) / 100.0), 2)
    FROM public.products p
    WHERE d.product_id = p.id
      AND d.list_unit_price IS NULL
      AND COALESCE(p.selling_price, 0) > 0;
    GET DIAGNOSTICS tocadas = ROW_COUNT;
    RAISE NOTICE 'Precio de lista deducido en % líneas de venta.', tocadas;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. El ITBIS de cada línea, donde el detalle no lo guardaba
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sale_details') IS NULL OR to_regclass('public.products') IS NULL THEN RETURN; END IF;

  UPDATE public.sale_details d
  SET itbis_rate = COALESCE(p.itbis_rate, 18)
  FROM public.products p
  WHERE d.product_id = p.id AND d.itbis_rate IS NULL;
END $$;
