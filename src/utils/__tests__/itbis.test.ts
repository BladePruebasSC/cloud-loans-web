// Los precios se muestran SIEMPRE con ITBIS.
//
// CAMBIO SOLICITADO (2026-10-01): "en la parte de punto de venta los precios de venta y costo no
// están mostrándose con impuestos; siempre deben mostrarse con impuestos, tanto en inventario
// como en punto de venta, en la factura, en los reportes, etc."
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITBIS_RATE, inventoryValueWithItbis, itbisOf, itbisRateOf, purchasePriceWithItbis,
  sellingPriceWithItbis, stockValueWithItbis, withItbis, withoutItbis,
} from '../itbis';

// El producto de la captura: HONDA NAVY AZUL 2026
const PRODUCTO = {
  purchase_price: 86500,    // sin ITBIS
  selling_price: 93220.34,  // sin ITBIS
  itbis_rate: 18,
  current_stock: 3,
};

describe('precios con ITBIS', () => {
  it('EL CASO REPORTADO: el producto se enseña a 102,070 de costo y 110,000 de venta', () => {
    expect(purchasePriceWithItbis(PRODUCTO)).toBe(102070);
    expect(sellingPriceWithItbis(PRODUCTO)).toBe(110000);
  });

  it('Ida y vuelta: lo que se guarda sigue siendo el precio sin ITBIS', () => {
    expect(withoutItbis(110000, 18)).toBe(93220.34);
    expect(withItbis(93220.34, 18)).toBe(110000);
    expect(itbisOf(93220.34, 18)).toBe(16779.66);
  });

  it('Sin `itbis_rate` se usa el 18% dominicano', () => {
    expect(itbisRateOf({ itbis_rate: null })).toBe(DEFAULT_ITBIS_RATE);
    expect(itbisRateOf(undefined)).toBe(18);
    expect(itbisRateOf({ itbis_rate: 0 })).toBe(0); // exento: 0 es un valor válido
    expect(sellingPriceWithItbis({ selling_price: 100, itbis_rate: 0 })).toBe(100);
  });

  it('El valor del stock y del inventario también llevan ITBIS', () => {
    expect(stockValueWithItbis(PRODUCTO)).toBe(330000); // 3 × 110,000
    expect(inventoryValueWithItbis([
      PRODUCTO,
      { selling_price: 1000, itbis_rate: 18, current_stock: 2 },
    ])).toBe(332360);
  });

  it('Un producto sin precio no rompe nada', () => {
    expect(sellingPriceWithItbis({})).toBe(0);
    expect(stockValueWithItbis(null)).toBe(0);
    expect(inventoryValueWithItbis([])).toBe(0);
  });
});
