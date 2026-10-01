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

/** Valor del stock de un producto, con ITBIS (precio de venta × unidades). */
export const stockValueWithItbis = (
  product: (ProductLikeWithItbis & { current_stock?: number | null }) | null | undefined,
): number => round2(sellingPriceWithItbis(product) * (Number(product?.current_stock) || 0));

/** Valor total del inventario, con ITBIS. */
export const inventoryValueWithItbis = (
  products: Array<ProductLikeWithItbis & { current_stock?: number | null }>,
): number => round2((products || []).reduce((sum, p) => sum + stockValueWithItbis(p), 0));
