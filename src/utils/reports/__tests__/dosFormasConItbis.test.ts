// ============================================================================
// TODO IMPORTE, DE LAS DOS FORMAS: CON ITBIS Y SIN ÉL
// ============================================================================
// PEDIDO (2026-11-21): "en los reportes necesito que aparezcan siempre tanto con impuestos como
// sin impuestos, o sea de las dos formas".
//
// Antes cada reporte elegía una y había que hacer la cuenta a mano para comparar dos reportes
// entre sí: "Ganancia de las ventas" iba todo sin ITBIS, "Productos vendidos" todo con ITBIS, y
// el inventario con ITBIS. Aquí se comprueba que cada importe tiene su pareja y que las dos
// formas cuadran entre sí: sin ITBIS + impuesto = con ITBIS.
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

/** Las dos formas de un mismo importe tienen que cuadrar al 18%. */
const cuadra = (sinItbis: unknown, conItbis: unknown) => {
  expect(Math.round(Number(sinItbis) * 1.18 * 100) / 100).toBe(Number(conItbis));
};

describe('Ganancia de las ventas', () => {
  it('EL CASO PEDIDO: lo vendido y el costo salen de las dos formas', () => {
    const fila = run('sales-profit').rows[0];
    expect(fila.venta).toBe(210000);          // sin ITBIS
    expect(fila.ventaConItbis).toBe(247800);  // con ITBIS
    expect(fila.costo).toBe(173000);
    expect(fila.costoConItbis).toBe(204140);  // 86,500 × 1.18 × 2
    cuadra(fila.venta, fila.ventaConItbis);
    cuadra(fila.costo, fila.costoConItbis);
  });

  it('También el precio y el costo por unidad', () => {
    const fila = run('sales-profit').rows[0];
    expect(fila.costoUnitario).toBe(86500);
    expect(fila.costoUnitarioConItbis).toBe(102070);
    expect(fila.precioUnitario).toBe(105000);
    expect(fila.precioUnitarioConItbis).toBe(123900);
  });

  it('La ganancia y el margen siguen midiéndose SIN ITBIS', () => {
    // El impuesto que se cobra no es del negocio, y el que se paga al suplidor se descuenta de
    // él: una "ganancia con ITBIS" sería un número que no significa nada.
    const fila = run('sales-profit').rows[0];
    expect(fila.ganancia).toBe(37000);        // 210,000 − 173,000
    expect(fila.margen).toBe(17.62);
    const kpi = (k: string) => (run('sales-profit').kpis || []).find(x => x.key === k);
    expect(kpi('venta')?.hint).toContain('247,800');
    expect(kpi('costo')?.hint).toContain('204,140');
  });
});

describe('Ventas del período', () => {
  it('El precio de lista y el descuento salen de las dos formas', () => {
    const rebajada = venta('V3', { id: 'V3' }, {
      id: 'd-V3', unit_price: 111510, total_price: 94500,
    });
    const fila = run('sales-detail', data([rebajada])).rows[0];
    expect(fila.precioLista).toBe(105000);
    expect(fila.precioListaConItbis).toBe(123900);
    expect(fila.descuento).toBe(10500);
    expect(fila.descuentoConItbis).toBe(12390);
    cuadra(fila.descuento, fila.descuentoConItbis);
    // Y la fila sigue cuadrando por dentro.
    expect(Number(fila.subtotal) + Number(fila.itbis)).toBe(Number(fila.total));
  });
});

describe('Productos vendidos', () => {
  it('Importe, precio y descuento, cada uno con su pareja', () => {
    const fila = run('sales-by-product').rows[0];
    expect(fila.importeSinItbis).toBe(210000);
    expect(fila.importe).toBe(247800);
    expect(Number(fila.importeSinItbis) + Number(fila.itbis)).toBe(Number(fila.importe));
    expect(fila.precioListaSinItbis).toBe(105000);
    expect(fila.precioLista).toBe(123900);
    expect(fila.precioPromedioSinItbis).toBe(105000);
    expect(fila.precioPromedio).toBe(123900);
  });
});

describe('Ventas por día, por cliente, por usuario y por forma de pago', () => {
  it('Todas enseñan el total de las dos formas, y el ITBIS en medio', () => {
    for (const id of ['sales-by-day', 'sales-by-client', 'sales-by-user', 'sales-by-payment']) {
      const fila = run(id).rows[0];
      expect(fila.totalSinItbis, id).toBe(210000);
      expect(fila.itbis, id).toBe(37800);
      expect(fila.total, id).toBe(247800);
      expect(Number(fila.totalSinItbis) + Number(fila.itbis), id).toBe(Number(fila.total));
    }
  });
});

describe('Inventario', () => {
  it('El costo, el precio y el valor del stock, de las dos formas', () => {
    const fila = run('inventory-current').rows[0];
    expect(fila.costoSinItbis).toBe(86500);
    expect(fila.costo).toBe(102070);
    expect(fila.precioSinItbis).toBe(105000);
    expect(fila.precio).toBe(123900);
    expect(fila.valorCostoSinItbis).toBe(259500);   // 3 × 86,500
    expect(fila.valorCosto).toBe(306210);
    expect(fila.valorSinItbis).toBe(315000);        // 3 × 105,000
    expect(fila.valor).toBe(371700);
    cuadra(fila.valorCostoSinItbis, fila.valorCosto);
    cuadra(fila.valorSinItbis, fila.valor);
  });

  it('El valor por categoría también', () => {
    const fila = run('inventory-by-category').rows[0];
    expect(fila.valorSinItbis).toBe(315000);
    expect(fila.valor).toBe(371700);
  });

  it('Y el costo de reposición del stock bajo', () => {
    const d = data();
    d.inventory!.products[0].current_stock = 0;
    d.inventory!.products[0].min_stock = 2;
    const fila = run('inventory-low', d).rows[0];
    expect(fila.faltante).toBe(2);
    expect(fila.reposicionSinItbis).toBe(173000);   // 2 × 86,500
    expect(fila.reposicion).toBe(204140);
  });
});

describe('La advertencia', () => {
  it('Cada reporte de ventas e inventario explica las dos formas', () => {
    const conNota = [
      'sales-detail', 'sales-by-product', 'sales-discounts', 'sales-by-payment',
      'sales-profit', 'sales-profit-by-sale', 'sales-by-day', 'sales-by-client',
      'sales-by-user', 'inventory-current', 'inventory-low', 'inventory-by-category',
    ];
    for (const id of conNota) {
      const notes = run(id).notes || [];
      expect(notes.some(n => n.includes('DOS formas')), id).toBe(true);
    }
  });
});
