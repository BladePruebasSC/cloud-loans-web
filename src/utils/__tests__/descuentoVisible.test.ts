// ============================================================================
// EL DESCUENTO SE PUEDE VER DESPUÉS DE LA VENTA
// ============================================================================
// FALLO REPORTADO (2026-11-18): "en las facturas no se ve el descuento, tampoco en los
// reportes... Mira la segunda imagen: muchas de esas ventas fue con descuento pero no hay forma
// de saberlo porque no lo indica".
//
// El descuento sí llegaba al precio —lo que se cobra y lo que se guarda ya está rebajado—, pero
// la venta guardada no decía DE QUÉ precio se partió: una venta de 123,900 con un 10% quedaba
// como una venta de 111,510 a secas, idéntica a una hecha a ese precio.
//
// `saleAmounts` reconstruye la venta comparando lo cobrado con el precio de LISTA: el que la
// venta guardó (`list_unit_price`) o, en las viejas, el precio de venta de hoy del producto.
import { describe, it, expect } from 'vitest';
import { saleAmounts, saleLineAmounts } from '../saleAmounts';

// Los dos casos de las capturas. HONDA NAVY AZUL 2026: 105,000 sin ITBIS = 123,900 con ITBIS.
const LISTA = 123900;
const CON_5 = 117705;   // 123,900 − 5%
const CON_10 = 111510;  // 123,900 − 10%

const linea = (over: Record<string, unknown> = {}) => ({
  quantity: 1,
  unit_price: CON_10,
  total_price: 94500,     // la base, sin ITBIS (como lo guarda `sale_details`)
  itbis_rate: 18,
  list_unit_price: LISTA,
  ...over,
});

describe('el descuento de una línea de venta', () => {
  it('EL CASO REPORTADO: la venta rebajada dice de qué precio se partió', () => {
    const l = saleLineAmounts(linea());
    expect(l.unitList).toBe(LISTA);
    expect(l.unitCharged).toBe(CON_10);
    expect(l.discountPercent).toBe(10);
    expect(l.discountWithTax).toBe(12390);  // lo que el cliente se ahorró
    expect(l.discount).toBe(10500);         // lo mismo sin ITBIS, cuadra con el subtotal
    expect(l.discountSource).toBe('guardado');
  });

  it('La factura cuadra: lista − descuento = subtotal, y subtotal + ITBIS = total', () => {
    const l = saleLineAmounts(linea());
    expect(l.listBase).toBe(105000);
    expect(l.listBase - l.discount).toBe(l.base);
    expect(l.base).toBe(94500);
    expect(l.tax).toBe(17010);
    expect(l.base + l.tax).toBe(l.total);
    expect(l.total).toBe(CON_10);
  });

  it('El 5% de la otra venta sale igual de bien', () => {
    const l = saleLineAmounts(linea({ unit_price: CON_5, total_price: 99750 }));
    expect(l.discountPercent).toBe(5);
    expect(l.discountWithTax).toBe(6195);
    expect(l.total).toBe(CON_5);
  });

  it('Una venta VIEJA deduce el precio de lista del producto, y lo dice', () => {
    const l = saleLineAmounts(linea({
      list_unit_price: null,
      product: { selling_price: 105000, itbis_rate: 18 },  // el producto guarda el precio SIN ITBIS
    }));
    expect(l.unitList).toBe(LISTA);
    expect(l.discountPercent).toBe(10);
    expect(l.discountSource).toBe('deducido');
  });

  it('Sin precio de lista ni producto, no se inventa un descuento', () => {
    const l = saleLineAmounts(linea({ list_unit_price: null }));
    expect(l.unitList).toBe(CON_10);
    expect(l.discount).toBe(0);
    expect(l.discountSource).toBe('ninguno');
  });

  it('Si al producto le BAJARON el precio después, no sale un descuento al revés', () => {
    // Se vendió a 123,900 y hoy el producto vale 100,000 con ITBIS: no se descontó nada.
    const l = saleLineAmounts(linea({
      unit_price: LISTA, total_price: 105000, list_unit_price: null,
      product: { selling_price: 84745.76, itbis_rate: 18 },
    }));
    expect(l.discount).toBe(0);
    expect(l.unitList).toBe(LISTA);
  });

  it('Si le SUBIERON el precio, lo deducido se pasa: por eso se marca como deducido', () => {
    // Límite conocido: sin precio de lista guardado, la referencia es el precio de HOY. Se
    // vendió a 123,900 y hoy el producto vale 177,000 con ITBIS, así que parece un 30% de
    // descuento que nunca se hizo. El reporte lo enseña como "Deducido" y lo advierte al pie;
    // en cuanto la venta guarda su precio de lista (desde el 18/11/2026) esto no puede pasar.
    const l = saleLineAmounts(linea({
      unit_price: LISTA, total_price: 105000, list_unit_price: null,
      product: { selling_price: 150000, itbis_rate: 18 },
    }));
    expect(l.discountSource).toBe('deducido');
    expect(l.unitList).toBe(177000);
    // Guardado el precio de lista, la misma venta dice la verdad.
    expect(saleLineAmounts(linea({ unit_price: LISTA, total_price: 105000 })).discount).toBe(0);
  });

  it('Una venta a precio entero no sale con "descuento" por el redondeo del ITBIS', () => {
    const l = saleLineAmounts(linea({ unit_price: LISTA, total_price: 105000 }));
    expect(l.discount).toBe(0);
    expect(l.discountPercent).toBe(0);
    expect(l.total).toBe(LISTA);
  });

  it('Un producto EXENTO se rebaja sin ganar impuesto por el camino', () => {
    const l = saleLineAmounts({
      quantity: 2, unit_price: 900, total_price: 1800, itbis_rate: 0, list_unit_price: 1000,
    });
    expect(l.total).toBe(1800);
    expect(l.tax).toBe(0);
    expect(l.discount).toBe(200);
    expect(l.discountWithTax).toBe(200);
    expect(l.discountPercent).toBe(10);
  });

  it('El esquema simple: `total_price` viene CON ITBIS y no se grava dos veces', () => {
    const l = saleLineAmounts(
      { quantity: 1, unit_price: 0, total_price: CON_5, itbis_rate: 18, list_unit_price: LISTA },
      { totalPriceHasItbis: true },
    );
    expect(l.total).toBe(CON_5);       // antes: 138,891.90
    expect(l.base).toBe(99750);
    expect(l.discountPercent).toBe(5);
  });

  it('Una línea vacía no rompe nada', () => {
    const l = saleLineAmounts(null);
    expect(l.total).toBe(0);
    expect(l.discount).toBe(0);
    expect(l.discountPercent).toBe(0);
  });
});

describe('el descuento de una venta entera', () => {
  it('Suma las líneas y el total cuadra con el de la factura', () => {
    const v = saleAmounts([
      linea(),                                                   // 111,510 (−10%)
      { quantity: 2, unit_price: 590, total_price: 1000, itbis_rate: 18, list_unit_price: 1180 },
    ]);
    expect(v.items).toBe(3);
    expect(v.total).toBe(112690);        // 111,510 + 1,180
    expect(v.listTotal).toBe(126260);    // 123,900 + 2,360
    expect(v.discountWithTax).toBe(13570);
    expect(v.listBase - v.discount).toBe(v.base);
    expect(v.base + v.tax).toBe(v.total);
  });

  it('Con una sola línea deducida, la venta entera se marca como deducida', () => {
    const v = saleAmounts([
      linea(),
      linea({ list_unit_price: null, product: { selling_price: 105000, itbis_rate: 18 } }),
    ]);
    expect(v.discountSource).toBe('deducido');
  });

  it('Una venta sin descuento no lo marca', () => {
    const v = saleAmounts([linea({ unit_price: LISTA, total_price: 105000 })]);
    expect(v.discount).toBe(0);
    expect(v.discountSource).toBe('ninguno');
  });

  it('Una venta sin líneas no rompe nada', () => {
    const v = saleAmounts([]);
    expect(v.total).toBe(0);
    expect(v.lines).toHaveLength(0);
  });
});
