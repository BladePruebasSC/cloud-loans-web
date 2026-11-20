// ============================================================================
// LA GANANCIA DE UNA VENTA: LO COBRADO MENOS LO QUE COSTÓ
// ============================================================================
// PEDIDO (2026-11-20): "a los reportes necesito que le agregues un reporte que controle el costo
// y lo que se vendió, o sea que me dé la ganancia de las ventas; no hay ningún reporte que hable
// de ganancias como tal".
//
// Dos reglas que es fácil equivocar y que aquí quedan fijadas:
//
//  1. El ITBIS NO es ingreso: se cobra para la DGII. La ganancia se mide sobre la base, sin
//     impuesto, contra un costo que también va sin impuesto.
//  2. Una línea SIN costo no es una línea que se ganó entera: su ganancia no se sabe, y no se
//     cuenta ni en la ganancia ni en el margen.
import { describe, it, expect } from 'vitest';
import { saleAmounts, saleLineAmounts } from '../saleAmounts';

// La motora de las capturas: cuesta 86,500 (sin ITBIS) y se vende a 105,000 (sin ITBIS),
// 123,900 con el impuesto.
const linea = (over: Record<string, unknown> = {}) => ({
  quantity: 1,
  unit_price: 123900,
  total_price: 105000,
  itbis_rate: 18,
  list_unit_price: 123900,
  unit_cost: 86500,
  ...over,
});

describe('la ganancia de una línea', () => {
  it('EL CASO PEDIDO: se vendió a 123,900, costó 86,500 y deja 18,500', () => {
    const l = saleLineAmounts(linea());
    expect(l.total).toBe(123900);   // lo que pagó el cliente
    expect(l.base).toBe(105000);    // sin ITBIS
    expect(l.tax).toBe(18900);
    expect(l.cost).toBe(86500);
    expect(l.profit).toBe(18500);   // 105,000 − 86,500
    expect(l.margin).toBe(17.62);   // sobre lo vendido
    expect(l.costSource).toBe('guardado');
  });

  it('El ITBIS no se cuenta como ganancia', () => {
    // Si el impuesto contara, la ganancia parecería 37,400 en vez de 18,500.
    const l = saleLineAmounts(linea());
    expect(l.profit).toBe(round2(l.base - l.cost));
    expect(l.profit).not.toBe(round2(l.total - l.cost));
  });

  it('Un descuento se come la ganancia, no el costo', () => {
    // La misma motora con 10% de descuento: 111,510 con ITBIS = 94,500 de base.
    const l = saleLineAmounts(linea({ unit_price: 111510, total_price: 94500 }));
    expect(l.discount).toBe(10500);
    expect(l.cost).toBe(86500);
    expect(l.profit).toBe(8000);    // 94,500 − 86,500
    expect(l.margin).toBe(8.47);
  });

  it('Varias unidades: el costo se multiplica', () => {
    const l = saleLineAmounts(linea({ quantity: 3, unit_price: 123900, total_price: 315000 }));
    expect(l.cost).toBe(259500);    // 3 × 86,500
    expect(l.profit).toBe(55500);
  });

  it('Una venta vieja toma el costo del producto, y lo dice', () => {
    const l = saleLineAmounts(linea({
      unit_cost: null,
      product: { selling_price: 105000, purchase_price: 86500, itbis_rate: 18 },
    }));
    expect(l.cost).toBe(86500);
    expect(l.profit).toBe(18500);
    expect(l.costSource).toBe('deducido');
  });

  it('Sin costo NO se gana el 100%: la ganancia no se sabe', () => {
    const l = saleLineAmounts(linea({ unit_cost: null }));
    expect(l.costSource).toBe('ninguno');
    expect(l.cost).toBe(0);
    expect(l.profit).toBe(0);       // no 105,000
    expect(l.margin).toBe(0);
  });

  it('Vender por debajo del costo da ganancia NEGATIVA, no cero', () => {
    const l = saleLineAmounts(linea({ unit_price: 94400, total_price: 80000 }));
    expect(l.profit).toBe(-6500);   // 80,000 − 86,500
    expect(l.margin).toBe(-8.12);   // −6,500 ÷ 80,000
  });

  it('Un producto exento se mide igual', () => {
    const l = saleLineAmounts({
      quantity: 2, unit_price: 500, total_price: 1000, itbis_rate: 0, unit_cost: 300,
    });
    expect(l.tax).toBe(0);
    expect(l.cost).toBe(600);
    expect(l.profit).toBe(400);
    expect(l.margin).toBe(40);
  });
});

describe('la ganancia de una venta entera', () => {
  it('Suma las líneas', () => {
    const v = saleAmounts([
      linea(),
      { quantity: 2, unit_price: 1180, total_price: 2000, itbis_rate: 18, unit_cost: 600 },
    ]);
    expect(v.base).toBe(107000);    // 105,000 + 2,000
    expect(v.cost).toBe(87700);     // 86,500 + 1,200
    expect(v.profit).toBe(19300);
    expect(v.margin).toBe(18.04);
    expect(v.linesWithoutCost).toBe(0);
  });

  it('Las líneas sin costo quedan fuera de la cuenta, y se dicen', () => {
    const v = saleAmounts([
      linea(),
      { quantity: 1, unit_price: 1180, total_price: 1000, itbis_rate: 18 },  // sin costo
    ]);
    expect(v.base).toBe(106000);          // la venta entera sigue siendo la venta entera
    expect(v.cost).toBe(86500);
    expect(v.profit).toBe(18500);         // solo la línea con costo
    expect(v.linesWithoutCost).toBe(1);
    expect(v.costSource).toBe('guardado');
  });

  it('Si ninguna línea tiene costo, la ganancia no se sabe', () => {
    const v = saleAmounts([linea({ unit_cost: null })]);
    expect(v.costSource).toBe('ninguno');
    expect(v.profit).toBe(0);
    expect(v.linesWithoutCost).toBe(1);
  });

  it('Una venta vacía no rompe nada', () => {
    const v = saleAmounts([]);
    expect(v.cost).toBe(0);
    expect(v.profit).toBe(0);
    expect(v.margin).toBe(0);
  });
});

const round2 = (v: number) => Math.round(v * 100) / 100;
