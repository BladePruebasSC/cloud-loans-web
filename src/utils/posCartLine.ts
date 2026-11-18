// ============================================================================
// LO QUE DE VERDAD SE COBRA POR CADA LÍNEA DE UNA VENTA
// ============================================================================
// FALLO REPORTADO (2026-11-18): "realizo una venta a un precio, le agrego descuento, y en la
// factura sale el precio sin descuento y sumándole también ITBIS; eso hace que en los reportes
// todos los productos salgan vendidos al mismo precio".
//
// En el punto de venta el descuento se puede poner de DOS maneras:
//   · por ítem  — cada línea lleva su porcentaje;
//   · al total  — un solo porcentaje sobre toda la venta.
//
// La segunda no llegaba a las líneas: el carrito deja el `subtotal` de cada una SIN descontar y
// el descuento se aplicaba solo al final, al sumar. Así, la FACTURA enseñaba cada producto a su
// precio de lista (y con su ITBIS encima), y lo que se guardaba de cada línea era ese mismo
// precio de lista: en los reportes todas las ventas de un producto salían al mismo precio, por
// mucho descuento que se hubiera hecho.
//
// Aquí se calcula una sola vez lo que corresponde a una línea —con su descuento, venga de donde
// venga— y de ahí salen la factura, lo que se guarda y, por tanto, los reportes.

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export interface CartLineLike {
  /** Precio de LISTA por unidad, con ITBIS (es el que se escribe en el carrito). */
  unitPrice: number;
  quantity: number;
  /** Descuento de esta línea, en % (solo cuenta en el modo "por ítem"). */
  discountPercent?: number | null;
  /** Base de la línea ya con su descuento, tal como la lleva el carrito. */
  subtotal?: number | null;
  /** % de ITBIS del producto (0 en un exento). */
  itbisRate: number;
}

export interface SaleDiscountLike {
  mode?: 'item' | 'total' | null;
  /** % de descuento aplicado a TODA la venta. */
  totalPercent?: number | null;
}

export interface CartLineAmounts {
  /** Base de la línea SIN descuento ni ITBIS (precio de lista × cantidad). */
  listBase: number;
  /** Base ya con el descuento, sin ITBIS. */
  base: number;
  /** ITBIS sobre la base con descuento (un descuento también baja el impuesto). */
  tax: number;
  /** Lo que paga el cliente por esta línea. */
  total: number;
  /** Precio por unidad REALMENTE cobrado, con ITBIS. */
  unitCharged: number;
  /** Lo descontado en esta línea, sin ITBIS. */
  discount: number;
  /** El descuento de la línea en %, venga del ítem o del total. */
  discountPercent: number;
}

/** Lo que corresponde a una línea del carrito, con su descuento ya aplicado. */
export const cartLineAmounts = (
  line: CartLineLike,
  discount?: SaleDiscountLike | null,
): CartLineAmounts => {
  const rate = Math.max(0, Number(line?.itbisRate) || 0);
  const quantity = Number(line?.quantity) || 0;
  const unitPrice = Number(line?.unitPrice) || 0;
  // Sin redondear: redondear la base de lista y volver a aplicarle el impuesto se dejaba un
  // céntimo por el camino (un precio escrito de 100 salía 100.01).
  const listBaseExacta = (unitPrice / (1 + rate / 100)) * quantity;

  let base: number;
  if (discount?.mode === 'total') {
    // El descuento al total se reparte por igual: cada línea pierde el mismo porcentaje.
    const pct = Math.min(Math.max(Number(discount?.totalPercent) || 0, 0), 100);
    base = listBaseExacta * (1 - pct / 100);
  } else if (line?.subtotal !== null && line?.subtotal !== undefined) {
    // El carrito ya guarda la base con el descuento del ítem.
    base = Number(line.subtotal) || 0;
  } else {
    const pct = Math.min(Math.max(Number(line?.discountPercent) || 0, 0), 100);
    base = listBaseExacta * (1 - pct / 100);
  }

  // El TOTAL se calcula sobre la base sin redondear y el impuesto es la diferencia: así
  // `base + ITBIS` da siempre el total exacto y un precio escrito de 100 vuelve a salir 100
  // (redondear la base primero y aplicarle el impuesto después se dejaba un céntimo por el
  // camino).
  const baseExacta = Math.max(0, base);
  const total = round2(baseExacta * (1 + rate / 100));
  const baseR = round2(baseExacta);
  const tax = round2(total - baseR);
  const listBase = round2(listBaseExacta);
  const descuento = round2(Math.max(0, listBase - baseR));

  return {
    listBase,
    base: baseR,
    tax,
    total,
    unitCharged: quantity > 0 ? round2(total / quantity) : total,
    discount: descuento,
    discountPercent: listBase > 0.005 ? round2((descuento / listBase) * 100) : 0,
  };
};
