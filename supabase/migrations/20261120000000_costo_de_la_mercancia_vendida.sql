-- ============================================================================
-- CADA VENTA GUARDA LO QUE LE COSTÓ LA MERCANCÍA
-- ============================================================================
-- PEDIDO (2026-11-20): "a los reportes necesito que le agregues un reporte que controle el costo
-- y lo que se vendió, o sea que me dé la ganancia de las ventas; no hay ningún reporte que hable
-- de ganancias como tal".
--
-- Para saber la ganancia hace falta el COSTO de lo vendido, y la venta no lo guardaba: solo
-- quedaba el precio de compra ACTUAL del producto, que cambia cada vez que se repone mercancía.
-- Con eso, la ganancia de una venta de enero se recalculaba sola en marzo.
--
-- Esta migración:
--   1. añade `unit_cost` —lo que costó UNA unidad, SIN ITBIS— a la venta y a su detalle;
--   2. lo rellena en lo ya vendido con el precio de compra actual del producto.
--
-- Sobre el punto 2: si al producto le cambió el costo desde que se vendió, lo rellenado no es
-- exacto. De aquí en adelante no hace falta rellenar nada: el punto de venta guarda el costo del
-- día y queda congelado, igual que el precio de lista (migración 20261118000000).
--
-- El costo va SIN ITBIS, como `products.purchase_price` y como la base de la venta: así la resta
-- "lo cobrado sin impuesto − lo que costó" es entre dos cifras comparables.
--
-- Es idempotente: se puede aplicar varias veces.

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL THEN
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS unit_cost NUMERIC;
    EXECUTE $c$COMMENT ON COLUMN public.sales.unit_cost IS
      'Lo que costó UNA unidad, SIN ITBIS, el día de la venta. Con el precio cobrado al lado da
       la ganancia de la venta.'$c$;
  END IF;

  IF to_regclass('public.sale_details') IS NOT NULL THEN
    ALTER TABLE public.sale_details ADD COLUMN IF NOT EXISTS unit_cost NUMERIC;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rellenar lo ya vendido
-- ---------------------------------------------------------------------------
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
       SET unit_cost = ROUND(p.purchase_price::numeric, 2)
      FROM public.products p
     WHERE s.product_id = p.id
       AND s.unit_cost IS NULL
       AND COALESCE(p.purchase_price, 0) > 0;
    GET DIAGNOSTICS tocadas = ROW_COUNT;
    RAISE NOTICE 'Costo rellenado en % ventas del esquema simple.', tocadas;
  END IF;

  -- Esquema con detalle.
  IF to_regclass('public.sale_details') IS NOT NULL THEN
    UPDATE public.sale_details d
       SET unit_cost = ROUND(p.purchase_price::numeric, 2)
      FROM public.products p
     WHERE d.product_id = p.id
       AND d.unit_cost IS NULL
       AND COALESCE(p.purchase_price, 0) > 0;
    GET DIAGNOSTICS tocadas = ROW_COUNT;
    RAISE NOTICE 'Costo rellenado en % líneas de venta.', tocadas;
  END IF;
END $$;
