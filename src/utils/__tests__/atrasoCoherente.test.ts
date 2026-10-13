// El atraso de un préstamo se calcula UNA sola vez y todas las pantallas dicen lo mismo.
//
// FALLO REPORTADO (2026-10-12): "dice que está al día y que tiene 0 días vencidos, pero en
// cobranza legal sale que tiene días de atraso; también en detalles sale que tiene cobranza legal
// y si voy a abono a capital no sale bloqueado pero al guardar me da un error de cuotas vencidas".
//
// EL PRÉSTAMO DE LAS CAPTURAS: OMAR SANTANA, diario, 1,000 al 5%, 30 cuotas de 12.04, con las
// cuotas cobradas al día. La tarjeta decía "0 días vencidos" y cobranza legal "7 d · Cobranza
// administrativa", porque esa pantalla medía con `loans.next_payment_date` —cacheada y vieja— y
// encima le restaba la gracia.
import { describe, it, expect } from 'vitest';
import { computeLoanArrears } from '../loanArrears';
import { stageFromDaysOverdue, DEFAULT_COLLECTION_THRESHOLDS } from '../legalWorkflow';

const HOY = '2026-10-12';

const PRESTAMO = {
  id: 'L1',
  status: 'active',
  start_date: '2026-09-14',
  amount: 1000,
  interest_rate: 5,
  monthly_payment: 12.04,
  payment_frequency: 'daily',
  amortization_type: 'simple',
  grace_period_days: 2,
  // La columna cacheada se quedó en una fecha vieja: es justo el dato en el que no hay que fiarse.
  next_payment_date: '2026-10-03',
};

/** Cuotas diarias desde el 15-sep; las que ya vencieron están cobradas. */
const cuotas = (desde: string, cuantas: number) => Array.from({ length: cuantas }, (_, i) => {
  const d = new Date(Date.UTC(
    Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)) + i,
  ));
  const iso = d.toISOString().split('T')[0];
  return {
    id: `I${i + 1}`, loan_id: 'L1', installment_number: i + 1, due_date: iso,
    total_amount: 12.04, principal_amount: 8.7, interest_amount: 3.34, paid_amount: 0, is_paid: false,
  };
});

const pagosHasta = (cuotasLista: any[], hastaIso: string) => cuotasLista
  .filter(c => c.due_date <= hastaIso)
  .map((c, i) => ({
    id: `P${i + 1}`, loan_id: 'L1', due_date: c.due_date, amount: 12.04,
    principal_amount: 8.7, interest_amount: 3.34, payment_date: c.due_date,
  }));

describe('Atraso real desde las cuotas', () => {
  it('EL CASO REPORTADO: con todo cobrado hasta hoy, cero días de atraso', () => {
    const lista = cuotas('2026-09-15', 30);
    const pagos = pagosHasta(lista, HOY);
    const facts = computeLoanArrears(PRESTAMO, lista, pagos, HOY);

    expect(facts.daysOverdue).toBe(0);
    expect(facts.overdueAmount).toBe(0);
    // Y la próxima cuota es la de mañana, no la fecha vieja de la columna.
    expect(facts.nextDueDate).toBe('2026-10-13');

    // La fórmula vieja (hoy − next_payment_date − gracia) daba una semana de atraso:
    const vieja = Math.max(0, Math.round(
      (Date.parse(HOY) - Date.parse(PRESTAMO.next_payment_date)) / 86400000,
    ) - PRESTAMO.grace_period_days);
    expect(vieja).toBe(7);
  });

  it('Con cuotas sin cobrar, el atraso es el de la MÁS ANTIGUA y no descuenta la gracia', () => {
    const lista = cuotas('2026-09-15', 30);
    // Se deja de pagar desde el 2 de octubre: la más antigua sin cobrar tiene 10 días.
    const pagos = pagosHasta(lista, '2026-10-01');
    const facts = computeLoanArrears(PRESTAMO, lista, pagos, HOY);

    expect(facts.daysOverdue).toBe(10);
    expect(facts.lateFeeDays).toBe(8); // 10 − 2 de gracia: la gracia solo afecta a la mora
    expect(facts.overdueAmount).toBeGreaterThan(0);
    expect(facts.oldestOverdueDate).toBe('2026-10-02');
  });

  it('Un préstamo sin cuotas leídas no inventa un atraso', () => {
    const facts = computeLoanArrears(PRESTAMO, [], [], HOY);
    expect(facts.daysOverdue).toBe(0);
  });
});

describe('La etapa de cobranza sale del atraso real', () => {
  const t = DEFAULT_COLLECTION_THRESHOLDS; // 3 · 8 · 30 · 60

  it('EL CASO REPORTADO: al día, no "Cobranza administrativa"', () => {
    expect(stageFromDaysOverdue(0, 2, t)).toBe('al_dia');
  });

  it('La escalera completa, con 2 días de gracia', () => {
    expect(stageFromDaysOverdue(1, 2, t)).toBe('cuota_vencida');  // dentro de la gracia
    expect(stageFromDaysOverdue(2, 2, t)).toBe('cuota_vencida');
    expect(stageFromDaysOverdue(3, 2, t)).toBe('mora');           // 1 día con mora
    expect(stageFromDaysOverdue(5, 2, t)).toBe('cobranza_preventiva');   // 3
    expect(stageFromDaysOverdue(10, 2, t)).toBe('cobranza_administrativa'); // 8
    expect(stageFromDaysOverdue(32, 2, t)).toBe('cobranza_intensiva');   // 30
    expect(stageFromDaysOverdue(62, 2, t)).toBe('pre_legal');            // 60
  });

  it('Un caso legal abierto manda sobre todo', () => {
    expect(stageFromDaysOverdue(0, 2, t, true)).toBe('legal');
    expect(stageFromDaysOverdue(100, 2, t, true)).toBe('legal');
  });

  it('Respeta los umbrales que configure la empresa', () => {
    const propios = { preventive: 1, administrative: 2, intensive: 3, prelegal: 4 };
    expect(stageFromDaysOverdue(3, 0, propios)).toBe('cobranza_intensiva');
    expect(stageFromDaysOverdue(4, 0, propios)).toBe('pre_legal');
  });
});
