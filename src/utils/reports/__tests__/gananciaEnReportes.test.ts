// ============================================================================
// LOS REPORTES DE GANANCIA
// ============================================================================
// PEDIDO (2026-11-20): "necesito que le agregues un reporte que controle el costo y lo que se
// vendió, o sea que me dé la ganancia de las ventas, porque no hay ningún reporte que hable de
// ganancias como tal".
//
// Son dos: uno POR PRODUCTO (qué deja cada cosa que se vende) y otro POR VENTA (cuánto se ganó
// en cada una). Y el resumen financiero, que llamaba "ganancia" a lo facturado, ahora le quita
// el ITBIS y el costo de la mercancía.
import { describe, it, expect } from 'vitest';
import { reportById } from '../reportCatalog';
import { financialTotals } from '../builders/financialReports';
import type { ReportData } from '../reportDataset';
import type { ReportFilters } from '../reportTypes';

const HOY = '2026-11-20';
const PERIODO: ReportFilters = {
  startDate: '2026-11-01', endDate: HOY, preset: 'month', compare: false,
};

/** Una venta de una motora: 123,900 con ITBIS, 105,000 de base, 86,500 de costo. */
const venta = (id: string, over: Record<string, unknown> = {}, linea: Record<string, unknown> = {}) => ({
  id,
  sale_date: '2026-11-19',
  created_at: '2026-11-19T12:00:00Z',
  total_amount: null, total_price: null, subtotal: null, tax_amount: null,
  discount_amount: null, payment_method: 'cash', payment_details: null, sale_type: 'cash',
  status: 'completed', customer_name: 'Omar Santana', client_id: null, user_id: 'U1',
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
});

const run = (id: string, d: ReportData = data(), filters: ReportFilters = PERIODO) => {
  const def = reportById(id);
  if (!def) throw new Error(`No existe el reporte ${id}`);
  return def.build({ data: d, filters, todayIso: d.todayIso });
};

describe('Ganancia de las ventas (por producto)', () => {
  it('EL CASO PEDIDO: dice lo que costó, lo que se vendió y lo que se ganó', () => {
    const fila = run('sales-profit').rows[0];
    expect(fila.producto).toBe('HONDA NAVY AZUL 2026');
    expect(fila.unidades).toBe(2);
    expect(fila.costoUnitario).toBe(86500);
    expect(fila.precioUnitario).toBe(105000);  // sin ITBIS
    expect(fila.venta).toBe(210000);
    expect(fila.costo).toBe(173000);
    expect(fila.ganancia).toBe(37000);
    expect(fila.margen).toBe(17.62);
  });

  it('El ITBIS no infla la ganancia', () => {
    const kpis = run('sales-profit').kpis || [];
    // Si el impuesto contara, "vendido" sería 247,800 y la ganancia 74,800.
    expect(kpis.find(k => k.key === 'venta')?.value).toBe(210000);
    expect(kpis.find(k => k.key === 'ganancia')?.value).toBe(37000);
    expect(kpis.find(k => k.key === 'costo')?.value).toBe(173000);
  });

  it('Un producto sin precio de compra no se cuenta como ganancia entera, y se avisa', () => {
    const sinCosto = venta('V3', { id: 'V3' }, {
      id: 'd-V3', unit_cost: null, product_purchase_price: null,
    });
    const res = run('sales-profit', data([sinCosto]));
    expect(res.rows[0].ganancia).toBe(0);     // no 105,000
    expect(res.rows[0].sinCosto).toBe(1);
    expect((res.notes || []).some(n => n.includes('no se puede saber'))).toBe(true);
  });

  it('Avisa cuando el costo se dedujo del precio de compra de hoy', () => {
    const deducida = venta('V4', { id: 'V4' }, { id: 'd-V4', unit_cost: null });
    const res = run('sales-profit', data([deducida]));
    expect(res.rows[0].ganancia).toBe(18500);
    expect((res.notes || []).some(n => n.includes('aproximada'))).toBe(true);
  });
});

describe('Ganancia por venta', () => {
  it('Cada venta dice cuánto dejó', () => {
    const res = run('sales-profit-by-sale');
    expect(res.rows).toHaveLength(2);
    const fila = res.rows[0];
    expect(fila.venta).toBe(105000);
    expect(fila.costo).toBe(86500);
    expect(fila.ganancia).toBe(18500);
    expect(fila.margen).toBe(17.62);
    expect(res.kpis?.find(k => k.key === 'ganancia')?.value).toBe(37000);
    expect(res.kpis?.find(k => k.key === 'promedio')?.value).toBe(18500);
  });

  it('Con descuento, la ganancia baja: el costo no cambia', () => {
    const rebajada = venta('V5', { id: 'V5' }, {
      id: 'd-V5', unit_price: 111510, total_price: 94500,
    });
    const fila = run('sales-profit-by-sale', data([rebajada])).rows[0];
    expect(fila.descuento).toBe(10500);
    expect(fila.costo).toBe(86500);
    expect(fila.ganancia).toBe(8000);
  });
});

describe('El resumen financiero cuenta la venta por lo que deja', () => {
  it('A las ventas les quita el ITBIS y el costo de la mercancía', () => {
    const d = data();
    // `sales` (el crudo del inicio) es lo facturado; el detalle trae el costo.
    (d as any).sales = [{ total_amount: 123900, sale_date: '2026-11-19' },
                        { total_amount: 123900, sale_date: '2026-11-19' }];
    const t = financialTotals(d, PERIODO);
    expect(t.ventas).toBe(247800);         // lo facturado, con ITBIS
    expect(t.itbisVentas).toBe(37800);
    expect(t.costoVentas).toBe(173000);
    expect(t.gananciaVentas).toBe(37000);  // 210,000 − 173,000
    // El ingreso operativo entra por la GANANCIA, no por lo facturado.
    expect(t.ingresoOperativo).toBe(37000);
    expect(t.resultado).toBe(37000);
  });

  it('Sin el detalle cargado se mantiene lo de siempre, y se dice', () => {
    const d = data();
    delete (d as any).salesDetail;
    (d as any).sales = [{ total_amount: 123900, sale_date: '2026-11-19' }];
    const t = financialTotals(d, PERIODO);
    expect(t.gananciaVentas).toBe(123900);
    expect(t.costoVentas).toBe(0);
    const res = run('fin-summary', d);
    expect((res.notes || []).some(n => n.includes('todavía se está cargando'))).toBe(true);
  });

  it('El estado de resultados enseña las tres filas nuevas', () => {
    const d = data();
    (d as any).sales = [{ total_amount: 123900, sale_date: '2026-11-19' },
                        { total_amount: 123900, sale_date: '2026-11-19' }];
    const res = run('fin-summary', d);
    const fila = (id: string) => res.rows.find(r => r._id === id);
    expect(fila('itbisVentas')?.monto).toBe(37800);
    expect(fila('costoVentas')?.monto).toBe(173000);
    expect(fila('gananciaVentas')?.monto).toBe(37000);
    expect(fila('resultado')?.monto).toBe(37000);
  });
});
