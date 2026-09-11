// Abono a capital en un préstamo INDEFINIDO y condonación de mora.
//
// FALLOS REPORTADOS (2026-09-10):
//
//   1. "Cuando se hace un abono a capital y la cuota se reevalúa, en pago avanzado sigue
//      mostrando la cuota vieja y no la nueva." Préstamo de 150,000 al 3% mensual (4,500 por
//      cuota); el 9 de septiembre abona 50,000 y la cuota pasa a 3,000. El pago avanzado seguía
//      pidiendo 4,500 por la cuota del 1 de diciembre: con 3,000 pagados le quedaban "1,500
//      pendientes" que no se debían.
//
//   2. "Cuando se hace un abono a capital el monto prestado no debe bajar, el balance pendiente
//      sí." El abono reescribía `loans.amount` con el capital restante (150,000 → 100,000).
//
//   3. "Cuando se elimina la mora no se están eliminando los días atrasados, elimínalos junto a
//      la mora aunque la cuota esté vencida."
import { describe, it, expect, vi } from 'vitest';

// El motor de mora importa el cliente de Supabase, que en Node no puede crearse (usa
// `localStorage`). Con los datos precargados no hace ninguna consulta.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  buildIndefiniteInterestResolver, capitalPaymentDateIso, resolveIndefiniteCapital,
} from '../indefiniteInterest';
import { computeInstallmentDues, type RawInstallment, type RawPayment } from '../installmentDues';
import { overdueFromDues } from '../portfolioMetrics';
import { computeLoanBalanceBreakdown } from '../loanBalanceBreakdown';
import { getLateFeeBreakdownFromInstallments, type LoanData } from '../installmentLateFeeCalculator';

// ---------------------------------------------------------------------------
// El préstamo del reporte
// ---------------------------------------------------------------------------
// 150,000 al 3% mensual, empezó el 1 de agosto: la primera cuota venció el 1 de septiembre.
// El 9 de septiembre a las 3:25 p. m. (19:25 UTC) abonó 50,000.
const ABONO = {
  amount: 50000,
  capital_before: 150000,
  capital_after: 100000,
  created_at: '2026-09-09T19:25:00+00:00',
};
const HOY = '2026-09-10';

const FILA_GUARDADA: RawInstallment = {
  id: 'fila-1',
  installment_number: 1,
  due_date: '2026-09-01',
  total_amount: 4500,
  principal_amount: 0,
  interest_amount: 4500,
  paid_amount: 0,
  is_paid: true,
};

// Los pagos, tal como están en el historial. Los dos últimos se registraron desde el pago
// normal, que en un período generado los guardaba sin desglose (interés 0, capital 0).
const PAGOS: RawPayment[] = [
  { amount: 4500, principal_amount: 0, interest_amount: 4500, due_date: '2026-09-01' },
  { amount: 4500, principal_amount: 0, interest_amount: 4500, due_date: '2026-10-01' },
  { amount: 4500, principal_amount: 0, interest_amount: 0, due_date: '2026-11-01' },
  { amount: 3000, principal_amount: 0, interest_amount: 0, due_date: '2026-12-01' },
];

describe('capital vigente de un indefinido', () => {
  it('El monto prestado NO baja: el capital vigente es lo prestado menos los abonos', () => {
    expect(resolveIndefiniteCapital(150000, [ABONO])).toEqual({
      lentAmount: 150000, currentCapital: 100000, capitalPaid: 50000,
    });
  });

  it('Un préstamo que la versión anterior ya rebajó no descuenta el abono dos veces', () => {
    // `amount` quedó en 100,000 = capital tras el último abono. Hasta que la migración lo
    // devuelva a 150,000, el capital vigente es ese mismo número, no 50,000.
    expect(resolveIndefiniteCapital(100000, [ABONO])).toEqual({
      lentAmount: 150000, currentCapital: 100000, capitalPaid: 50000,
    });
  });

  it('Sin abonos, lo prestado es el capital', () => {
    expect(resolveIndefiniteCapital(150000, [])).toEqual({
      lentAmount: 150000, currentCapital: 150000, capitalPaid: 0,
    });
  });
});

describe('cuota de cada período tras un abono', () => {
  const cuotaDe = buildIndefiniteInterestResolver({
    amount: 150000, interestRate: 3, frequency: 'monthly', currentInterest: 3000, capitalPayments: [ABONO],
  });

  it('La cuota del período en que se abonó se queda con el capital de antes', () => {
    // Abono el 9-sep → corte el 9-oct: la cuota del 1-oct se devengó con 150,000.
    expect(cuotaDe('2026-09-01')).toBe(4500);
    expect(cuotaDe('2026-10-01')).toBe(4500);
  });

  it('EL CASO REPORTADO: las siguientes ya son de 3,000', () => {
    expect(cuotaDe('2026-11-01')).toBe(3000);
    expect(cuotaDe('2026-12-01')).toBe(3000);
    expect(cuotaDe('2027-01-01')).toBe(3000);
  });

  it('Da lo mismo con el monto todavía rebajado (antes de la migración)', () => {
    const legado = buildIndefiniteInterestResolver({
      amount: 100000, interestRate: 3, frequency: 'monthly', currentInterest: 3000, capitalPayments: [ABONO],
    });
    expect(['2026-10-01', '2026-11-01', '2026-12-01'].map(legado)).toEqual([4500, 3000, 3000]);
  });

  it('Respeta la frecuencia: en un quincenal la cuota es la mitad de la tasa mensual', () => {
    const quincenal = buildIndefiniteInterestResolver({
      amount: 150000, interestRate: 3, frequency: 'biweekly', currentInterest: 1500,
      capitalPayments: [{ ...ABONO, created_at: '2026-09-09T19:25:00+00:00' }],
    });
    // Corte: 9-sep + 14 días = 23-sep.
    expect(quincenal('2026-09-15')).toBe(2250);
    expect(quincenal('2026-09-29')).toBe(1500);
  });

  it('La fecha del abono es la de Santo Domingo, no la de UTC', () => {
    // 9:30 p. m. del 9 en Santo Domingo ya es el 10 en UTC.
    expect(capitalPaymentDateIso('2026-09-10T01:30:00+00:00')).toBe('2026-09-09');
    expect(capitalPaymentDateIso('2026-09-09')).toBe('2026-09-09');
  });
});

describe('pago avanzado de un indefinido con abono', () => {
  const agenda = { startDate: '2026-08-01', frequency: 'monthly', todayIso: HOY, periodInterest: 3000 };

  it('Antes: la cuota de diciembre salía de 4,500 con 1,500 "pendientes"', () => {
    const filas = computeInstallmentDues([FILA_GUARDADA], PAGOS, agenda);
    const diciembre = filas.find(r => r.dueDate === '2026-12-01')!;
    expect(diciembre.total).toBe(4500); // el fallo, tal cual
    expect(diciembre.pending).toBe(1500);
  });

  it('EL CASO REPORTADO: diciembre es de 3,000 y queda saldada', () => {
    const cuotaDe = buildIndefiniteInterestResolver({
      amount: 150000, interestRate: 3, frequency: 'monthly', currentInterest: 3000, capitalPayments: [ABONO],
    });
    const filas = computeInstallmentDues([FILA_GUARDADA], PAGOS, { ...agenda, interestForDue: cuotaDe });

    const porFecha = new Map(filas.map(r => [r.dueDate, r]));
    expect(porFecha.get('2026-10-01')!.total).toBe(4500);
    expect(porFecha.get('2026-11-01')!.total).toBe(3000);
    expect(porFecha.get('2026-12-01')!.total).toBe(3000);
    expect(porFecha.get('2026-12-01')!.pending).toBe(0);

    // Noviembre se pagó por adelantado con la cuota vieja: los 1,500 de más se acreditan a la
    // próxima cuota, que queda con 1,500 pendientes.
    const pendientes = filas.filter(r => r.pending > 0.005);
    expect(pendientes.map(r => [r.dueDate, r.total, r.pending])).toEqual([['2027-01-01', 3000, 1500]]);
  });
});

describe('balance de un indefinido con abono', () => {
  const prestamo = {
    id: 'L1', amount: 150000, interest_rate: 3, amortization_type: 'indefinite',
    start_date: '2026-08-01', payment_frequency: 'monthly', monthly_payment: 3000,
  };
  const pagos = PAGOS.map(p => ({ ...p }));
  const cuotas = [FILA_GUARDADA];

  it('Capital 100,000 + lo que falta de la próxima cuota, igual que el pago avanzado', () => {
    const b = computeLoanBalanceBreakdown(prestamo, { payments: pagos, installments: cuotas, capitalPayments: [ABONO] }, HOY);
    expect(b.capitalPending).toBe(100000);
    expect(b.interestPending).toBe(1500);
    expect(b.totalBalance).toBe(101500);
  });

  it('El mismo resultado con el monto aún rebajado', () => {
    const b = computeLoanBalanceBreakdown({ ...prestamo, amount: 100000 }, {
      payments: pagos, installments: cuotas, capitalPayments: [ABONO],
    }, HOY);
    expect(b.totalBalance).toBe(101500);
  });

  it('Sin abonos no cambia: capital + la cuota en curso', () => {
    const b = computeLoanBalanceBreakdown({ ...prestamo, monthly_payment: 4500 }, {
      payments: [PAGOS[0]], installments: cuotas, capitalPayments: [],
    }, HOY);
    expect(b.totalBalance).toBe(154500);
  });
});

describe('días de atraso tras condonar la mora', () => {
  it('Se cuentan desde la condonación, aunque la cuota siga vencida', () => {
    const vencida = [{ dueDate: '2026-08-01', pending: 1100, overdueSince: '2026-09-10' }];

    const hoy = overdueFromDues(vencida, '2026-09-10');
    expect(hoy.daysOverdue).toBe(0);
    expect(hoy.overdueAmount).toBe(1100); // el dinero se sigue debiendo
    expect(hoy.oldestOverdueDate).toBe('2026-08-01');

    expect(overdueFromDues(vencida, '2026-09-11').daysOverdue).toBe(1);
  });

  it('Una cuota sin condonar conserva sus días', () => {
    const facts = overdueFromDues([
      { dueDate: '2026-08-01', pending: 1100, overdueSince: '2026-09-10' },
      { dueDate: '2026-08-20', pending: 1100 },
    ], '2026-09-10');
    expect(facts.daysOverdue).toBe(21);
  });

  it('`computeInstallmentDues` lleva la fecha de la condonación a cada cuota', () => {
    const filas = computeInstallmentDues([
      { id: 'c1', installment_number: 1, due_date: '2026-08-01', total_amount: 1100, principal_amount: 1000, interest_amount: 100, late_fee_waived_at: '2026-09-10' },
      { id: 'c2', installment_number: 2, due_date: '2026-09-01', total_amount: 1100, principal_amount: 1000, interest_amount: 100 },
    ], []);
    expect(filas.map(r => r.overdueSince)).toEqual(['2026-09-10', '2026-09-01']);
  });

  it('En un indefinido la condonación vale para todos sus períodos', () => {
    const filas = computeInstallmentDues(
      [{ ...FILA_GUARDADA, due_date: '2026-08-01', is_paid: false, late_fee_waived_at: '2026-09-10' }],
      [],
      { startDate: '2026-07-01', frequency: 'monthly', todayIso: HOY },
    );
    expect(filas.map(r => [r.dueDate, r.overdueSince])).toEqual([
      ['2026-08-01', '2026-09-10'],
      ['2026-09-01', '2026-09-10'],
    ]);
    expect(overdueFromDues(filas, HOY).daysOverdue).toBe(0);
  });
});

describe('motor de mora: días y mora tras la condonación', () => {
  const dia = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 10, 0, 0);
  };

  const plazoFijo: LoanData = {
    id: 'L2', remaining_balance: 1100, next_payment_date: '2026-08-01', late_fee_rate: 1,
    grace_period_days: 0, late_fee_calculation_type: 'daily', late_fee_enabled: true,
    amount: 1000, term: 1, payment_frequency: 'monthly', amortization_type: 'simple',
  };
  const cuota = {
    id: 'c1', installment_number: 1, due_date: '2026-08-01', principal_amount: 1000,
    interest_amount: 100, total_amount: 1100, is_paid: false,
    // 40 días × 1% de 1,000 = 400 de mora, condonada entera el 10 de septiembre.
    late_fee_paid: 400, late_fee_waived_at: '2026-09-10',
  };

  it('EL CASO REPORTADO: el día de la condonación, 0 mora y 0 días', async () => {
    const r = await getLateFeeBreakdownFromInstallments('L2', plazoFijo, dia('2026-09-10'), {
      installments: [cuota], payments: [], capitalPayments: [],
    });
    expect(r.totalLateFee).toBe(0);
    expect(r.breakdown[0].daysOverdue).toBe(0); // antes: 40
  });

  it('Al día siguiente vuelven a contar los dos desde cero', async () => {
    const r = await getLateFeeBreakdownFromInstallments('L2', plazoFijo, dia('2026-09-11'), {
      installments: [cuota], payments: [], capitalPayments: [],
    });
    expect(r.breakdown[0].daysOverdue).toBe(1);
    expect(r.totalLateFee).toBe(10); // un día de mora
  });

  it('Sin condonación los días siguen siendo los del vencimiento', async () => {
    const r = await getLateFeeBreakdownFromInstallments('L2', plazoFijo, dia('2026-09-10'), {
      installments: [{ ...cuota, late_fee_paid: 0, late_fee_waived_at: null }], payments: [], capitalPayments: [],
    });
    expect(r.breakdown[0].daysOverdue).toBe(40);
    expect(r.totalLateFee).toBe(400);
  });

  it('Indefinido: la condonación reinicia los días de todos los períodos vencidos', async () => {
    const indefinido: LoanData = {
      ...plazoFijo, id: 'L3', amortization_type: 'indefinite', start_date: '2026-07-01',
      late_fee_rate: 1.25, amount: 25000, interest_rate: 5, monthly_payment: 1250,
    };
    // Agosto: 1,250 × 1.25% × 40 = 625; septiembre: 1,250 × 1.25% × 9 = 140.63.
    const fila = {
      id: 'i1', installment_number: 1, due_date: '2026-08-01', principal_amount: 0,
      interest_amount: 1250, total_amount: 1250, is_paid: false,
      late_fee_paid: 765.63, late_fee_waived_at: '2026-09-10',
    };

    const hoy = await getLateFeeBreakdownFromInstallments('L3', indefinido, dia('2026-09-10'), {
      installments: [fila], payments: [], capitalPayments: [],
    });
    expect(Math.round(hoy.totalLateFee * 100) / 100).toBe(0);
    const vencidas = hoy.breakdown.filter(b => !b.isPaid && b.dueDate < '2026-09-10');
    expect(vencidas.map(b => b.daysOverdue)).toEqual([0, 0]);

    const manana = await getLateFeeBreakdownFromInstallments('L3', indefinido, dia('2026-09-11'), {
      installments: [fila], payments: [], capitalPayments: [],
    });
    expect(Math.max(...manana.breakdown.filter(b => !b.isPaid).map(b => b.daysOverdue))).toBe(1);
    expect(Math.round(manana.totalLateFee * 100) / 100).toBe(31.25); // 2 períodos × 1 día
  });
});
