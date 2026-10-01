// Préstamo INDEFINIDO: los datos deben moverse al cobrar, también después de eliminar un pago.
//
// FALLO REPORTADO (2026-10-01): "los préstamos indefinidos dan problemas cuando se elimina un pago:
// cuando elimino un pago los siguientes los 'procesa' pero los datos no se actualizan; por más que
// realizo pago y las tablas de amortización las muestran, el balance restante, el total pagado,
// etc. no cambian".
//
// EL PRÉSTAMO DE LAS CAPTURAS: indefinido quincenal, capital 35,000, cuota 525, un cargo de 1,500
// con vencimiento el mismo día que la primera cuota (15-sep) y 1,500 + 6 cuotas de 525 cobrados.
// "Ver cuotas" decía "Total Pagado RD$4,650" (correcto) y "Detalles" decía "RD$1,575".
import { describe, it, expect } from 'vitest';
import { computeLoanPaidTotals, paidPeriodsFromMoney, chargeTotalsByDueDate } from '../loanPaidTotals';
import { computeLoanBalanceBreakdown } from '../loanBalanceBreakdown';
import { discountsByDueDateSplit, describeDueDiscount } from '../paymentDiscount';

const HOY = '2026-10-01';

const PRESTAMO = {
  id: 'prestamo-miguel',
  amount: 35000,
  interest_rate: 1.5,
  payment_frequency: 'biweekly',
  start_date: '2026-09-01',
  monthly_payment: 525,
  amortization_type: 'indefinite',
  status: 'active',
  term_months: 12,
};

/** Una fila regular (la única real de un indefinido) y el cargo, los dos el 15-sep. */
const INSTALLMENTS = [
  {
    id: 'cuota-1', installment_number: 1, due_date: '2026-09-15',
    principal_amount: 0, interest_amount: 525, total_amount: 525, amount: 525, is_paid: true,
  },
  {
    id: 'cargo-1', installment_number: 2, due_date: '2026-09-15',
    principal_amount: 1500, interest_amount: 0, total_amount: 1500, amount: 1500, is_paid: true,
  },
];

/**
 * Los cobros. OJO con los tres que van SIN desglose (capital 0, interés 0): así los guardaba el
 * pago normal sobre un período generado, y es justo lo que no se estaba contando.
 */
const PAGOS = [
  // El cargo, con un descuento de 280
  {
    id: 'p-cargo', due_date: '2026-09-15', amount: 1500, principal_amount: 1500, interest_amount: 0,
    payment_date: '2026-09-22', discount_amount: 280,
  },
  { id: 'p1', due_date: '2026-09-15', amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
  { id: 'p2', due_date: '2026-09-29', amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
  { id: 'p3', due_date: '2026-10-13', amount: 525, principal_amount: 0, interest_amount: 0, payment_date: '2026-09-22' },
  { id: 'p4', due_date: '2026-10-27', amount: 525, principal_amount: 0, interest_amount: 525, payment_date: '2026-09-23' },
  { id: 'p5', due_date: '2026-11-10', amount: 525, principal_amount: 0, interest_amount: 525, payment_date: '2026-10-01' },
  { id: 'p6', due_date: '2026-11-24', amount: 525, principal_amount: 0, interest_amount: 525, payment_date: '2026-10-01' },
];

const totales = (pagos: any[]) => computeLoanPaidTotals({
  isIndefinite: true, payments: pagos, installments: INSTALLMENTS, capitalPayments: [],
});

const balance = (pagos: any[]) => computeLoanBalanceBreakdown(
  PRESTAMO as any,
  { payments: pagos as any[], installments: INSTALLMENTS as any[], capitalPayments: [] },
  HOY,
);

describe('Indefinido: lo cobrado y el balance se mueven con cada pago', () => {
  it('EL CASO REPORTADO: "Total pagado" es 4,650, no 1,575', () => {
    const t = totales(PAGOS);
    expect(t.chargesPaid).toBe(1500);   // el cargo, cobrado completo
    expect(t.interestPaid).toBe(3150);  // 6 cuotas de 525, incluidas las guardadas sin desglose
    expect(t.principalPaid).toBe(0);    // un indefinido no amortiza capital
    expect(t.totalPaid).toBe(4650);     // lo mismo que dice "Ver cuotas"
  });

  it('Lo que se cobró de más el día del cargo NO se lo queda el cargo', () => {
    // 15-sep: 1,500 del cargo + 525 de la cuota. El cargo solo vale 1,500.
    const t = totales(PAGOS);
    expect(t.chargePaidByDue.get('2026-09-15')).toBe(1500);
    expect(chargeTotalsByDueDate(INSTALLMENTS).get('2026-09-15')).toBe(1500);
  });

  it('Cada cobro sube "Total pagado" (antes se quedaba clavado)', () => {
    const sinElUltimo = PAGOS.filter(p => p.id !== 'p6');
    expect(totales(sinElUltimo).totalPaid).toBe(4125);
    expect(totales(PAGOS).totalPaid).toBe(4650);
  });

  it('TRAS ELIMINAR UN PAGO: los períodos saldados bajan y vuelven a subir al cobrar', () => {
    // Antes se contaba `interest_amount`, así que los pagos sin desglose valían 0 y
    // `paid_installments` no se movía por más que se cobrara.
    expect(paidPeriodsFromMoney(totales(PAGOS).interestPaid, 525)).toBe(6);

    const traSBorrar = PAGOS.filter(p => p.id !== 'p3');
    expect(paidPeriodsFromMoney(totales(traSBorrar).interestPaid, 525)).toBe(5);

    const traSCobrarDeNuevo = [...traSBorrar, {
      id: 'p7', due_date: '2026-10-13', amount: 525, principal_amount: 0, interest_amount: 525,
      payment_date: '2026-10-02',
    }];
    expect(paidPeriodsFromMoney(totales(traSCobrarDeNuevo).interestPaid, 525)).toBe(6);
  });

  it('El balance es capital + el período que está corriendo (35,525), igual en todas las pantallas', () => {
    const b = balance(PAGOS);
    expect(b.capitalPending).toBe(35000);
    expect(b.interestPending).toBe(525);
    expect(b.totalBalance).toBe(35525);
    // Y cuadra con el total del préstamo que enseña Detalles: capital + interés cobrado +
    // interés pendiente + cargos − lo pagado.
    const t = totales(PAGOS);
    const totalDelPrestamo = 35000 + t.interestPaid + b.interestPending + 1500;
    expect(totalDelPrestamo - t.totalPaid).toBe(b.totalBalance);
  });

  it('Un pago anulado por una extensión de plazo no cuenta', () => {
    const conAnulado = PAGOS.map(p => p.id === 'p6' ? { ...p, superseded_at: '2026-10-01T10:00:00Z' } : p);
    expect(totales(conAnulado).totalPaid).toBe(4125);
    expect(balance(conAnulado).totalBalance).toBe(35525);
  });

  it('El descuento sale en la fila del CARGO, no repetido en la cuota del mismo día', () => {
    const d = discountsByDueDateSplit(PAGOS as any[]);
    expect(describeDueDiscount(d.charges.get('2026-09-15'))).toBe('Descuento RD$280.00 (18.67%)');
    expect(describeDueDiscount(d.regular.get('2026-09-15'))).toBe('');
  });
});

describe('paidPeriodsFromMoney', () => {
  it('Cuenta períodos enteros y aguanta el redondeo de la cuota', () => {
    expect(paidPeriodsFromMoney(0, 525)).toBe(0);
    expect(paidPeriodsFromMoney(519, 525)).toBe(0);
    expect(paidPeriodsFromMoney(525, 525)).toBe(1);
    // Misma tolerancia que antes (el 1% de la cuota): 519.75 saldaba el período.
    expect(paidPeriodsFromMoney(519.75, 525)).toBe(1);
    expect(paidPeriodsFromMoney(1049.95, 525)).toBe(2); // 5 centavos de menos: la cuota está saldada
    expect(paidPeriodsFromMoney(3150, 525)).toBe(6);
    expect(paidPeriodsFromMoney(1000, 0)).toBe(0);      // sin cuota no hay nada que contar
  });
});

describe('No indefinido: el cargo no se cuenta como capital del préstamo', () => {
  const INST_FIJO = [
    { id: 'c1', installment_number: 1, due_date: '2026-09-15', principal_amount: 800, interest_amount: 200, total_amount: 1000 },
    { id: 'cargo', installment_number: 2, due_date: '2026-09-15', principal_amount: 500, interest_amount: 0, total_amount: 500 },
  ];
  const PAGOS_FIJO = [
    { id: 'a', due_date: '2026-09-15', amount: 1000, principal_amount: 800, interest_amount: 200 },
    { id: 'b', due_date: '2026-09-15', amount: 500, principal_amount: 500, interest_amount: 0 }, // el cargo
  ];

  it('Capital pagado 800, cargo 500, total 1,500', () => {
    const t = computeLoanPaidTotals({
      isIndefinite: false, payments: PAGOS_FIJO, installments: INST_FIJO, capitalPayments: [{ amount: 2000 }],
    });
    expect(t.principalPaid).toBe(800);
    expect(t.interestPaid).toBe(200);
    expect(t.chargesPaid).toBe(500);
    expect(t.capitalPaid).toBe(2000);
    expect(t.totalPaid).toBe(3500);
  });
});
