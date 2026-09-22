// Agenda de cobros, descuento en los pagos y balance de un préstamo saldado.
//
// FALLOS/CAMBIOS REPORTADOS (2026-09-22):
//   · "Sale ese préstamo, pero en los datos del préstamo (estado de cuenta) el balance restante
//     tiene un monto alto aún" — el préstamo está PAGADO y la tarjeta decía RD$0.00.
//   · "La agenda solo muestra el siguiente cobro de un préstamo… necesito que muestre todos los
//     siguientes cobros: si el préstamo es a 12 meses, que en los siguientes 12 meses salga el
//     cobro de ese préstamo."
//   · "Los formularios de pago, normal y avanzado, deben tener un apartado de descuento, por
//     porcentaje o monto, y que se refleje en la factura, el historial y los datos."
import { describe, it, expect } from 'vitest';
import { agendaByDay, agendaTotal, buildCollectionAgenda, buildLoanAgenda } from '../collectionAgenda';
import {
  computeDiscount, describeDiscount, discountFields, insertPaymentsWithDiscount, netToCollect,
  paymentCashReceived, paymentsDiscountTotal, splitDiscount,
} from '../paymentDiscount';
import { computeLoanBalanceBreakdown } from '../loanBalanceBreakdown';
import { computeCashflow, buildMonthlySeries } from '../portfolioMetrics';

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
const VENTANA = { fromIso: '2026-09-01', toIso: '2027-09-22', todayIso: '2026-09-22' };

describe('agenda de cobros', () => {
  it('EL CASO REPORTADO: un préstamo a 12 meses aporta sus 12 cobros, no solo el siguiente', () => {
    const cobros = buildLoanAgenda({
      id: 'L1', status: 'active', start_date: '2026-08-15', next_payment_date: '2026-09-15',
      term_months: 12, payment_frequency: 'monthly', monthly_payment: 1500, remaining_balance: 18000,
    }, VENTANA);

    expect(cobros).toHaveLength(12);
    expect(cobros.map(c => c.dueDate).slice(0, 3)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
    expect(cobros[0]).toMatchObject({ number: 1, total: 12, amount: 1500, isLast: false });
    expect(cobros[11]).toMatchObject({ dueDate: '2027-08-15', number: 12, isLast: true });
  });

  it('Los meses se cuentan como meses, no como 30 días', () => {
    const cobros = buildLoanAgenda({
      id: 'L2', status: 'active', start_date: '2025-12-31', next_payment_date: '2026-01-31',
      term_months: 3, payment_frequency: 'monthly', monthly_payment: 100,
    }, { fromIso: '2026-01-01', toIso: '2026-12-31', todayIso: '2026-09-22' });
    // 31-ene + 1 mes = 28-feb (se recorta, no desborda a marzo)
    expect(cobros.map(c => c.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('EL CASO REPORTADO: un INDEFINIDO ya no da un solo cobro marcado "ÚLTIMO"', () => {
    const cobros = buildLoanAgenda({
      id: 'L3', status: 'active', start_date: '2026-08-01', next_payment_date: '2026-09-29',
      term_months: 1, amortization_type: 'indefinite', payment_frequency: 'biweekly',
      monthly_payment: 525, remaining_balance: 35525,
    }, VENTANA);

    expect(cobros.length).toBeGreaterThan(20); // una quincena tras otra, mientras dure la ventana
    expect(cobros.every(c => c.isLast === false)).toBe(true);
    expect(cobros.every(c => c.total === null)).toBe(true);
    expect(cobros.slice(0, 3).map(c => c.dueDate)).toEqual(['2026-09-29', '2026-10-13', '2026-10-27']);
  });

  it('Una cuota vencida sin pagar sigue en la agenda, marcada como vencida', () => {
    const cobros = buildLoanAgenda({
      id: 'L4', status: 'overdue', start_date: '2026-06-01', next_payment_date: '2026-07-01',
      term_months: 4, payment_frequency: 'monthly', monthly_payment: 800,
    }, { fromIso: '2026-01-01', toIso: '2027-01-01', todayIso: '2026-09-22' });

    expect(cobros.map(c => [c.dueDate, c.isOverdue, c.number])).toEqual([
      ['2026-07-01', true, 1], ['2026-08-01', true, 2], ['2026-09-01', true, 3], ['2026-10-01', false, 4],
    ]);
  });

  it('Un préstamo pagado o sin saldo no aporta cobros', () => {
    const pagado = { id: 'L5', status: 'paid', start_date: '2026-01-01', next_payment_date: '2026-10-01', term_months: 12, monthly_payment: 100 };
    const saldado = { ...pagado, id: 'L6', status: 'active', remaining_balance: 0 };
    expect(buildLoanAgenda(pagado, VENTANA)).toHaveLength(0);
    expect(buildLoanAgenda(saldado, VENTANA)).toHaveLength(0);
  });

  it('La agenda junta todos los préstamos por día y suma lo esperado', () => {
    const loans = [
      { id: 'A', status: 'active', start_date: '2026-08-22', next_payment_date: '2026-09-22', term_months: 2, payment_frequency: 'monthly', monthly_payment: 1000 },
      { id: 'B', status: 'active', start_date: '2026-08-22', next_payment_date: '2026-09-22', term_months: 1, payment_frequency: 'monthly', monthly_payment: 250 },
    ];
    const agenda = buildCollectionAgenda(loans, VENTANA);
    expect(agendaByDay(agenda).get('2026-09-22')).toHaveLength(2);
    expect(agendaTotal(agenda, '2026-09-22', '2026-09-22')).toBe(1250);
    expect(agendaTotal(agenda, '2026-09-22', '2026-10-22')).toBe(2250); // + la cuota 2 de A
  });
});

// ---------------------------------------------------------------------------
// Descuento
// ---------------------------------------------------------------------------
describe('descuento del pago', () => {
  it('Por porcentaje y por monto, siempre con el otro deducido', () => {
    expect(computeDiscount('percent', 10, 525)).toEqual({ amount: 52.5, percentage: 10, error: null });
    expect(computeDiscount('amount', 25, 500)).toEqual({ amount: 25, percentage: 5, error: null });
    expect(computeDiscount('percent', '', 525)).toEqual({ amount: 0, percentage: null, error: null });
  });

  it('No puede pasar del monto del pago', () => {
    const porMonto = computeDiscount('amount', 600, 525);
    expect(porMonto.amount).toBe(525);
    expect(porMonto.error).toMatch(/no puede ser mayor/i);
    expect(computeDiscount('percent', 120, 525).error).toMatch(/100%/);
  });

  it('El cliente entrega el total menos el descuento', () => {
    expect(netToCollect(525 + 50, 52.5)).toBe(522.5);
    expect(netToCollect(100, 250)).toBe(0);
  });

  it('La cuota se acredita COMPLETA y el efectivo recibido es lo acreditado menos el descuento', () => {
    const pago = { amount: 525, late_fee: 50, discount_amount: 52.5 };
    expect(paymentCashReceived(pago)).toBe(522.5);
    expect(paymentsDiscountTotal([pago, { discount_amount: 10 }, {}])).toBe(62.5);
  });

  it('En el pago avanzado se reparte entre las cuotas y la suma cuadra al centavo', () => {
    const partes = splitDiscount([300, 200, 100], 60);
    expect(partes).toEqual([30, 20, 10]);
    expect(Math.round(partes.reduce((s, p) => s + p, 0) * 100) / 100).toBe(60);

    const dificil = splitDiscount([333.33, 333.33, 333.34], 100);
    expect(Math.round(dificil.reduce((s, p) => s + p, 0) * 100) / 100).toBe(100);
  });

  it('Los campos que se guardan', () => {
    expect(discountFields(52.5, 10, '  Cliente puntual ')).toEqual({
      discount_amount: 52.5, discount_percentage: 10, discount_reason: 'Cliente puntual',
    });
    expect(discountFields(0, null, '')).toEqual({
      discount_amount: 0, discount_percentage: null, discount_reason: null,
    });
    expect(describeDiscount(52.5, 10)).toBe('Descuento (10%)');
    expect(describeDiscount(25, null)).toBe('Descuento');
    expect(describeDiscount(0, 10)).toBe('');
  });

  it('Sin la migración aplicada el pago se guarda igual, pero sin descuento', async () => {
    const intentos: Array<Record<string, any>[]> = [];
    const supabase = {
      from: () => ({
        insert: (rows: any[]) => {
          intentos.push(rows);
          const faltaColumna = 'discount_amount' in rows[0];
          return Promise.resolve(faltaColumna
            ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'discount_amount' column of 'payments' in the schema cache" } }
            : { data: [{ id: 'p1' }], error: null });
        },
      }),
    };

    const res = await insertPaymentsWithDiscount(supabase as any, [{ amount: 525, ...discountFields(52.5, 10, null) }]);
    expect(res.error).toBeNull();
    expect(res.discountSaved).toBe(false);
    expect(intentos).toHaveLength(2);
    expect(intentos[1][0]).not.toHaveProperty('discount_amount');
    expect(intentos[1][0].amount).toBe(525); // la cuota se acredita igual
  });

  it('Lo perdonado no cuenta como dinero cobrado', () => {
    const pagos = [
      { id: '1', loan_id: 'L1', amount: 525, principal_amount: 0, interest_amount: 525, late_fee: 0, discount_amount: 52.5, payment_date: '2026-09-22' },
    ];
    const caja = computeCashflow(pagos as any[], [], '2026-09-22');
    expect(caja.today.collected).toBe(472.5);
    expect(caja.today.discount).toBe(52.5);
    expect(caja.today.income).toBe(472.5); // interés 525 − descuento 52.50

    const serie = buildMonthlySeries(pagos as any[], [], [], '2026-09-22', 1);
    expect(serie[0]).toMatchObject({ cobrado: 472.5, descuento: 52.5, ingreso: 472.5 });
  });
});

// ---------------------------------------------------------------------------
// Balance de un préstamo saldado
// ---------------------------------------------------------------------------
describe('balance de un préstamo saldado', () => {
  const prestamo = {
    id: 'L1', amount: 55000, interest_rate: 0.3, amortization_type: 'indefinite',
    start_date: '2026-08-01', payment_frequency: 'biweekly', monthly_payment: 166.66,
  };

  it('EL CASO REPORTADO: pagado = 0, aunque sea un indefinido con capital vigente', () => {
    const b = computeLoanBalanceBreakdown(
      { ...prestamo, status: 'paid' },
      { payments: [], installments: [], capitalPayments: [{ amount: 35000, capital_before: 55000, capital_after: 20000, created_at: '2026-09-01T12:00:00Z' }] },
      '2026-09-22',
    );
    expect(b).toMatchObject({ totalBalance: 0, capitalPending: 0, interestPending: 0 });
  });

  it('Activo sigue calculando lo que debe', () => {
    const b = computeLoanBalanceBreakdown(
      { ...prestamo, status: 'active' },
      { payments: [], installments: [], capitalPayments: [{ amount: 35000, capital_before: 55000, capital_after: 20000, created_at: '2026-09-01T12:00:00Z' }] },
      '2026-09-22',
    );
    expect(b.capitalPending).toBe(20000);
    expect(b.totalBalance).toBeGreaterThan(20000);
  });
});
