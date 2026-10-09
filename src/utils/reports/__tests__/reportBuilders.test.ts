// Los reportes tienen que decir lo MISMO que los módulos de los que salen.
//
// Punto 34 del pedido: "si el módulo de préstamos dice capital pendiente = RD$500,000, el
// reporte no puede mostrar RD$470,000". Estas pruebas comparan cada reporte contra el motor del
// que viven el inicio y la ficha del préstamo (`portfolioMetrics`, `loanPaidTotals`), con una
// cartera de ejemplo que trae los casos que han dado problemas de verdad este mes: un cargo y
// una cuota el mismo día, un pago guardado sin desglose en un indefinido, un descuento y un
// abono a capital con penalidad.
import { describe, it, expect } from 'vitest';
import { computePortfolioSnapshot, overdueFromDues } from '../../portfolioMetrics';
import { REPORTS, reportById, visibleReports } from '../reportCatalog';
import { buildDashboard } from '../reportDashboard';
import { financialTotals } from '../builders/financialReports';
import { arrearsLoans, computePar } from '../builders/arrearsReports';
import { breakdownOf } from '../builders/paymentReports';
import type { ReportData } from '../reportDataset';
import type { ReportFilters } from '../reportTypes';

const HOY = '2026-10-09';

const PERIODO: ReportFilters = {
  startDate: '2026-10-01', endDate: HOY, preset: 'month', compare: false,
};

/**
 * Cartera de ejemplo:
 *  · L1 — plazo fijo, 10,000 al 20% diario (cuota 400). Al día. Un cargo de 1,500 cobrado el
 *    mismo día que una cuota.
 *  · L2 — indefinido, 35,000 quincenal (cuota 525). Dos cuotas cobradas SIN desglose.
 *  · L3 — plazo fijo, 20,000. VENCIDO: 45 días de atraso y 3,000 vencidos.
 *  · L4 — saldado.
 */
const makeData = (): ReportData => {
  const clients = [
    { id: 'C1', full_name: 'Rosalynn Ceballos', dni: '40200000001', phone: '8095550001', status: 'active', created_at: '2026-09-01', credit_score: null, city: 'Higüey', neighborhood: 'Centro' },
    { id: 'C2', full_name: 'Miguel Herrera', dni: '40200000002', phone: '8095550002', status: 'active', created_at: '2026-10-03', credit_score: null, city: 'Higüey', neighborhood: 'Brisas' },
    { id: 'C3', full_name: 'Ana Morales', dni: '40200000003', phone: '8095550003', status: 'active', created_at: '2026-05-10', credit_score: null, city: 'La Romana', neighborhood: '' },
  ] as any[];

  const loans = [
    {
      id: 'L1', client_id: 'C1', amount: 10000, remaining_balance: 4800, monthly_payment: 400,
      status: 'active', start_date: '2026-10-02', next_payment_date: '2026-10-10',
      interest_rate: 20, amortization_type: 'simple', payment_frequency: 'daily',
      created_at: '2026-10-02', client: { full_name: 'Rosalynn Ceballos', dni: '40200000001' },
    },
    {
      id: 'L2', client_id: 'C2', amount: 35000, remaining_balance: 35525, monthly_payment: 525,
      status: 'active', start_date: '2026-10-05', next_payment_date: '2026-10-20',
      interest_rate: 1.5, amortization_type: 'indefinite', payment_frequency: 'biweekly',
      created_at: '2026-10-05', client: { full_name: 'Miguel Herrera', dni: '40200000002' },
    },
    {
      id: 'L3', client_id: 'C3', amount: 20000, remaining_balance: 12000, monthly_payment: 1000,
      status: 'active', start_date: '2026-06-01', next_payment_date: '2026-08-25',
      interest_rate: 3, amortization_type: 'simple', payment_frequency: 'monthly',
      created_at: '2026-06-01', client: { full_name: 'Ana Morales', dni: '40200000003' },
    },
    {
      id: 'L4', client_id: 'C1', amount: 5000, remaining_balance: 0, monthly_payment: 500,
      status: 'paid', start_date: '2026-07-01', next_payment_date: null,
      interest_rate: 5, amortization_type: 'simple', payment_frequency: 'monthly',
      created_at: '2026-07-01', client: { full_name: 'Rosalynn Ceballos', dni: '40200000001' },
    },
  ] as any[];

  const payments = [
    // L1: el CARGO (lleva capital, no lleva interés) y la cuota del mismo día
    { id: 'P1', loan_id: 'L1', amount: 1500, principal_amount: 1500, interest_amount: 0, late_fee: 0, payment_date: '2026-10-03', created_by: 'U1' },
    { id: 'P2', loan_id: 'L1', amount: 400, principal_amount: 333.33, interest_amount: 66.67, late_fee: 0, payment_date: '2026-10-03', created_by: 'U1' },
    // L1: cuota con descuento de 50 (se acredita 400, entran 350)
    { id: 'P3', loan_id: 'L1', amount: 400, principal_amount: 333.33, interest_amount: 66.67, late_fee: 0, discount_amount: 50, payment_date: '2026-10-06', created_by: 'U2' },
    // L2: indefinido, dos cuotas SIN desglose (así las guardaba el pago normal)
    { id: 'P4', loan_id: 'L2', amount: 525, principal_amount: 0, interest_amount: 0, late_fee: 0, payment_date: '2026-10-06', created_by: 'U2' },
    { id: 'P5', loan_id: 'L2', amount: 525, principal_amount: 0, interest_amount: 0, late_fee: 0, payment_date: '2026-10-08', created_by: 'U1' },
    // L3: cuota atrasada con mora
    { id: 'P6', loan_id: 'L3', amount: 1000, principal_amount: 700, interest_amount: 300, late_fee: 250, payment_date: '2026-10-07', created_by: 'U1' },
    // Fuera del período (septiembre): no debe contarse
    { id: 'P7', loan_id: 'L3', amount: 1000, principal_amount: 700, interest_amount: 300, late_fee: 0, payment_date: '2026-09-28', created_by: 'U1' },
  ] as any[];

  const balanceByLoan = new Map([['L1', 4800], ['L2', 35525], ['L3', 12000]]);

  // IMPORTANTE: igual que hace `usePortfolioData`, el `pendingAmount` del atraso se sustituye
  // por el BALANCE de la ficha. Si no, el panel sumaría solo las cuotas vencidas y el reporte el
  // balance completo: dos cifras distintas para "saldo por cobrar".
  const conBalance = (loanId: string, facts: ReturnType<typeof overdueFromDues>) =>
    ({ ...facts, pendingAmount: balanceByLoan.get(loanId)! });
  const overdueByLoan = new Map([
    ['L1', conBalance('L1', overdueFromDues([{ dueDate: '2026-10-10', pending: 400 }], HOY, 2))],
    ['L2', conBalance('L2', overdueFromDues([{ dueDate: '2026-10-20', pending: 525 }], HOY, 0))],
    ['L3', conBalance('L3', overdueFromDues([
      { dueDate: '2026-08-25', pending: 1000 },
      { dueDate: '2026-09-25', pending: 2000 },
    ], HOY, 0))],
  ]);
  const lateFeeByLoan = new Map([['L1', 0], ['L2', 0], ['L3', 900]]);

  const core: ReportData = {
    todayIso: HOY,
    loans, clients, payments,
    installments: [
      { id: 'I1', loan_id: 'L3', installment_number: 1, due_date: '2026-08-25', total_amount: 1000, principal_amount: 700, interest_amount: 300, paid_amount: 0, is_paid: false },
      { id: 'I2', loan_id: 'L3', installment_number: 2, due_date: '2026-09-25', total_amount: 1000, principal_amount: 700, interest_amount: 300, paid_amount: 0, is_paid: false },
    ] as any[],
    capitalPayments: [
      { id: 'A1', loan_id: 'L1', amount: 1000, capital_before: 4000, capital_after: 3000, created_at: '2026-10-08T14:00:00Z' },
    ] as any[],
    penalties: [{ id: 'PEN1', loan_id: 'L1', amount: 200, source: 'capital_payment', capital_payment_id: 'A1', created_at: '2026-10-08T14:00:00Z' }] as any[],
    loanHistory: [],
    tracking: [],
    sales: [{ total_amount: 2360, sale_date: '2026-10-04', status: 'completed' }] as any[],
    deletedLoans: [],
    awaitingApprovalCount: 2,
    overdueByLoan,
    balanceByLoan,
    lateFeeByLoan,
    portfolio: computePortfolioSnapshot(loans, HOY, overdueByLoan, lateFeeByLoan) as any,
    cashflow: {} as any,
    recovery: {} as any,
    userNames: new Map([['U1', 'Omar Santana'], ['U2', 'Yomalay Pérez']]),
    expenses: {
      rows: [
        { id: 'G1', category: 'Combustible', description: 'Gasolina ruta', amount: 1200, expense_date: '2026-10-05', created_by: 'U1', status: 'approved' },
        { id: 'G2', category: 'Oficina', description: 'Papelería', amount: 800, expense_date: '2026-10-07', created_by: 'U2', status: 'approved' },
        { id: 'G3', category: 'Oficina', description: 'De septiembre', amount: 5000, expense_date: '2026-09-15', created_by: 'U1', status: 'approved' },
      ],
      availableColumns: ['id', 'category', 'description', 'amount', 'expense_date', 'created_by', 'status'],
    },
  };
  return core;
};

const run = (id: string, data: ReportData, filters: ReportFilters = PERIODO) => {
  const def = reportById(id);
  if (!def) throw new Error(`No existe el reporte ${id}`);
  return def.build({ data, filters, todayIso: data.todayIso });
};

const sum = (rows: Array<Record<string, unknown>>, key: string) =>
  Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) * 100) / 100;

describe('Catálogo', () => {
  it('Todos los reportes tienen id único, columnas y constructor', () => {
    const ids = new Set<string>();
    for (const r of REPORTS) {
      expect(ids.has(r.id), `id repetido: ${r.id}`).toBe(false);
      ids.add(r.id);
      expect(r.columns.length, `${r.id} sin columnas`).toBeGreaterThan(0);
      expect(typeof r.build, `${r.id} sin build`).toBe('function');
      expect(r.description.length, `${r.id} sin descripción`).toBeGreaterThan(10);
    }
    expect(ids.size).toBeGreaterThanOrEqual(35);
  });

  it('Ningún reporte revienta con una cartera vacía', () => {
    const vacio: ReportData = {
      ...makeData(),
      loans: [], clients: [], payments: [], installments: [], capitalPayments: [],
      penalties: [], loanHistory: [], tracking: [], sales: [], deletedLoans: [],
      overdueByLoan: new Map(), balanceByLoan: new Map(), lateFeeByLoan: new Map(),
      expenses: { rows: [], availableColumns: [] },
    };
    for (const r of REPORTS) {
      const res = r.build({ data: vacio, filters: PERIODO, todayIso: HOY });
      expect(Array.isArray(res.rows), `${r.id} no devolvió filas`).toBe(true);
    }
  });
});

describe('Préstamos: cuadra con la cartera del inicio', () => {
  const data = makeData();

  it('El saldo de "Cartera activa" es el mismo que el del panel', () => {
    const res = run('loans-active', data);
    expect(res.rows).toHaveLength(3);
    expect(sum(res.rows, 'balance')).toBe(data.portfolio.activeBalance);
    expect(sum(res.rows, 'balance')).toBe(52325); // 4,800 + 35,525 + 12,000
  });

  it('"Préstamos desembolsados" solo cuenta los del período', () => {
    const res = run('loans-placed', data);
    expect(res.rows.map(r => r._loanId).sort()).toEqual(['L1', 'L2']);
    expect(sum(res.rows, 'capital')).toBe(45000);
  });

  it('La mora y el vencido de cada fila son los del motor de mora', () => {
    const res = run('loans-overdue', data);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]._loanId).toBe('L3');
    expect(res.rows[0].vencido).toBe(3000);
    expect(res.rows[0].mora).toBe(900);
    expect(res.rows[0].diasAtraso).toBe(data.overdueByLoan.get('L3')!.daysOverdue);
  });

  it('Por ciudad agrupa con los datos del cliente', () => {
    const res = run('loans-by-city', data);
    const higuey = res.rows.find(r => String(r.zona).startsWith('Higüey'));
    expect(higuey).toBeTruthy();
    expect(sum(res.rows, 'balance')).toBe(52325);
  });
});

describe('Pagos: el desglose es el del resto del sistema', () => {
  const data = makeData();

  it('Un pago de CARGO no se cuenta como capital ni como interés', () => {
    const b = breakdownOf(data.payments[0] as any, data.loans[0] as any);
    expect(b.cargo).toBe(1500);
    expect(b.capital).toBe(0);
    expect(b.interes).toBe(0);
  });

  it('En un INDEFINIDO, un pago sin desglose es interés', () => {
    const b = breakdownOf(data.payments[3] as any, data.loans[1] as any);
    expect(b.interes).toBe(525);
    expect(b.capital).toBe(0);
    expect(b.sinDesglose).toBe(true);
  });

  it('El efectivo recibido descuenta el descuento y suma la mora', () => {
    const conDescuento = breakdownOf(data.payments[2] as any, data.loans[0] as any);
    expect(conDescuento.efectivo).toBe(350); // 400 − 50
    const conMora = breakdownOf(data.payments[5] as any, data.loans[2] as any);
    expect(conMora.efectivo).toBe(1250); // 1,000 + 250
  });

  it('"Pagos recibidos" deja fuera lo de septiembre y suma bien', () => {
    const res = run('payments-received', data);
    expect(res.rows).toHaveLength(6); // los 7 menos el de septiembre
    expect(res.totals?.cargo).toBe(1500);
    // 66.67 + 66.67 (cuotas de L1) + 525 + 525 (indefinido sin desglose) + 300 (cuota de L3)
    expect(res.totals?.interes).toBe(1483.34);
    expect(res.totals?.mora).toBe(250);
    expect(res.totals?.descuento).toBe(50);
    expect(res.notes?.join(' ')).toContain('sin desglose');
  });

  it('La cobranza por usuario reparte lo cobrado entre quienes lo registraron', () => {
    const res = run('payments-by-user', data);
    const total = sum(res.rows, 'efectivo');
    const recibidos = run('payments-received', data);
    expect(total).toBe(recibidos.totals?.efectivo);
    expect(res.rows.map(r => r.usuario).sort()).toEqual(['Omar Santana', 'Yomalay Pérez']);
  });

  it('Los abonos a capital traen su penalidad', () => {
    const res = run('capital-payments', data);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].monto).toBe(1000);
    expect(res.rows[0].penalidad).toBe(200);
  });
});

describe('Mora y PAR', () => {
  const data = makeData();

  it('La cartera vencida son los préstamos con atraso real', () => {
    const morosos = arrearsLoans(data);
    expect(morosos.map(m => m.loanId)).toEqual(['L3']);
    expect(morosos[0].vencido).toBe(3000);
  });

  it('El PAR se mide sobre el saldo activo', () => {
    const par = computePar(data);
    const par30 = par.find(p => p.dias === 30)!;
    // L3 (12,000) sobre 52,325 de cartera = 22.9%
    expect(par30.balance).toBe(12000);
    expect(par30.porcentaje).toBe(22.9);
    // Y coincide con el PAR 30 del panel.
    expect(par30.porcentaje).toBeCloseTo(data.portfolio.par30, 0);
  });

  it('La antigüedad reparte el saldo en tramos sin perder nada', () => {
    const res = run('arrears-aging', data);
    expect(sum(res.rows, 'balance')).toBe(12000);
    expect(res.rows[0].tramo).toBe('31 a 60');
  });
});

describe('Financiero: la ganancia no es "todo lo que entró"', () => {
  const data = makeData();
  const t = financialTotals(data, PERIODO);

  it('Separa el capital que vuelve del ingreso de verdad', () => {
    expect(t.capitalCobrado).toBe(1366.66); // 333.33 + 333.33 + 700 (el cargo NO es capital)
    expect(t.cargos).toBe(1500);
    expect(t.interes).toBe(1483.34);         // 66.67 + 66.67 + 525 + 525 + 300
    expect(t.mora).toBe(250);
    expect(t.descuentos).toBe(50);
    expect(t.abonos).toBe(1000);
    expect(t.penalidades).toBe(200);
    expect(t.ventas).toBe(2360);
    expect(t.gastos).toBe(2000);             // los 5,000 de septiembre quedan fuera
    expect(t.desembolsos).toBe(45000);       // L1 y L2
  });

  it('Entradas, salidas y flujo cuadran entre sí', () => {
    expect(t.entradas).toBe(
      Math.round((t.capitalCobrado + t.interes + t.cargos + t.mora + t.abonos + t.ventas - t.descuentos) * 100) / 100,
    );
    expect(t.salidas).toBe(t.gastos + t.desembolsos);
    expect(t.flujoNeto).toBe(Math.round((t.entradas - t.salidas) * 100) / 100);
  });

  it('El resultado NO incluye el capital devuelto', () => {
    expect(t.ingresoOperativo).toBe(
      Math.round((t.interes + t.cargos + t.mora + t.penalidades + t.ventas - t.descuentos) * 100) / 100,
    );
    expect(t.resultado).toBe(Math.round((t.ingresoOperativo - t.gastos) * 100) / 100);
    expect(t.resultado).toBeLessThan(t.entradas); // la ganancia nunca es "todo lo que entró"
  });

  it('El resumen financiero enseña esas mismas cifras', () => {
    const res = run('fin-summary', data);
    const fila = (id: string) => res.rows.find(r => r._id === id);
    expect(fila('resultado')?.monto).toBe(t.resultado);
    expect(fila('gastos')?.monto).toBe(2000);
    expect(res.kpis?.find(k => k.key === 'resultado')?.value).toBe(t.resultado);
  });
});

describe('Gastos', () => {
  const data = makeData();

  it('Solo los del período, agrupados por categoría', () => {
    const detalle = run('expenses-detail', data);
    expect(detalle.rows).toHaveLength(2);
    expect(sum(detalle.rows, 'monto')).toBe(2000);

    const porCategoria = run('expenses-by-category', data);
    expect(sum(porCategoria.rows, 'monto')).toBe(2000);
    expect(porCategoria.rows.find(r => r.categoria === 'Combustible')?.participacion).toBe(60);
  });

  it('Avisa si la base no guarda el método de pago', () => {
    const sinMetodo = run('expenses-detail', data);
    expect(sinMetodo.notes?.join(' ')).toContain('método de pago');
  });
});

describe('La portada', () => {
  const data = makeData();
  const secciones = buildDashboard(data, PERIODO);

  it('Separa lo del período de la foto de hoy', () => {
    expect(secciones.map(s => s.title)).toEqual(['Del período', 'A hoy']);
    expect(secciones[1].kpis.every(k => k.asOfToday)).toBe(true);
  });

  it('El saldo por cobrar es el mismo que el del reporte de cartera', () => {
    const kpi = secciones[1].kpis.find(k => k.key === 'cartera')!;
    const cartera = run('loans-active', data);
    expect(kpi.value).toBe(sum(cartera.rows, 'balance'));
  });

  it('Cada indicador lleva al reporte que lo explica', () => {
    const conEnlace = secciones.flatMap(s => s.kpis).filter(k => k.linkTo);
    expect(conEnlace.length).toBeGreaterThan(8);
    for (const kpi of conEnlace) {
      expect(reportById(kpi.linkTo!), `el KPI ${kpi.key} apunta a un reporte inexistente`).toBeTruthy();
    }
  });

  it('Los préstamos por aprobar se informan pero no suman en nada', () => {
    const kpi = secciones[1].kpis.find(k => k.key === 'porAprobar')!;
    expect(kpi.value).toBe(2);
    const cartera = run('loans-active', data);
    expect(cartera.rows).toHaveLength(3); // los 2 por aprobar no están
  });
});

describe('Permisos', () => {
  const data = makeData();
  // Un cajero: puede ver reportes y registrar pagos, nada financiero.
  const cajero = (p: string) => ['reports.view', 'payments.create'].includes(p);

  it('El catálogo solo enseña los reportes que el usuario puede ver', () => {
    const suyos = visibleReports(cajero);
    expect(suyos.some(r => r.id === 'payments-received')).toBe(true);
    expect(suyos.some(r => r.id === 'fin-summary')).toBe(false);      // reports.financial
    expect(suyos.some(r => r.id === 'loans-active')).toBe(false);     // reports.loans
    expect(suyos.some(r => r.id === 'expenses-detail')).toBe(false);  // expenses.view
    expect(suyos.length).toBeLessThan(REPORTS.length);
  });

  it('La portada esconde los indicadores financieros, no los enseña en cero', () => {
    const secciones = buildDashboard(data, PERIODO, cajero);
    const claves = secciones.flatMap(s => s.kpis.map(k => k.key));
    expect(claves).toContain('cobrado');
    expect(claves).not.toContain('resultado');
    expect(claves).not.toContain('gastos');
    expect(claves).not.toContain('cartera');
  });

  it('El dueño lo ve todo', () => {
    const todo = () => true;
    expect(visibleReports(todo).length).toBe(REPORTS.length);
    const secciones = buildDashboard(data, PERIODO, todo);
    expect(secciones.flatMap(s => s.kpis).length).toBeGreaterThan(15);
  });
});

describe('El período se respeta en todos lados', () => {
  const data = makeData();

  it('Un cobro del último día del período SÍ entra', () => {
    const conHoy = run('payments-received', data, { ...PERIODO, endDate: '2026-10-07' });
    expect(conHoy.rows.some(r => r.fecha === '2026-10-07')).toBe(true);
  });

  it('Cambiar el período cambia las cifras', () => {
    const septiembre = { ...PERIODO, startDate: '2026-09-01', endDate: '2026-09-30' };
    const res = run('payments-received', data, septiembre);
    expect(res.rows).toHaveLength(1);
    expect(res.totals?.efectivo).toBe(1000);
  });
});
