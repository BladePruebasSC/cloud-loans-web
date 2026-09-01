// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import {
  computePortfolioSnapshot, computeCashflow, computeRecovery, buildMonthlySeries,
  computeTodayAgenda, topRiskLoans, bucketForDays, getSaleAmount, startOfWeekIso, addDaysIso, monthLabel,
} from '@/utils/portfolioMetrics';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("portfolioMetrics", () => {

const TODAY = '2026-08-29'; // sábado

const loan = (o) => ({
  id: o.id, client_id: o.client_id || 'c1', amount: 10000, remaining_balance: 8000, monthly_payment: 1000,
  status: 'active', start_date: '2026-01-15', next_payment_date: TODAY, grace_period_days: 0,
  current_late_fee: 0, amortization_type: 'simple', payment_frequency: 'monthly', ...o,
});
const pay = (o) => ({ id: o.id, loan_id: o.loan_id || 'L1', amount: 0, principal_amount: 0, interest_amount: 0, late_fee: 0, payment_date: TODAY, ...o });

  it("Buckets de antiguedad", () => {
  ok('0 dias -> current', bucketForDays(0) === 'current');
  ok('1 dia -> 1-30', bucketForDays(1) === '1-30');
  ok('30 -> 1-30', bucketForDays(30) === '1-30');
  ok('31 -> 31-60', bucketForDays(31) === '31-60');
  ok('91 -> 90+', bucketForDays(91) === '90+');
  
  });

  it("EL BUG: salud 100% con toda la cartera en mora", () => {
  {
    // 10 préstamos, todos vencidos (el caso real de la captura)
    const loans = Array.from({ length: 10 }, (_, i) =>
      loan({ id: `L${i}`, client_id: `c${i}`, remaining_balance: 42574.9, next_payment_date: '2026-06-01' }));
    const snap = computePortfolioSnapshot(loans, TODAY);
    ok('10 en mora', snap.overdueLoans === 10, String(snap.overdueLoans));
    ok('salud 0% (antes mostraba 100%)', snap.healthPct === 0, `${snap.healthPct}%`);
    ok('PAR-30 = 100%', snap.par30 === 100, `${snap.par30}%`);
    ok('saldo al dia = 0', snap.currentBalance === 0);
    ok('saldo en mora = saldo activo', Math.round(snap.overdueBalance) === Math.round(snap.activeBalance));
  }
  
  });

  it("Cartera mixta", () => {
  {
    const loans = [
      loan({ id: 'A', remaining_balance: 5000, next_payment_date: '2026-09-15' }), // futuro -> al dia
      loan({ id: 'B', remaining_balance: 3000, next_payment_date: TODAY }),        // hoy -> al dia
      loan({ id: 'C', remaining_balance: 2000, next_payment_date: '2026-08-19' }), // 10 d
      loan({ id: 'D', remaining_balance: 1000, next_payment_date: '2026-06-20' }), // 70 d
      loan({ id: 'E', remaining_balance: 9999, status: 'paid' }),                  // no cuenta
    ];
    const s = computePortfolioSnapshot(loans, TODAY);
    ok('activos = 4', s.activeLoans === 4, String(s.activeLoans));
    ok('saldo activo = 11000', s.activeBalance === 11000, String(s.activeBalance));
    ok('al dia = 8000', s.currentBalance === 8000, String(s.currentBalance));
    ok('salud = 72.73%', s.healthPct === 72.73, String(s.healthPct));
    ok('PAR-30 = 9.09% (solo el de 70 dias)', s.par30 === 9.09, String(s.par30));
    ok('bucket 1-30 tiene 1', s.buckets['1-30'].count === 1);
    ok('bucket 61-90 tiene 1', s.buckets['61-90'].count === 1);
    ok('pagados = 1', s.paidLoans === 1);
    ok('peor atraso = 70', s.maxDaysOverdue === 70, String(s.maxDaysOverdue));
  }
  
  });

  it("Periodo de gracia", () => {
  {
    const loans = [loan({ id: 'G', next_payment_date: '2026-08-27', grace_period_days: 5 })]; // 2 d < gracia
    const s = computePortfolioSnapshot(loans, TODAY);
    ok('dentro de gracia cuenta como al dia', s.overdueLoans === 0 && s.healthPct === 100);
  }
  
  });

  it("Flujo de caja: hoy / semana / mes", () => {
  {
    const payments = [
      pay({ id: 'p1', principal_amount: 800, interest_amount: 200, amount: 1000, payment_date: TODAY }),
      pay({ id: 'p2', principal_amount: 0, interest_amount: 500, late_fee: 100, amount: 600, payment_date: '2026-08-28' }),
      pay({ id: 'p3', principal_amount: 1000, interest_amount: 0, amount: 1000, payment_date: '2026-08-24' }), // lunes de esta semana
      pay({ id: 'p4', principal_amount: 500, interest_amount: 300, amount: 800, payment_date: '2026-07-10' }), // mes anterior
    ];
    const sales = [
      { total_amount: 1500, status: 'completed', sale_date: TODAY },
      { total_amount: 999, status: 'cancelled', sale_date: TODAY },
      { total_price: 400, sale_date: '2026-07-05' },
    ];
    const c = computeCashflow(payments, sales, TODAY);
    ok('cobrado hoy = 1000', c.today.collected === 1000, String(c.today.collected));
    ok('POS hoy = 1500 (excluye cancelada)', c.today.pos === 1500, String(c.today.pos));
    ok('ingreso hoy = interes 200 + POS 1500', c.today.income === 1700, String(c.today.income));
    ok('ayer cobrado = 600', c.yesterday.collected === 600, String(c.yesterday.collected));
    ok('semana (lun 24 - hoy) = 2600', c.week.collected === 2600, String(c.week.collected));
    ok('mes cobrado = 2600', c.month.collected === 2600, String(c.month.collected));
    ok('mes anterior cobrado = 800', c.previousMonth.collected === 800, String(c.previousMonth.collected));
    ok('mes anterior ingreso = 300 + 400 POS', c.previousMonth.income === 700, String(c.previousMonth.income));
    ok('mes interes = 700', c.month.interest === 700, String(c.month.interest));
    ok('mes mora = 100', c.month.lateFee === 100, String(c.month.lateFee));
    ok('lunes de la semana', startOfWeekIso(TODAY) === '2026-08-24', startOfWeekIso(TODAY));
    // ingreso mes = 700 interes + 100 mora + 1500 POS = 2300 ; anterior 700 -> +228.57%
    ok('variacion MoM', c.incomeMoMPct === 228.57, String(c.incomeMoMPct));
  }
  
  });

  it("Recuperacion (no puede pasar de 100%)", () => {
  {
    const loans = [loan({ id: 'L1', amount: 10000 }), loan({ id: 'L2', amount: 10000 })];
    const payments = [
      pay({ id: 'r1', principal_amount: 5000, interest_amount: 3000, amount: 8000 }),
      pay({ id: 'r2', principal_amount: 2500, interest_amount: 1500, amount: 4000 }),
    ];
    const c = computeCashflow(payments, [], TODAY);
    const r = computeRecovery(loans, c);
    ok('colocado 20000', r.capitalLent === 20000);
    ok('recuperado 7500', r.capitalRecovered === 7500);
    ok('recuperacion 37.5%', r.recoveryPct === 37.5, String(r.recoveryPct));
    ok('interes 4500', r.interestEarned === 4500);
    ok('rendimiento 22.5%', r.yieldPct === 22.5, String(r.yieldPct));
    ok('recuperacion nunca > 100', computeRecovery([loan({ id: 'x', amount: 1000 })], computeCashflow([pay({ id: 'z', principal_amount: 99999, amount: 99999 })], [], TODAY)).recoveryPct === 100);
  }
  
  });

  it("Serie mensual", () => {
  {
    const payments = [
      pay({ id: 's1', principal_amount: 100, interest_amount: 50, amount: 150, payment_date: '2026-08-10' }),
      pay({ id: 's2', principal_amount: 200, interest_amount: 60, amount: 260, payment_date: '2026-07-10' }),
      pay({ id: 's3', principal_amount: 300, interest_amount: 70, amount: 370, payment_date: '2025-01-10' }), // fuera de rango
    ];
    const loans = [loan({ id: 'n1', amount: 5000, start_date: '2026-08-02' })];
    const series = buildMonthlySeries(payments, [], loans, TODAY, 6);
    ok('6 meses', series.length === 6, String(series.length));
    ok('ultimo mes es agosto', series[5].key === '2026-08', series[5].key);
    ok('primer mes es marzo', series[0].key === '2026-03', series[0].key);
    ok('agosto cobrado 150', series[5].cobrado === 150, String(series[5].cobrado));
    ok('agosto colocado 5000', series[5].colocado === 5000, String(series[5].colocado));
    ok('julio cobrado 260', series[4].cobrado === 260, String(series[4].cobrado));
    ok('pago fuera de rango ignorado', series.reduce((s, x) => s + x.cobrado, 0) === 410);
    ok('etiqueta legible', monthLabel('2026-08') === 'ago 26', monthLabel('2026-08'));
    ok('cruza anio hacia atras', buildMonthlySeries([], [], [], '2026-02-15', 4)[0].key === '2025-11');
  }
  
  });

  it("Agenda operativa", () => {
  {
    const loans = [
      loan({ id: 'H1', next_payment_date: TODAY, monthly_payment: 500 }),
      loan({ id: 'V1', next_payment_date: '2026-08-01', monthly_payment: 700, remaining_balance: 4000 }),
      loan({ id: 'V2', next_payment_date: '2026-08-20', monthly_payment: 300, remaining_balance: 1000 }),
      loan({ id: 'S1', next_payment_date: '2026-09-02', monthly_payment: 900 }),
      loan({ id: 'F1', next_payment_date: '2026-10-30', monthly_payment: 400 }),
    ];
    const a = computeTodayAgenda(loans, TODAY);
    ok('vence hoy = 1', a.dueToday.length === 1);
    ok('vencidos = 2', a.overdue.length === 2);
    ok('esta semana = 1 (2-sep)', a.dueThisWeek.length === 1, String(a.dueThisWeek.length));
    ok('futuros = 1', a.upcoming.length === 1);
    ok('esperado hoy = 500', a.expectedToday === 500);
    ok('esperado semana = 500 + 900', a.expectedWeek === 1400, String(a.expectedWeek));
    ok('monto vencido = 5000', a.overdueAmount === 5000, String(a.overdueAmount));
    ok('vencidos ordenados por dias desc', a.overdue[0].loan.id === 'V1');
    const risk = topRiskLoans(loans, TODAY, 5);
    ok('riesgo ordena por dias x saldo', risk[0].loan.id === 'V1', risk[0]?.loan.id);
  }
  
  });

  it("Ventas POS (dos esquemas historicos)", () => {
  ok('total_amount', getSaleAmount({ total_amount: 100 }) === 100);
  ok('total_price', getSaleAmount({ total_price: 200 }) === 200);
  ok('quantity x unit_price', getSaleAmount({ quantity: 3, unit_price: 50 }) === 150);
  ok('sin datos = 0', getSaleAmount({}) === 0);
  
  });

  it("Casos borde", () => {
  ok('cartera vacia no divide por cero', (() => { const s = computePortfolioSnapshot([], TODAY); return s.healthPct === 0 && s.par30 === 0 && s.avgTicket === 0; })());
  ok('sin pagos, MoM null', computeCashflow([], [], TODAY).incomeMoMPct === null);
  ok('addDaysIso cruza mes', addDaysIso('2026-08-31', 1) === '2026-09-01');
  ok('pago sin amount se reconstruye', computeCashflow([pay({ id: 'q', principal_amount: 100, interest_amount: 50, amount: 0 })], [], TODAY).today.collected === 150);
  
  
  });
});
