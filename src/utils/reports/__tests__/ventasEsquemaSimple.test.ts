// ============================================================================
// VENTAS GUARDADAS SIN `sale_details` (el "esquema simple")
// ============================================================================
// FALLO REPORTADO (2026-11-17): "los reportes en la parte de inventario siguen mal: el monto sale
// en el subtotal pero no sale nada en ITBIS ni en descuento, tampoco actualizó los viejos, solo
// los nuevos; en productos vendidos no sale nada".
//
// POR QUÉ: hay bases donde una venta NO tiene filas en `sale_details`: cada fila de `sales` ES
// una línea de venta (product_id, quantity, unit_price, total_price). Todos los reportes de
// ventas leen el DETALLE, así que en esas bases "Productos vendidos" salía vacío, la columna
// "Artículos" en 0 y el ITBIS en 0 —y el total salía del `total_price`, que en las ventas VIEJAS
// se guardaba SIN ITBIS—.
//
// AHORA el detalle se arma con lo que trae la propia fila (`useReportsData`), y de ahí salen:
//   · el importe con ITBIS, que se toma de `unit_price × cantidad` —el unitario SIEMPRE se ha
//     guardado con impuesto—, así que las ventas viejas también salen por lo que se cobró;
//   · el ITBIS, deducido con la tasa de cada producto cuando la base no lo guarda;
//   · y las unidades, para "Productos vendidos".
import { describe, it, expect } from 'vitest';

import { saleTaxAmount, saleTotalWithTax } from '../builders/operationReports';

/** Una venta del esquema simple, tal como la arma ahora `useReportsData`. */
const ventaSimple = (over: Record<string, unknown> = {}) => ({
  id: 'V1',
  total_amount: null,
  total_price: 99750,        // VIEJA: se guardaba sin ITBIS
  subtotal: null,
  tax_amount: null,
  discount_amount: null,
  details: [{
    id: 'simple-V1',
    sale_id: 'V1',
    product_id: 'P1',
    product_name: 'Honda Navy',
    quantity: 1,
    unit_price: 117705,      // el unitario SIEMPRE lleva ITBIS
    total_price: 99750,
    itbis_rate: 18,
  }],
  ...over,
});

describe('ventas sin detalle guardado', () => {

  it('El caso reportado: la venta vieja sale por lo que se cobró, no por la base sin ITBIS', () => {
    const venta = ventaSimple();
    expect(saleTotalWithTax(venta)).toBe(117705);   // antes: 99,750
  });

  it('Y el ITBIS se deduce en vez de salir en cero', () => {
    const venta = ventaSimple();
    const itbis = saleTaxAmount(venta);
    // 117,705 ÷ 1.18 = 99,750 de base; el resto es el impuesto.
    expect(itbis).toBe(17955);
    expect(Math.round((saleTotalWithTax(venta) - itbis) * 100) / 100).toBe(99750);
  });

  it('Un producto EXENTO no inventa impuesto', () => {
    const venta = ventaSimple({
      details: [{ ...ventaSimple().details[0], itbis_rate: 0, unit_price: 1000, total_price: 1000 }],
    });
    expect(saleTotalWithTax(venta)).toBe(1000);
    expect(saleTaxAmount(venta)).toBe(0);
  });

  it('Si la base SÍ guarda el ITBIS, manda el guardado', () => {
    const venta = ventaSimple({ tax_amount: 1234.56 });
    expect(saleTaxAmount(venta)).toBe(1234.56);
  });

  it('Varias unidades: el importe es unitario × cantidad', () => {
    const venta = ventaSimple({
      details: [{ ...ventaSimple().details[0], quantity: 3, unit_price: 1180, total_price: 3000 }],
    });
    expect(saleTotalWithTax(venta)).toBe(3540);
    expect(saleTaxAmount(venta)).toBe(540);
  });

  it('Con el esquema nuevo (varias líneas) sigue sumando igual', () => {
    const venta = {
      id: 'V2', total_amount: 2360, subtotal: 2000, tax_amount: 360, total_price: null,
      details: [
        { id: 'd1', quantity: 1, unit_price: 1180, total_price: 1000, itbis_rate: 18 },
        { id: 'd2', quantity: 1, unit_price: 1180, total_price: 1000, itbis_rate: 18 },
      ],
    };
    expect(saleTotalWithTax(venta)).toBe(2360);
    expect(saleTaxAmount(venta)).toBe(360);   // el guardado
  });

  it('Sin líneas ni ITBIS guardado, se deduce con la tasa dominicana', () => {
    const venta = { id: 'V3', total_amount: 1180, details: [] as any[] };
    expect(saleTotalWithTax(venta)).toBe(1180);
    expect(saleTaxAmount(venta)).toBe(180);
  });

  it('Una venta vacía no rompe nada', () => {
    expect(saleTotalWithTax({})).toBe(0);
    expect(saleTaxAmount({})).toBe(0);
  });
});
