// ============================================================================
// UN ABONO A CAPITAL NO RECALCULA LAS CUOTAS YA PAGADAS
// ============================================================================
// FALLO REPORTADO (2026-10-20): "en los préstamos indefinidos, cuando haces un abono a capital
// está recalculando las cuotas ya pagadas y generando nuevas aplicando el sobrante: si tengo una
// cuota de 700 y la pago, luego hago un abono y esa cuota la recalcula a 400, genera una segunda
// de 400 y le abona los 300 sobrantes. Antes del abono el préstamo debe seguir igual; es después,
// con las cuotas aún sin saldar, con las que debe trabajar".
//
// EL CASO: indefinido semanal de 45,000 con cuota de 350 (interés del período). El cliente paga
// la cuota del 22 de octubre y, el día 20, hace un abono de 15,000: el capital baja a 30,000 y la
// cuota nueva es 233.33. "Ver cuotas" enseñaba la cuota del 22 recalculada a 233.33 —PAGADA— y
// una segunda del 29 "parcial, pagado 116.67": los 350 cobrados se repartían entre dos cuotas.
//
// LA REGLA: el corte de un abono es su día, ESTIRADO hasta el último período que ya estaba
// pagado cuando se hizo. Lo cobrado antes del abono se devengó con el capital de entonces.
//
// Y no vale volver a "fecha del abono + 1 período" (lo que había antes del 2026-09-16): eso
// mantenía la cuota vieja en períodos que nadie había pagado. Lo que distingue un caso del otro
// no es la fecha, es si el período ya estaba saldado.
import { describe, it, expect } from 'vitest';

import { buildIndefiniteInterestResolver } from '@/utils/indefiniteInterest';
import { allocatePaymentsToPeriods } from '@/utils/chargeAwarePayments';

const CAPITAL = 45000;
const ABONO = 15000;
const CUOTA_VIEJA = 350;        // 45,000 × 0.77778% semanal
const CUOTA_NUEVA = 233.33;     // 30,000 × 0.77778% semanal

// Abono del 20 de octubre.
const ABONOS = [{
  amount: ABONO,
  capital_before: CAPITAL,
  capital_after: CAPITAL - ABONO,
  created_at: '2026-10-20T19:46:00.000Z',
}];

const PERIODOS = ['2026-10-22', '2026-10-29', '2026-11-05'];

const resolverCon = (regularPaid: Array<{ amount: number; paidDate?: string; dueDate?: string }>) =>
  buildIndefiniteInterestResolver({
    amount: CAPITAL,
    interestRate: 3.111111,          // mensual; semanal = /4
    frequency: 'weekly',
    currentInterest: CUOTA_NUEVA,    // `loans.monthly_payment` tras el abono
    capitalPayments: ABONOS,
    firstDueIso: '2026-10-22',
    regularPaid,
  });

describe('abono a capital en un indefinido', () => {

  it('El caso reportado: la cuota pagada ANTES del abono conserva su monto', () => {
    // El cliente pagó 350 el mismo día del abono, antes de abonar.
    const interestFor = resolverCon([
      { amount: 350, paidDate: '2026-10-20', dueDate: '2026-10-22' },
    ]);

    expect(interestFor('2026-10-22')).toBe(CUOTA_VIEJA);   // antes: 233.33
    expect(interestFor('2026-10-29')).toBe(CUOTA_NUEVA);
    expect(interestFor('2026-11-05')).toBe(CUOTA_NUEVA);
  });

  it('Y así no queda ningún sobrante que salte a la cuota siguiente', () => {
    const interestFor = resolverCon([
      { amount: 350, paidDate: '2026-10-20', dueDate: '2026-10-22' },
    ]);
    const { paidByPeriod, leftover } = allocatePaymentsToPeriods(
      PERIODOS.map(d => ({ dueDate: d, expected: interestFor(d) })),
      [{ dueDate: '2026-10-22', amount: 350, paidDate: '2026-10-20' }],
    );

    expect(paidByPeriod.get('2026-10-22')!.paid).toBe(350);   // saldada con lo que se pagó
    expect(paidByPeriod.get('2026-10-29')!.paid).toBe(0);     // antes: 116.67 "parcial"
    expect(leftover).toBe(0);
  });

  it('Sin ese dato, se repartía en dos cuotas (el fallo)', () => {
    // El comportamiento anterior: sin saber qué estaba pagado, la cuota del 22 —posterior al
    // día del abono— se recalculaba a la nueva.
    const comoAntes = buildIndefiniteInterestResolver({
      amount: CAPITAL,
      interestRate: 3.111111,
      frequency: 'weekly',
      currentInterest: CUOTA_NUEVA,
      capitalPayments: ABONOS,
    });
    expect(comoAntes('2026-10-22')).toBe(CUOTA_NUEVA);

    const { paidByPeriod } = allocatePaymentsToPeriods(
      PERIODOS.map(d => ({ dueDate: d, expected: comoAntes(d) })),
      [{ dueDate: '2026-10-22', amount: 350, paidDate: '2026-10-20' }],
    );
    expect(paidByPeriod.get('2026-10-22')!.paid).toBe(233.33);
    expect(paidByPeriod.get('2026-10-29')!.paid).toBe(116.67);   // el sobrante fantasma
  });

  it('Lo que NO estaba pagado sí pasa a la cuota nueva', () => {
    // Nadie pagó nada antes del abono: el corte es el día del abono y todos los períodos
    // posteriores —incluido el del 22— se cobran con el capital nuevo. (Es el caso que se
    // corrigió el 2026-09-16 y que no debe volver a romperse.)
    const interestFor = resolverCon([]);
    expect(interestFor('2026-10-22')).toBe(CUOTA_NUEVA);
    expect(interestFor('2026-10-29')).toBe(CUOTA_NUEVA);
  });

  it('Un período vencido y sin pagar antes del abono también pasa a la nueva', () => {
    // El cliente iba atrasado: la cuota del 22 no se pagó. Al abonar, se cobra con el capital
    // nuevo, que es lo que el usuario pidió ("con las cuotas aún sin saldar").
    const interestFor = buildIndefiniteInterestResolver({
      amount: CAPITAL,
      interestRate: 3.111111,
      frequency: 'weekly',
      currentInterest: CUOTA_NUEVA,
      capitalPayments: [{ ...ABONOS[0], created_at: '2026-11-01T19:46:00.000Z' }],
      firstDueIso: '2026-10-22',
      regularPaid: [],
    });
    expect(interestFor('2026-10-22')).toBe(CUOTA_VIEJA);   // venció ANTES del abono
    expect(interestFor('2026-11-05')).toBe(CUOTA_NUEVA);
  });

  it('Dos cuotas pagadas por adelantado conservan las dos su monto', () => {
    const interestFor = resolverCon([
      { amount: 700, paidDate: '2026-10-19', dueDate: '2026-10-22' },
    ]);
    expect(interestFor('2026-10-22')).toBe(CUOTA_VIEJA);
    expect(interestFor('2026-10-29')).toBe(CUOTA_VIEJA);
    expect(interestFor('2026-11-05')).toBe(CUOTA_NUEVA);
  });

  it('Un pago POSTERIOR al abono no estira el corte', () => {
    const interestFor = resolverCon([
      { amount: 350, paidDate: '2026-10-25', dueDate: '2026-10-22' },
    ]);
    expect(interestFor('2026-10-22')).toBe(CUOTA_NUEVA);
  });

  it('Un pago parcial no da por saldado el período', () => {
    // 200 de los 350 que valía: el período sigue sin saldar, así que se recalcula.
    const interestFor = resolverCon([
      { amount: 200, paidDate: '2026-10-20', dueDate: '2026-10-22' },
    ]);
    expect(interestFor('2026-10-22')).toBe(CUOTA_NUEVA);
  });

  it('Sin abonos a capital, todos los períodos valen la cuota vigente', () => {
    const interestFor = buildIndefiniteInterestResolver({
      amount: CAPITAL,
      interestRate: 3.111111,
      frequency: 'weekly',
      currentInterest: CUOTA_VIEJA,
      capitalPayments: [],
      firstDueIso: '2026-10-22',
      regularPaid: [{ amount: 350, paidDate: '2026-10-20', dueDate: '2026-10-22' }],
    });
    for (const d of PERIODOS) expect(interestFor(d)).toBe(CUOTA_VIEJA);
  });
});
