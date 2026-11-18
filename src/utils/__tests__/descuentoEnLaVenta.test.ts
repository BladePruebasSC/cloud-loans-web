// ============================================================================
// EL DESCUENTO DE UNA VENTA LLEGA A LA LÍNEA, A LA FACTURA Y A LOS REPORTES
// ============================================================================
// FALLO REPORTADO (2026-11-18): "realizo una venta a un precio, le agrego descuento, y en la
// factura sale el precio sin descuento y sumándole también ITBIS; eso hace que en los reportes
// todos los productos salgan vendidos al mismo precio".
//
// En el punto de venta el descuento se pone de dos maneras: POR ÍTEM (cada línea con su %) o AL
// TOTAL (un % sobre toda la venta). La segunda no llegaba a las líneas: el carrito dejaba su
// base sin descontar y el descuento se aplicaba solo al sumar. Así:
//   · la FACTURA enseñaba cada producto a su precio de lista, con el ITBIS encima, y ese precio
//     no cuadraba ni con el importe de su propia fila ni con el total de la factura;
//   · y lo que se guardaba de cada línea era ese precio de lista, así que en los reportes todas
//     las ventas de un producto salían al mismo precio.
import { describe, it, expect } from 'vitest';

import { cartLineAmounts } from '../posCartLine';
import { getSaleAmount } from '../portfolioMetrics';

// Un producto de 1,000 + ITBIS: 1,180 por unidad.
const LINEA = { unitPrice: 1180, quantity: 2, itbisRate: 18 };

describe('descuento por ítem', () => {

  it('Baja el precio y, con él, el ITBIS', () => {
    // 10% sobre una base de 2,000 → 1,800 + 324 de ITBIS.
    const linea = cartLineAmounts({ ...LINEA, discountPercent: 10, subtotal: 1800 }, { mode: 'item' });
    expect(linea.listBase).toBe(2000);
    expect(linea.base).toBe(1800);
    expect(linea.tax).toBe(324);
    expect(linea.total).toBe(2124);
    expect(linea.unitCharged).toBe(1062);     // 1,180 − 10%
    expect(linea.discount).toBe(200);
    expect(linea.discountPercent).toBe(10);
  });

  it('Sin descuento, el precio cobrado es el de lista', () => {
    const linea = cartLineAmounts({ ...LINEA, discountPercent: 0, subtotal: 2000 }, { mode: 'item' });
    expect(linea.unitCharged).toBe(1180);
    expect(linea.total).toBe(2360);
    expect(linea.discount).toBe(0);
  });
});

describe('descuento al total', () => {

  it('EL CASO REPORTADO: el descuento al total SÍ llega a la línea', () => {
    // El carrito deja `subtotal` sin descontar cuando el descuento es al total.
    const linea = cartLineAmounts({ ...LINEA, discountPercent: 0, subtotal: 2000 }, {
      mode: 'total', totalPercent: 10,
    });

    expect(linea.base).toBe(1800);            // antes: 2,000
    expect(linea.tax).toBe(324);              // el ITBIS también baja
    expect(linea.total).toBe(2124);           // antes: 2,360 (precio de lista + ITBIS)
    expect(linea.unitCharged).toBe(1062);     // antes: 1,180, igual en todas las ventas
    expect(linea.discountPercent).toBe(10);
  });

  it('El descuento por ítem no se cuenta dos veces', () => {
    // Con el modo "al total", el % de la línea se ignora (es lo que hace la suma de la venta).
    const linea = cartLineAmounts({ ...LINEA, discountPercent: 50, subtotal: 1000 }, {
      mode: 'total', totalPercent: 10,
    });
    expect(linea.base).toBe(1800);
    expect(linea.total).toBe(2124);
  });

  it('Las líneas suman exactamente el total de la venta', () => {
    const carrito = [
      { unitPrice: 1180, quantity: 2, itbisRate: 18, subtotal: 2000, discountPercent: 0 },
      { unitPrice: 590, quantity: 1, itbisRate: 18, subtotal: 500, discountPercent: 0 },
      { unitPrice: 300, quantity: 3, itbisRate: 0, subtotal: 900, discountPercent: 0 }, // exento
    ];
    const descuento = { mode: 'total' as const, totalPercent: 15 };
    const lineas = carrito.map(l => cartLineAmounts(l, descuento));

    const base = Math.round(lineas.reduce((s, l) => s + l.base, 0) * 100) / 100;
    const itbis = Math.round(lineas.reduce((s, l) => s + l.tax, 0) * 100) / 100;
    const total = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;

    // (2,000 + 500 + 900) × 0.85 = 2,890 de base.
    expect(base).toBe(2890);
    // El ITBIS solo de los que lo llevan: (2,000 + 500) × 0.85 × 18%.
    expect(itbis).toBe(382.5);
    expect(total).toBe(3272.5);
  });
});

describe('un producto exento no gana impuesto por el camino', () => {
  it('Sin ITBIS, el precio cobrado es el precio', () => {
    const linea = cartLineAmounts({ unitPrice: 500, quantity: 2, itbisRate: 0, subtotal: 1000 }, { mode: 'item' });
    expect(linea.tax).toBe(0);
    expect(linea.total).toBe(1000);
    expect(linea.unitCharged).toBe(500);
  });
});

describe('lo que llega a los reportes', () => {

  it('La venta se mide por lo COBRADO, no por el precio de lista', () => {
    const linea = cartLineAmounts({ ...LINEA, discountPercent: 0, subtotal: 2000 }, {
      mode: 'total', totalPercent: 10,
    });
    // Así se guarda ahora cada línea del esquema simple.
    const filaDeVenta = {
      quantity: 2,
      unit_price: linea.unitCharged,
      total_price: linea.total,
    };
    expect(getSaleAmount(filaDeVenta)).toBe(2124);

    // Y en el esquema con detalle: unitario × cantidad = el total de la línea.
    expect(Math.round(filaDeVenta.unit_price * filaDeVenta.quantity * 100) / 100).toBe(linea.total);
  });

  it('Una venta del esquema nuevo sigue midiéndose por su total', () => {
    expect(getSaleAmount({ total_amount: 2124, quantity: 2, unit_price: 1180 })).toBe(2124);
  });

  it('Sin unitario se usa lo que haya', () => {
    expect(getSaleAmount({ total_price: 999 })).toBe(999);
    expect(getSaleAmount({})).toBe(0);
  });
});

describe('bordes', () => {
  it('Cantidad 0, precio 0 o descuentos imposibles no rompen nada', () => {
    expect(cartLineAmounts({ unitPrice: 0, quantity: 0, itbisRate: 18 }).total).toBe(0);
    expect(cartLineAmounts({ unitPrice: 100, quantity: 1, itbisRate: 18 }, { mode: 'total', totalPercent: 300 }).total).toBe(0);
    expect(cartLineAmounts({ unitPrice: 100, quantity: 1, itbisRate: 18 }, { mode: 'total', totalPercent: -50 }).unitCharged).toBe(100);
  });

  it('Sin `subtotal` se usa el % de la línea', () => {
    const linea = cartLineAmounts({ unitPrice: 1180, quantity: 1, itbisRate: 18, discountPercent: 25 });
    expect(linea.base).toBe(750);
    expect(linea.total).toBe(885);
  });
});
