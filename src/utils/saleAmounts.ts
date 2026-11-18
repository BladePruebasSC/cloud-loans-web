// ============================================================================
// LO QUE PASÓ EN UNA VENTA: precio de lista, descuento, ITBIS y lo cobrado
// ============================================================================
// FALLO REPORTADO (2026-11-18): "en las facturas no se ve el descuento, tampoco en los reportes…
// muchas de esas ventas fue con descuento pero no hay forma de saberlo porque no lo indica".
//
// El descuento SÍ llega al precio —lo que se cobra y lo que se guarda ya está rebajado (arreglo
// del 2026-11-18)—, pero no se decía EN NINGÚN SITIO. Una venta de 123,900 con 10% se guardaba
// como una venta de 111,510 a secas: la factura enseñaba "0%" fijo y el reporte una columna
// "Descuento" siempre en cero.
//
// Aquí se reconstruye la venta completa a partir de UNA sola referencia: el PRECIO DE LISTA.
//
//   precio de lista × cantidad  −  lo cobrado  =  el descuento
//
// El precio de lista sale, por este orden:
//   1. `list_unit_price` — el que se guardó con la venta (es el bueno: queda congelado aunque
//      el producto suba de precio mañana);
//   2. el precio de venta actual del producto, si la venta es vieja y no lo guardó;
//   3. lo cobrado, si no hay producto: entonces no hay descuento que deducir.
//
// `discountSource` dice cuál de los tres fue, para que un reporte pueda avisar cuando la cifra
// es deducida y no un dato guardado.
//
// LÍMITE CONOCIDO del caso 2: el precio de hoy no es el de aquel día. Si al producto le SUBIERON
// el precio después de venderlo, la venta vieja parece rebajada sin haberlo estado; por eso esas
// cifras salen marcadas como "deducidas" y el reporte lo advierte al pie. En cuanto la venta
// guarda su propio precio de lista (punto de venta, desde el 18/11/2026) deja de deducirse nada.

import { itbisRateOf, saleLineTotalWithItbis, sellingPriceWithItbis, withoutItbis } from './itbis';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Por debajo de medio peso no es un descuento: es el redondeo del ITBIS. */
const UMBRAL_DESCUENTO = 0.5;

export interface SaleLineProductLike {
  selling_price?: number | null;
  itbis_rate?: number | null;
}

export interface SaleLineLike {
  quantity?: number | null;
  /** Precio por unidad REALMENTE cobrado: siempre con ITBIS, en los dos esquemas. */
  unit_price?: number | null;
  total_price?: number | null;
  itbis_rate?: number | null;
  /** Precio de LISTA por unidad, con ITBIS, tal como estaba el día de la venta. */
  list_unit_price?: number | null;
  product?: SaleLineProductLike | null;
}

export type DiscountSource = 'guardado' | 'deducido' | 'ninguno';

export interface SaleLineAmounts {
  quantity: number;
  itbisRate: number;
  /** Precio de lista por unidad, CON ITBIS. */
  unitList: number;
  /** Precio por unidad realmente cobrado, CON ITBIS. */
  unitCharged: number;
  /** Lista × cantidad, SIN ITBIS (el "Subtotal" de una factura, antes del descuento). */
  listBase: number;
  /** Lista × cantidad, CON ITBIS. */
  listTotal: number;
  /** Lo cobrado SIN ITBIS (la base gravada). */
  base: number;
  /** El ITBIS de lo cobrado. */
  tax: number;
  /** Lo cobrado CON ITBIS. */
  total: number;
  /** Lo descontado SIN ITBIS: cuadra con el subtotal de la factura. */
  discount: number;
  /** Lo que el cliente se ahorró de verdad, CON ITBIS. */
  discountWithTax: number;
  /** El descuento en % (es el mismo con impuesto o sin él). */
  discountPercent: number;
  discountSource: DiscountSource;
}

export interface SaleLineOptions {
  /**
   * `true` cuando `total_price` es el TOTAL de la línea con ITBIS (esquema simple sin
   * `sale_details`). Por defecto es la base sin impuesto, que es como lo guarda `sale_details`.
   */
  totalPriceHasItbis?: boolean;
}

/** Lo que pasó en una línea de venta: precio de lista, descuento, impuesto y lo cobrado. */
export const saleLineAmounts = (
  line: SaleLineLike | null | undefined,
  options: SaleLineOptions = {},
): SaleLineAmounts => {
  const quantity = Math.max(0, Number(line?.quantity) || 0);
  const itbisRate = itbisRateOf({
    itbis_rate: line?.itbis_rate ?? line?.product?.itbis_rate ?? null,
  });
  const total = saleLineTotalWithItbis(
    { ...line, itbis_rate: itbisRate },
    options.totalPriceHasItbis === true,
  );
  const base = withoutItbis(total, itbisRate);
  const unitCharged = quantity > 0 ? round2(total / quantity) : round2(total);

  // --- El precio de lista, por orden de confianza ---
  const guardado = Number(line?.list_unit_price) || 0;
  const delProducto = line?.product ? sellingPriceWithItbis(line.product) : 0;
  let unitList = unitCharged;
  let discountSource: DiscountSource = 'ninguno';
  if (guardado > 0.005) {
    unitList = round2(guardado);
    discountSource = 'guardado';
  } else if (delProducto > 0.005) {
    // Si el producto SUBIÓ de precio después de la venta, el precio de hoy no sirve de
    // referencia: no se inventa un descuento al revés.
    unitList = Math.max(round2(delProducto), unitCharged);
    discountSource = 'deducido';
  }

  const listTotal = round2(unitList * quantity);
  const listBase = withoutItbis(listTotal, itbisRate);
  const discountWithTax = round2(Math.max(0, listTotal - total));
  const discount = round2(Math.max(0, listBase - base));

  if (discountWithTax < UMBRAL_DESCUENTO) {
    return {
      quantity, itbisRate,
      unitList: unitCharged, unitCharged,
      listBase: base, listTotal: total,
      base, tax: round2(total - base), total,
      discount: 0, discountWithTax: 0, discountPercent: 0,
      discountSource: discountSource === 'guardado' ? 'guardado' : 'ninguno',
    };
  }

  return {
    quantity, itbisRate,
    unitList, unitCharged,
    listBase, listTotal,
    base, tax: round2(total - base), total,
    discount, discountWithTax,
    discountPercent: listTotal > 0.005 ? round2((discountWithTax / listTotal) * 100) : 0,
    discountSource,
  };
};

export interface SaleAmounts {
  /** Unidades vendidas. */
  items: number;
  /** Suma de los precios de lista, SIN ITBIS. */
  listBase: number;
  /** Suma de los precios de lista, CON ITBIS. */
  listTotal: number;
  /** Lo cobrado sin ITBIS (base gravada, ya con el descuento). */
  base: number;
  tax: number;
  total: number;
  /** Descuento SIN ITBIS (cuadra con el subtotal de la factura). */
  discount: number;
  /** Descuento CON ITBIS (lo que el cliente se ahorró). */
  discountWithTax: number;
  discountPercent: number;
  /** `guardado` si alguna línea lo trae guardado; `deducido` si alguna hubo que deducirla. */
  discountSource: DiscountSource;
  lines: SaleLineAmounts[];
}

/** Lo mismo para una venta entera: la suma de sus líneas. */
export const saleAmounts = (
  lines: Array<SaleLineLike | null | undefined> | null | undefined,
  options: SaleLineOptions = {},
): SaleAmounts => {
  const detalle = (lines || []).map(l => saleLineAmounts(l, options));
  const suma = (pick: (l: SaleLineAmounts) => number) => round2(detalle.reduce((s, l) => s + pick(l), 0));

  const listTotal = suma(l => l.listTotal);
  const total = suma(l => l.total);
  const discountWithTax = suma(l => l.discountWithTax);
  const conDescuento = detalle.filter(l => l.discountWithTax > 0);
  const discountSource: DiscountSource = conDescuento.some(l => l.discountSource === 'deducido')
    ? 'deducido'
    : conDescuento.length > 0 ? 'guardado' : 'ninguno';

  return {
    items: detalle.reduce((n, l) => n + l.quantity, 0),
    listBase: suma(l => l.listBase),
    listTotal,
    base: suma(l => l.base),
    tax: suma(l => l.tax),
    total,
    discount: suma(l => l.discount),
    discountWithTax,
    discountPercent: listTotal > 0.005 ? round2((discountWithTax / listTotal) * 100) : 0,
    discountSource,
    lines: detalle,
  };
};
