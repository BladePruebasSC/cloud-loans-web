// "Próxima fecha de pago" de un préstamo INDEFINIDO.
//
// FALLO REPORTADO (2026-09-08): "la fecha de próximo pago no se actualizó". El préstamo
// —RD$150,000 al 3% mensual, interés de RD$4,500 por período— estaba pagado hasta el 1 de
// octubre y la tarjeta seguía diciendo "2 sept de 2026", que es la fecha de un CARGO de RD$500.
//
// CAUSA: para decidir la fecha se sumaban los pagos por `due_date` sin comprobar que esa fecha
// fuera un período REAL. Un cargo vence el día en que se creó (el 2 de septiembre), que no cae
// en la rejilla —los períodos son día 1—, así que el abono de RD$500 al cargo se leía como un
// pago PARCIAL de un período de RD$4,500. Y un parcial manda sobre todo lo demás: la fecha se
// quedaba congelada en la del cargo aunque el cliente estuviera al día.
//
// Réplica de la lógica de `calculateNextPaymentDateISO` (LoansModule) para poder fijarla con
// números concretos.
import { describe, it, expect } from 'vitest';

const addPeriodIso = (iso: string, freq: string): string => {
  const [yy, mm, dd] = String(iso).split('-').map(Number);
  const dt = new Date(yy, mm - 1, dd);
  switch (freq) {
    case 'daily': dt.setDate(dt.getDate() + 1); break;
    case 'weekly': dt.setDate(dt.getDate() + 7); break;
    case 'biweekly': dt.setDate(dt.getDate() + 14); break;
    default: dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); break;
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

interface Pago { amount: number; interest_amount: number; due_date: string }

const proximaFecha = (opts: {
  startDate: string;
  frequency: string;
  todayIso: string;
  interestPerPayment: number;
  pagos: Pago[];
  /** `false` reproduce el comportamiento anterior: cualquier fecha valía. */
  soloPeriodosReales?: boolean;
}): string | null => {
  const { startDate, frequency, todayIso, interestPerPayment, pagos } = opts;
  const soloPeriodosReales = opts.soloPeriodosReales !== false;
  const tol = 0.05;
  const firstDueFromStart = addPeriodIso(startDate, frequency);

  const dues = pagos.map(p => p.due_date).filter(Boolean).sort();
  const lastPaidDue = dues[dues.length - 1] || '';
  const limitIso = lastPaidDue > todayIso ? lastPaidDue : todayIso;

  const gridDates = new Set<string>();
  {
    let iso = firstDueFromStart;
    for (let n = 0; n < 5000; n++) {
      gridDates.add(iso);
      if (iso > limitIso) break;
      iso = addPeriodIso(iso, frequency);
    }
  }

  const paidByDue = new Map<string, number>();
  for (const p of pagos) {
    const rawDue = p.due_date;
    if (!rawDue) continue;
    if (soloPeriodosReales && !gridDates.has(rawDue)) continue;
    if (rawDue < firstDueFromStart) continue;
    const interest = Number(p.interest_amount) || 0;
    const amt = Number(p.amount) || 0;
    const paidValue = interest > 0.01 ? interest : (amt > 0.01 && amt <= interestPerPayment * 1.25 ? amt : 0);
    if (paidValue <= 0.01) continue;
    paidByDue.set(rawDue, (paidByDue.get(rawDue) || 0) + paidValue);
  }

  const fullyPaid: string[] = [];
  let partialDue: string | null = null;
  for (const [due, paid] of paidByDue.entries()) {
    if (paid <= 0.01) continue;
    if (paid + tol < interestPerPayment) partialDue = !partialDue || due < partialDue ? due : partialDue;
    else fullyPaid.push(due);
  }
  const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
  return partialDue || (maxFull ? addPeriodIso(maxFull, frequency) : firstDueFromStart) || null;
};

// El préstamo del reporte: empezó el 1 de junio, mensual, RD$4,500 de interés por período.
// Pagó jul, ago, sep y oct (este por adelantado), y además un cargo de RD$500 con fecha 2 sept.
const CASO = {
  startDate: '2026-06-01',
  frequency: 'monthly',
  todayIso: '2026-09-08',
  interestPerPayment: 4500,
  pagos: [
    { amount: 4500, interest_amount: 4500, due_date: '2026-07-01' },
    { amount: 4500, interest_amount: 4500, due_date: '2026-08-01' },
    { amount: 4500, interest_amount: 4500, due_date: '2026-09-01' },
    { amount: 500, interest_amount: 0, due_date: '2026-09-02' }, // CARGO
    { amount: 4500, interest_amount: 4500, due_date: '2026-10-01' },
  ] as Pago[],
};

describe('Próxima fecha de pago en préstamos indefinidos', () => {
  it('EL CASO REPORTADO: el abono a un cargo congelaba la fecha en la del cargo', () => {
    // Comportamiento anterior: los RD$500 del cargo se leían como pago parcial del 2 de sept.
    expect(proximaFecha({ ...CASO, soloPeriodosReales: false })).toBe('2026-09-02');
    // Ahora: solo cuentan las fechas que son un período real → la próxima es el 1 de noviembre.
    expect(proximaFecha(CASO)).toBe('2026-11-01');
  });

  it('La fecha avanza al pagar, aunque se pague por adelantado', () => {
    const base = { ...CASO, pagos: [] as Pago[] };
    expect(proximaFecha(base)).toBe('2026-07-01'); // sin pagos, la primera cuota

    const conUno = { ...base, pagos: [{ amount: 4500, interest_amount: 4500, due_date: '2026-07-01' }] };
    expect(proximaFecha(conUno)).toBe('2026-08-01');

    // Pagando hasta diciembre —muy por delante de hoy— la próxima es enero.
    const adelantado = {
      ...base,
      pagos: ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']
        .map(due => ({ amount: 4500, interest_amount: 4500, due_date: due })),
    };
    expect(proximaFecha(adelantado)).toBe('2027-01-01');
  });

  it('Un pago PARCIAL de un período sí manda: es lo que hay que terminar de cobrar', () => {
    const parcial = {
      ...CASO,
      pagos: [
        { amount: 4500, interest_amount: 4500, due_date: '2026-07-01' },
        { amount: 2000, interest_amount: 2000, due_date: '2026-08-01' }, // a medias
      ] as Pago[],
    };
    expect(proximaFecha(parcial)).toBe('2026-08-01');
  });

  it('Una fecha "clamp" anterior a la primera cuota no cuenta', () => {
    // Un pago con `due_date` anterior al primer vencimiento real no debe fijar la fecha activa.
    const conClamp = {
      ...CASO,
      pagos: [{ amount: 4500, interest_amount: 4500, due_date: '2026-05-28' }] as Pago[],
    };
    expect(proximaFecha(conClamp)).toBe('2026-07-01');
  });

  it('Varios cargos seguidos tampoco mueven la fecha', () => {
    const conCargos = {
      ...CASO,
      pagos: [
        { amount: 4500, interest_amount: 4500, due_date: '2026-07-01' },
        { amount: 500, interest_amount: 0, due_date: '2026-07-15' },
        { amount: 1200, interest_amount: 0, due_date: '2026-08-20' },
      ] as Pago[],
    };
    expect(proximaFecha(conCargos)).toBe('2026-08-01');
  });
});
