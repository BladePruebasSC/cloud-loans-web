// ============================================================================
// EL PRECIO Y EL COSTO, DE LAS DOS FORMAS: CON ITBIS Y SIN ÉL
// ============================================================================
// PEDIDO (2026-11-21): "lo de itbis y sin itbis es solo para precios y costos, lo de descuento,
// subtotal y total, todo lo que no sea precio y costo se queda igual, a lo de costo y precio que
// si salgan con itbis y sin".
//
// Así que aquí se comprueban las dos cosas: que el PRECIO y el COSTO tienen su pareja y que las
// dos formas cuadran al 18% entre sí, y que el descuento, el subtotal, el ITBIS, el total y el
// valor del stock siguen con UNA sola cifra, la de siempre.
import { describe, it, expect } from 'vitest';
import { reportById } from '../reportCatalog';
import type { ReportData } from '../reportDataset';
import type { ReportFilters } from '../reportTypes';

const HOY = '2026-11-21';
const PERIODO: ReportFilters = {
  startDate: '2026-11-01', endDate: HOY, preset: 'month', compare: false,
};

// La motora de siempre: cuesta 86,500 y se vende a 105,000, los dos sin ITBIS.
const venta = (id: string, over: Record<string, unknown> = {}, linea: Record<string, unknown> = {}) => ({
  id,
  sale_date: '2026-11-20',
  created_at: '2026-11-20T12:00:00Z',
  total_amount: null, total_price: null, subtotal: null, tax_amount: null,
  discount_amount: null, payment_method: 'cash', payment_details: null, sale_type: 'cash',
  status: 'completed', customer_name: 'Omar Santana', client_id: 'C1', user_id: 'U1',
  sale_number: null,
  details: [{
    id: `d-${id}`, sale_id: id, product_id: 'P1', product_name: 'HONDA NAVY AZUL 2026',
    quantity: 1, unit_price: 123900, total_price: 105000, itbis_rate: 18,
    list_unit_price: 123900, unit_cost: 86500,
    product_selling_price: 105000, product_purchase_price: 86500,
    ...linea,
  }],
  ...over,
});

const data = (ventas: any[] = [venta('V1'), venta('V2', { id: 'V2' }, { id: 'd-V2' })]): ReportData => ({
  todayIso: HOY,
  loans: [], clients: [], payments: [], installments: [], capitalPayments: [], penalties: [],
  loanHistory: [], tracking: [], sales: [], deletedLoans: [], awaitingApprovalCount: 0,
  overdueByLoan: new Map(), balanceByLoan: new Map(), lateFeeByLoan: new Map(),
  portfolio: {} as any, cashflow: {} as any, recovery: {} as any,
  userNames: new Map([['U1', 'Omar Santana']]),
  salesDetail: { sales: ventas as any },
  inventory: {
    products: [{
      id: 'P1', name: 'HONDA NAVY AZUL 2026', sku: 'H-1', brand: null, category: 'Motores',
      status: 'active', current_stock: 3, min_stock: 1,
      purchase_price: 86500, selling_price: 105000, itbis_rate: 18, created_at: null,
    }],
    availableColumns: [],
  },
});

const run = (id: string, d: ReportData = data(), filters: ReportFilters = PERIODO) => {
  const def = reportById(id);
  if (!def) throw new Error(`No existe el reporte ${id}`);
  return def.build({ data: d, filters, todayIso: d.todayIso });
};

/** Las dos formas de un mismo precio o costo tienen que cuadrar al 18%. */
const cuadra = (sinItbis: unknown, conItbis: unknown) => {
  expect(Math.round(Number(sinItbis) * 1.18 * 100) / 100).toBe(Number(conItbis));
};

/** Las columnas que enseña un reporte, por su clave. */
const claves = (id: string) => (reportById(id)!.columns || []).map(c => c.key);

describe('Ganancia de las ventas', () => {
  it('EL CASO PEDIDO: el costo y el precio salen de las dos formas', () => {
    const fila = run('sales-profit').rows[0];
    expect(fila.costoUnitario).toBe(86500);
    expect(fila.costoUnitarioConItbis).toBe(102070);
    expect(fila.precioUnitario).toBe(105000);
    expect(fila.precioUnitarioConItbis).toBe(123900);
    expect(fila.costo).toBe(173000);
    expect(fila.costoConItbis).toBe(204140);      // 86,500 × 1.18 × 2
    cuadra(fila.costoUnitario, fila.costoUnitarioConItbis);
    cuadra(fila.precioUnitario, fila.precioUnitarioConItbis);
    cuadra(fila.costo, fila.costoConItbis);
  });

  it('Lo VENDIDO no se dobla: no es precio ni costo', () => {
    const fila = run('sales-profit').rows[0];
    expect(fila.venta).toBe(210000);
    expect(fila.ventaConItbis).toBeUndefined();
    expect(claves('sales-profit')).not.toContain('ventaConItbis');
    // Y el indicador de arriba tampoco enseña la otra forma de lo vendido.
    const kpi = (k: string) => (run('sales-profit').kpis || []).find(x => x.key === k);
    expect(kpi('venta')?.hint).toBeUndefined();
    expect(kpi('costo')?.hint).toContain('204,140');
  });

  it('La ganancia y el margen se miden SIN ITBIS', () => {
    // El impuesto que se cobra no es del negocio, y el que se paga al suplidor se descuenta de
    // él: una "ganancia con ITBIS" sería un número que no significa nada.
    const fila = run('sales-profit').rows[0];
    expect(fila.ganancia).toBe(37000);            // 210,000 − 173,000
    expect(fila.margen).toBe(17.62);
    expect(claves('sales-profit')).not.toContain('gananciaConItbis');
  });
});

describe('Ganancia por venta', () => {
  it('El costo de las dos formas; lo vendido y el ITBIS, como siempre', () => {
    const fila = run('sales-profit-by-sale').rows[0];
    expect(fila.venta).toBe(105000);
    expect(fila.costo).toBe(86500);
    expect(fila.costoConItbis).toBe(102070);
    expect(fila.ganancia).toBe(18500);
    expect(fila.ventaConItbis).toBeUndefined();
    expect(fila.itbis).toBeUndefined();
  });
});

describe('Ventas del período', () => {
  it('El precio de lista de las dos formas; el descuento, el subtotal y el total, no', () => {
    const rebajada = venta('V3', { id: 'V3' }, {
      id: 'd-V3', unit_price: 111510, total_price: 94500,
    });
    const fila = run('sales-detail', data([rebajada])).rows[0];
    expect(fila.precioLista).toBe(105000);
    expect(fila.precioListaConItbis).toBe(123900);
    cuadra(fila.precioLista, fila.precioListaConItbis);
    // El descuento se queda con su única cifra, la de siempre: sin ITBIS.
    expect(fila.descuento).toBe(10500);
    expect(fila.descuentoConItbis).toBeUndefined();
    expect(claves('sales-detail')).not.toContain('descuentoConItbis');
    // Y la fila sigue cuadrando por dentro.
    expect(fila.subtotal).toBe(94500);
    expect(Number(fila.subtotal) + Number(fila.itbis)).toBe(Number(fila.total));
  });
});

describe('Productos vendidos', () => {
  it('Los dos precios por unidad tienen pareja; el importe y el descuento no', () => {
    const fila = run('sales-by-product').rows[0];
    expect(fila.precioListaSinItbis).toBe(105000);
    expect(fila.precioLista).toBe(123900);
    expect(fila.precioPromedioSinItbis).toBe(105000);
    expect(fila.precioPromedio).toBe(123900);
    expect(fila.importe).toBe(247800);
    expect(fila.importeSinItbis).toBeUndefined();
    expect(fila.descuentoSinItbis).toBeUndefined();
    expect(claves('sales-by-product')).not.toContain('itbis');
  });
});

describe('Descuentos aplicados', () => {
  it('El precio de lista y lo cobrado, de las dos formas; lo descontado, como siempre', () => {
    const rebajada = venta('V4', { id: 'V4' }, {
      id: 'd-V4', unit_price: 111510, total_price: 94500,
    });
    const fila = run('sales-discounts', data([rebajada])).rows[0];
    expect(fila.precioListaSinItbis).toBe(105000);
    expect(fila.precioLista).toBe(123900);
    expect(fila.precioCobradoSinItbis).toBe(94500);
    expect(fila.precioCobrado).toBe(111510);
    expect(fila.descuento).toBe(12390);           // el descontado con ITBIS, el de siempre
    expect(fila.descuentoSinItbis).toBeUndefined();
    expect(fila.importeSinItbis).toBeUndefined();
  });
});

describe('Ventas por día, por cliente, por usuario y por forma de pago', () => {
  it('El total se queda con una sola cifra: no es precio ni costo', () => {
    for (const id of ['sales-by-day', 'sales-by-client', 'sales-by-user', 'sales-by-payment']) {
      const fila = run(id).rows[0];
      expect(fila.total, id).toBe(247800);
      expect(fila.totalSinItbis, id).toBeUndefined();
      expect(claves(id), id).not.toContain('totalSinItbis');
      expect(claves(id), id).not.toContain('itbis');
    }
  });
});

describe('Inventario', () => {
  it('El costo y el precio por unidad, de las dos formas', () => {
    const fila = run('inventory-current').rows[0];
    expect(fila.costoSinItbis).toBe(86500);
    expect(fila.costo).toBe(102070);
    expect(fila.precioSinItbis).toBe(105000);
    expect(fila.precio).toBe(123900);
    cuadra(fila.costoSinItbis, fila.costo);
    cuadra(fila.precioSinItbis, fila.precio);
  });

  it('El valor del stock no se dobla: se queda con ITBIS, como siempre', () => {
    const fila = run('inventory-current').rows[0];
    expect(fila.valorCosto).toBe(306210);         // 3 × 102,070
    expect(fila.valor).toBe(371700);              // 3 × 123,900
    expect(fila.valorCostoSinItbis).toBeUndefined();
    expect(fila.valorSinItbis).toBeUndefined();
    const porCategoria = run('inventory-by-category').rows[0];
    expect(porCategoria.valor).toBe(371700);
    expect(porCategoria.valorSinItbis).toBeUndefined();
  });

  it('El costo de reposición del stock bajo también va de las dos formas', () => {
    const d = data();
    d.inventory!.products[0].current_stock = 0;
    d.inventory!.products[0].min_stock = 2;
    const fila = run('inventory-low', d).rows[0];
    expect(fila.faltante).toBe(2);
    expect(fila.costoSinItbis).toBe(86500);
    expect(fila.costo).toBe(102070);
    expect(fila.reposicionSinItbis).toBe(173000); // 2 × 86,500
    expect(fila.reposicion).toBe(204140);
  });
});

describe('La advertencia', () => {
  it('Lo explican los reportes que de verdad enseñan las dos formas', () => {
    const conNota = [
      'sales-detail', 'sales-by-product', 'sales-discounts', 'sales-profit',
      'sales-profit-by-sale', 'inventory-current', 'inventory-low',
    ];
    for (const id of conNota) {
      const notes = run(id).notes || [];
      expect(notes.some(n => n.includes('DOS formas')), id).toBe(true);
    }
  });

  it('Y no la repiten los que se quedaron con una sola cifra', () => {
    const sinNota = [
      'sales-by-payment', 'sales-by-day', 'sales-by-client', 'sales-by-user',
      'inventory-by-category',
    ];
    for (const id of sinNota) {
      const notes = run(id).notes || [];
      expect(notes.some(n => n.includes('DOS formas')), id).toBe(false);
    }
  });
});
