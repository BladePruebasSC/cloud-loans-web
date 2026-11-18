// ============================================================================
// LOS REPORTES DE VENTAS DICEN QUÉ PASÓ EN CADA VENTA
// ============================================================================
// FALLO REPORTADO (2026-11-18): "en los reportes... muchas de esas ventas fue con descuento pero
// no hay forma de saberlo porque no lo indica. Debes mejorar todos los reportes que indiquen
// cada caso en cada venta o financiamiento, como los métodos de pago, cuánto cuesta el producto
// pero con descuento fue tanto".
//
// La columna "Descuento" del reporte leía `sales.discount_amount`, una columna que el esquema de
// esta base no tiene: salía RD$0.00 en todas las ventas, también en las rebajadas. Ahora el
// descuento se reconstruye comparando lo cobrado con el precio de lista, y hay reportes que lo
// dicen renglón por renglón.
import { describe, it, expect } from 'vitest';
import { reportById } from '../reportCatalog';
import type { ReportData } from '../reportDataset';
import type { ReportFilters } from '../reportTypes';

const HOY = '2026-11-18';
const PERIODO: ReportFilters = {
  startDate: '2026-11-01', endDate: HOY, preset: 'month', compare: false,
};

// Las ventas de la captura: dos con descuento (5% y 10%) y una a precio entero.
// HONDA NAVY AZUL 2026 — 105,000 sin ITBIS = 123,900 con ITBIS.
const venta = (id: string, over: Record<string, unknown> = {}, linea: Record<string, unknown> = {}) => ({
  id,
  sale_date: '2026-11-18',
  created_at: '2026-11-18T12:04:00Z',
  total_amount: null,
  total_price: null,
  subtotal: null,
  tax_amount: null,
  discount_amount: null,
  payment_method: 'cash',
  payment_details: null,
  sale_type: 'cash',
  status: 'completed',
  customer_name: 'Rosalynn Ceballos',
  client_id: null,
  user_id: 'U1',
  sale_number: null,
  details: [{
    id: `d-${id}`,
    sale_id: id,
    product_id: 'P1',
    product_name: 'HONDA NAVY AZUL 2026',
    quantity: 1,
    unit_price: 111510,
    total_price: 94500,
    itbis_rate: 18,
    list_unit_price: 123900,
    product_selling_price: 105000,
    ...linea,
  }],
  ...over,
});

const data = (): ReportData => ({
  todayIso: HOY,
  loans: [{
    id: 'L1', client_id: 'C1', amount: 80000, remaining_balance: 92000, monthly_payment: 7666.67,
    total_amount: 92000, status: 'active', start_date: '2026-11-18', next_payment_date: '2026-12-18',
    interest_rate: 1.25, term_months: 12, payment_frequency: 'monthly', created_at: '2026-11-18',
    purpose: 'Financiamiento de venta POS - HONDA NAVY AZUL 2026',
    client: { full_name: 'Omar Santana' },
  }] as any,
  clients: [{ id: 'C1', full_name: 'Omar Santana' }] as any,
  payments: [], installments: [], capitalPayments: [], penalties: [], loanHistory: [],
  tracking: [], sales: [], deletedLoans: [], awaitingApprovalCount: 0,
  overdueByLoan: new Map(), balanceByLoan: new Map([['L1', 92000]]), lateFeeByLoan: new Map(),
  portfolio: {} as any, cashflow: {} as any, recovery: {} as any,
  userNames: new Map([['U1', 'Omar Santana']]),
  salesDetail: {
    sales: [
      venta('V10'),                                                        // −10%
      venta('V5', { id: 'V5', payment_method: 'card' }, { id: 'd-V5', unit_price: 117705, total_price: 99750 }), // −5%
      venta('VE', { id: 'VE' }, { id: 'd-VE', unit_price: 123900, total_price: 105000 }),                        // entera
    ] as any,
  },
});

const run = (id: string, d: ReportData = data(), filters: ReportFilters = PERIODO) => {
  const def = reportById(id);
  if (!def) throw new Error(`No existe el reporte ${id}`);
  return def.build({ data: d, filters, todayIso: d.todayIso });
};

describe('Ventas del período', () => {
  it('EL CASO REPORTADO: la columna "Descuento" deja de salir en cero', () => {
    const res = run('sales-detail');
    const v10 = res.rows.find(r => r._id === 'V10')!;
    expect(v10.precioLista).toBe(105000);
    expect(v10.descuento).toBe(10500);
    expect(v10.descuentoPct).toBe(10);
    expect(v10.subtotal).toBe(94500);
    expect(v10.itbis).toBe(17010);
    expect(v10.total).toBe(111510);
  });

  it('Cada fila cuadra: lista − descuento = subtotal, y subtotal + ITBIS = total', () => {
    for (const r of run('sales-detail').rows) {
      expect(Number(r.precioLista) - Number(r.descuento)).toBe(Number(r.subtotal));
      expect(Number(r.subtotal) + Number(r.itbis)).toBe(Number(r.total));
    }
  });

  it('La venta a precio entero no inventa descuento', () => {
    const entera = run('sales-detail').rows.find(r => r._id === 'VE')!;
    expect(entera.descuento).toBe(0);
    expect(entera.total).toBe(123900);
  });

  it('Dice la forma de pago de cada venta', () => {
    const rows = run('sales-detail').rows;
    expect(rows.find(r => r._id === 'V5')!.metodo).toBe('Tarjeta');
    expect(rows.find(r => r._id === 'V10')!.metodo).toBe('Efectivo');
  });

  it('Una venta financiada se distingue de una de contado', () => {
    const d = data();
    (d.salesDetail!.sales[0] as any).payment_method = 'financing';
    (d.salesDetail!.sales[0] as any).sale_type = 'credit';
    const fila = run('sales-detail', d).rows.find(r => r._id === 'V10')!;
    expect(fila.metodo).toBe('Financiamiento');
    expect(fila.tipo).toBe('Financiada');
  });

  it('Un pago repartido entre dos formas se enseña entero', () => {
    const d = data();
    (d.salesDetail!.sales[0] as any).payment_method = 'mixed';
    (d.salesDetail!.sales[0] as any).payment_details = [
      { method: 'cash', amount: 50000 }, { method: 'card', amount: 61510 },
    ];
    const fila = run('sales-detail', d).rows.find(r => r._id === 'V10')!;
    expect(fila.metodo).toBe('Pago mixto');
    expect(String(fila.reparto)).toContain('Efectivo');
    expect(String(fila.reparto)).toContain('Tarjeta');
  });

  it('El total descontado del período sale como indicador', () => {
    const kpi = (run('sales-detail').kpis || []).find(k => k.key === 'descuento')!;
    expect(kpi.value).toBe(15750); // 10,500 + 5,250
  });
});

describe('Descuentos aplicados', () => {
  it('Solo salen las ventas que se rebajaron, con su precio de lista al lado', () => {
    const res = run('sales-discounts');
    expect(res.rows).toHaveLength(2);
    const fila = res.rows.find(r => r.numero === 'V10')!;
    expect(fila.precioLista).toBe(123900);
    expect(fila.precioCobrado).toBe(111510);
    expect(fila.descuento).toBe(12390);   // con ITBIS: lo que el cliente se ahorró
    expect(fila.descuentoPct).toBe(10);
    expect(fila.origen).toBe('Guardado');
  });

  it('Dice cuánto se dejó de cobrar en total', () => {
    const kpi = (run('sales-discounts').kpis || []).find(k => k.key === 'descontado')!;
    expect(kpi.value).toBe(18585);  // 12,390 + 6,195
  });

  it('Avisa cuando el descuento se dedujo del precio de hoy', () => {
    const d = data();
    for (const v of d.salesDetail!.sales) (v.details[0] as any).list_unit_price = null;
    const res = run('sales-discounts', d);
    expect(res.rows.find(r => r.numero === 'V10')!.origen).toBe('Deducido');
    expect((res.notes || []).some(n => n.includes('aproximada'))).toBe(true);
  });
});

describe('Productos vendidos', () => {
  it('Enseña el precio de lista y el que de verdad se cobró', () => {
    const fila = run('sales-by-product').rows[0];
    expect(fila.producto).toBe('HONDA NAVY AZUL 2026');
    expect(fila.unidades).toBe(3);
    expect(fila.precioLista).toBe(123900);
    expect(fila.precioPromedio).toBe(117705);  // (111,510 + 117,705 + 123,900) ÷ 3
    expect(fila.descuento).toBe(18585);
    expect(fila.importe).toBe(353115);
  });
});

describe('Ventas por forma de pago', () => {
  it('Reparte las ventas por cómo se cobraron', () => {
    const res = run('sales-by-payment');
    const efectivo = res.rows.find(r => r.metodo === 'Efectivo')!;
    const tarjeta = res.rows.find(r => r.metodo === 'Tarjeta')!;
    expect(efectivo.ventas).toBe(2);
    expect(efectivo.total).toBe(235410);   // 111,510 + 123,900
    expect(tarjeta.total).toBe(117705);
    expect(Number(efectivo.participacion) + Number(tarjeta.participacion)).toBeCloseTo(100, 1);
  });
});

describe('Ventas financiadas', () => {
  it('Enseña el financiamiento con su tasa ANUAL y su plazo', () => {
    const fila = run('sales-financed').rows[0];
    expect(fila.cliente).toBe('Omar Santana');
    expect(fila.productos).toBe('HONDA NAVY AZUL 2026');
    expect(fila.financiado).toBe(80000);
    expect(fila.tasa).toBe(15);          // 1.25% mensual = 15% anual
    expect(fila.plazo).toBe('12 meses');
    expect(fila.interes).toBe(12000);
    expect(fila.balance).toBe(92000);
  });

  it('Un préstamo que no salió de una venta no se cuela', () => {
    const d = data();
    (d.loans[0] as any).purpose = 'Capital de trabajo';
    expect(run('sales-financed', d).rows).toHaveLength(0);
  });
});
