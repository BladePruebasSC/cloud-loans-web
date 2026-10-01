// Un CARGO que vence el mismo día que una cuota, y el descuento en la tabla de amortización.
//
// FALLO REPORTADO (2026-10-01): "revisa ese préstamo que marca que solo se ha pagado 1 cuota,
// pero se han pagado como 6". Préstamo indefinido quincenal de RD$35,000 (cuota 525) con un
// cargo de RD$1,500 que vence el 15-sep —la misma fecha que la primera cuota—. El cliente pagó
// el cargo y cuatro cuotas de 525, y "Ver cuotas" decía "1 pagada, 2 pendientes".
//
// CAMBIO SOLICITADO el mismo día: "en recibo de ingreso y ver cuotas, las tablas de amortización
// deben mostrar las cuotas que recibieron un descuento, en monto y porcentaje".
import { describe, it, expect } from 'vitest';
import {
  allocatePaymentsToPeriods, isChargePayment, paymentGross, splitChargeAndRegularPayments,
} from '../chargeAwarePayments';
import { describeDueDiscount, discountsByDueDate } from '../paymentDiscount';
import { computeLoanBalanceBreakdown } from '../loanBalanceBreakdown';

// El préstamo del reporte
const CARGO_DUE = '2026-09-15';
const PAGOS = [
  // El cargo: lleva capital y no lleva interés
  { due_date: CARGO_DUE, amount: 1500, principal_amount: 1500, interest_amount: 0, payment_date: '2026-09-21' },
  // La primera cuota, cobrada desde el pago avanzado (con su interés)
  { due_date: CARGO_DUE, amount: 525, principal_amount: 0, interest_amount: 525, payment_date: '2026-09-21' },
  // Tres cuotas más, guardadas SIN desglose por el pago normal
  { due_date: CARGO_DUE, amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
  { due_date: CARGO_DUE, amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
  { due_date: CARGO_DUE, amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
];
const CARGOS = new Map([[CARGO_DUE, 1500]]);

describe('cargo y cuota el mismo día', () => {
  it('Un pago SIN desglose es de cuota, no del cargo', () => {
    expect(isChargePayment(PAGOS[0])).toBe(true);   // capital, sin interés
    expect(isChargePayment(PAGOS[1])).toBe(false);  // con interés
    expect(isChargePayment(PAGOS[2])).toBe(false);  // sin desglose: es de cuota
    expect(paymentGross(PAGOS[2])).toBe(525);
  });

  it('EL CASO REPORTADO: el cargo cobra lo suyo y el resto es dinero de cuotas', () => {
    const { chargePaidByDue, regular } = splitChargeAndRegularPayments(PAGOS, CARGOS);
    expect(chargePaidByDue.get(CARGO_DUE)).toBe(1500);
    // Antes estos RD$2,100 se daban por cobrados al cargo y se perdían
    expect(regular.reduce((s, e) => s + e.amount, 0)).toBe(2100);
    expect(regular).toHaveLength(4);
  });

  it('Lo pagado de más salda las cuotas siguientes, en cascada', () => {
    const { regular } = splitChargeAndRegularPayments(PAGOS, CARGOS);
    const periodos = ['2026-09-15', '2026-09-29', '2026-10-13', '2026-10-27']
      .map(dueDate => ({ dueDate, expected: 525 }));

    const { paidByPeriod, leftover } = allocatePaymentsToPeriods(periodos, regular);
    expect(periodos.map(p => paidByPeriod.get(p.dueDate)?.paid)).toEqual([525, 525, 525, 525]);
    expect(leftover).toBe(0);
    // La fecha de pago se arrastra con el dinero
    expect(paidByPeriod.get('2026-10-27')?.lastPaidDate).toBe('2026-09-22');
  });

  it('Un cargo cobrado a medias no se lleva dinero de cuotas', () => {
    const { chargePaidByDue, regular } = splitChargeAndRegularPayments(
      [{ due_date: CARGO_DUE, amount: 600, principal_amount: 600, interest_amount: 0, payment_date: '2026-09-21' }],
      CARGOS,
    );
    expect(chargePaidByDue.get(CARGO_DUE)).toBe(600);
    expect(regular).toHaveLength(0);
  });

  it('Un pago anulado o fallido no cuenta', () => {
    const { regular } = splitChargeAndRegularPayments([
      { due_date: '2026-09-29', amount: 525, interest_amount: 525, superseded_at: '2026-09-30' },
      { due_date: '2026-09-29', amount: 525, interest_amount: 525, status: 'failed' },
    ], new Map());
    expect(regular).toHaveLength(0);
  });

  it('EL CASO REPORTADO, en el balance: las 4 cuotas pagadas cuentan', () => {
    const prestamo = {
      id: 'L1', amount: 35000, interest_rate: 3, amortization_type: 'indefinite', status: 'active',
      start_date: '2026-09-01', payment_frequency: 'biweekly', monthly_payment: 525,
    };
    const cuotas = [
      { id: 'c1', installment_number: 1, due_date: '2026-09-15', total_amount: 1500, principal_amount: 1500, interest_amount: 0 },
    ];

    const b = computeLoanBalanceBreakdown(prestamo, {
      payments: PAGOS, installments: cuotas, capitalPayments: [],
    }, '2026-10-01');

    expect(b.capitalPending).toBe(35000);
    expect(b.pendingCharges).toBe(0);            // el cargo de 1,500 quedó pagado
    expect(b.interestPending).toBe(525);         // solo el período que está corriendo
    expect(b.totalBalance).toBe(35525);          // antes: 36,050 (una cuota pagada se perdía)
  });
});

describe('descuento en la tabla de amortización', () => {
  const pagos = [
    { due_date: '2026-09-29', amount: 525, discount_amount: 52.5 },
    { due_date: '2026-10-13', amount: 525, discount_amount: 0 },
    { due_date: '2026-10-27', amount: 300, discount_amount: 25 },
    { due_date: '2026-10-27', amount: 225, discount_amount: 0 },
  ];

  it('Cada cuota sabe cuánto se le perdonó y qué porcentaje fue', () => {
    const porCuota = discountsByDueDate(pagos);
    expect(porCuota.get('2026-09-29')).toEqual({ amount: 52.5, percentage: 10 });
    // Dos pagos para la misma cuota: el porcentaje es sobre lo acreditado a esa cuota
    expect(porCuota.get('2026-10-27')).toEqual({ amount: 25, percentage: 4.76 });
    expect(porCuota.has('2026-10-13')).toBe(false); // sin descuento, no se anota
  });

  it('El texto que sale en la fila', () => {
    const porCuota = discountsByDueDate(pagos);
    expect(describeDueDiscount(porCuota.get('2026-09-29'))).toBe('Descuento RD$52.50 (10%)');
    expect(describeDueDiscount(porCuota.get('2026-10-13'))).toBe('');
    expect(describeDueDiscount({ amount: 25, percentage: null })).toBe('Descuento RD$25.00');
  });
});
