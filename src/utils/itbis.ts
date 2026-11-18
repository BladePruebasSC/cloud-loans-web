// ============================================================================
// ITBIS: los precios SIEMPRE se muestran con impuesto
// ============================================================================
// CAMBIO SOLICITADO (2026-10-01): "en la parte de punto de venta los precios de venta y costo no
// están mostrándose con impuestos; siempre deben mostrarse con impuestos, tanto en inventario
// como en punto de venta, en la factura, en los reportes, etc."
//
// CÓMO SE GUARDA: `products.purchase_price` y `products.selling_price` son precios SIN ITBIS
// (así lo dice el propio formulario de producto), y `products.itbis_rate` es el porcentaje de
// cada producto (18% si no trae ninguno). Lo que cambia es la PRESENTACIÓN: en pantalla, en la
// factura y en los informes se enseña el precio con impuesto incluido.
//
// La factura sigue desglosando subtotal + ITBIS; eso no cambia: lo que no puede pasar es que un
// precio de venta aparezca sin el impuesto que el cliente va a pagar.

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** ITBIS por defecto en República Dominicana. */
export const DEFAULT_ITBIS_RATE = 18;

export interface ProductLikeWithItbis {
  purchase_price?: number | null;
  selling_price?: number | null;
  itbis_rate?: number | null;
}

/** Porcentaje de ITBIS de un producto (18% si no tiene uno propio). */
export const itbisRateOf = (product: { itbis_rate?: number | null } | null | undefined): number => {
  const raw = product?.itbis_rate as number | string | null | undefined;
  // `null`/sin valor = el producto no tiene tasa propia; 0 SÍ es válido (producto exento).
  if (raw === null || raw === undefined || raw === '') return DEFAULT_ITBIS_RATE;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_ITBIS_RATE;
};

/** Precio SIN impuesto → precio CON impuesto. */
export const withItbis = (amountWithoutTax: number | null | undefined, rate: number): number =>
  round2((Number(amountWithoutTax) || 0) * (1 + (Number(rate) || 0) / 100));

/** Precio CON impuesto → precio SIN impuesto (lo que se guarda en la base). */
export const withoutItbis = (amountWithTax: number | null | undefined, rate: number): number => {
  const factor = 1 + (Number(rate) || 0) / 100;
  return factor > 0 ? round2((Number(amountWithTax) || 0) / factor) : round2(Number(amountWithTax) || 0);
};

/** El impuesto que corresponde a un importe SIN impuesto. */
export const itbisOf = (amountWithoutTax: number | null | undefined, rate: number): number =>
  round2((Number(amountWithoutTax) || 0) * ((Number(rate) || 0) / 100));

/** Precio de VENTA con ITBIS de un producto (lo que paga el cliente). */
export const sellingPriceWithItbis = (product: ProductLikeWithItbis | null | undefined): number =>
  withItbis(product?.selling_price, itbisRateOf(product));

/** Precio de COMPRA con ITBIS de un producto (lo que costó de verdad). */
export const purchasePriceWithItbis = (product: ProductLikeWithItbis | null | undefined): number =>
  withItbis(product?.purchase_price, itbisRateOf(product));

// ---------------------------------------------------------------------------
// LÍNEAS DE VENTA
// ---------------------------------------------------------------------------
// Las ventas se han guardado de dos maneras y el impuesto no vive igual en las dos:
//   · con `sale_details`: `unit_price` lleva ITBIS y `total_price` es la BASE, sin él;
//   · esquema simple (cada fila de `sales` es una línea): `total_price` es el TOTAL de la línea,
//     con ITBIS, porque no hay otra tabla donde sumarlo.
//
// FALLO REPORTADO (2026-11-18): "en el reporte sigue diciendo 138,891.90, que es el monto de
// venta (con impuestos) + un 18% que también le está sumando; ese precio ya tiene el impuesto
// incluido". El módulo de inventario daba por hecho la PRIMERA forma en todas partes, así que a
// una venta del esquema simple le volvía a sumar el ITBIS.
//
// El `unit_price` SIEMPRE lleva impuesto, en los dos esquemas, así que es de donde se parte.

export interface SaleLineRowLike {
  quantity?: number | null;
  /** Precio por unidad: SIEMPRE con ITBIS. */
  unit_price?: number | null;
  total_price?: number | null;
  itbis_rate?: number | null;
}

/** Lo que se cobró por una línea de venta, CON ITBIS. */
export const saleLineTotalWithItbis = (
  line: SaleLineRowLike | null | undefined,
  totalPriceHasItbis = false,
): number => {
  const porUnitario = (Number(line?.unit_price) || 0) * (Number(line?.quantity) || 0);
  if (porUnitario > 0.005) return round2(porUnitario);
  const total = Number(line?.total_price) || 0;
  return totalPriceHasItbis ? round2(total) : withItbis(total, itbisRateOf(line));
};

/** La BASE de una línea de venta, sin ITBIS (lo que el resto del sistema llama `total_price`). */
export const saleLineBaseWithoutItbis = (
  line: SaleLineRowLike | null | undefined,
  totalPriceHasItbis = false,
): number => withoutItbis(saleLineTotalWithItbis(line, totalPriceHasItbis), itbisRateOf(line));

/** Valor del stock de un producto, con ITBIS (precio de VENTA × unidades). */
export const stockValueWithItbis = (
  product: (ProductLikeWithItbis & { current_stock?: number | null }) | null | undefined,
): number => round2(sellingPriceWithItbis(product) * (Number(product?.current_stock) || 0));

/**
 * Lo que COSTÓ el stock de un producto, con ITBIS (precio de compra × unidades).
 *
 * Son dos cifras distintas y las dos hacen falta: lo que costó la mercancía y lo que se espera
 * cobrar por ella. Enseñar una sin decir cuál es la que hacía pensar que el sistema "toma el
 * precio de compra en vez del de venta" (2026-11-17).
 */
export const stockCostWithItbis = (
  product: (ProductLikeWithItbis & { current_stock?: number | null }) | null | undefined,
): number => round2(purchasePriceWithItbis(product) * (Number(product?.current_stock) || 0));

/** Valor total del inventario a precio de VENTA, con ITBIS. */
export const inventoryValueWithItbis = (
  products: Array<ProductLikeWithItbis & { current_stock?: number | null }>,
): number => round2((products || []).reduce((sum, p) => sum + stockValueWithItbis(p), 0));

/** Lo que costó todo el inventario, con ITBIS. */
export const inventoryCostWithItbis = (
  products: Array<ProductLikeWithItbis & { current_stock?: number | null }>,
): number => round2((products || []).reduce((sum, p) => sum + stockCostWithItbis(p), 0));
