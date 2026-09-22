// ============================================================================
// AGENDA DE COBROS: todos los cobros de cada préstamo, no solo el siguiente
// ============================================================================
// CAMBIO SOLICITADO (2026-09-22): "la agenda solo muestra el siguiente cobro de un préstamo,
// bien, pero necesito que muestre todos los siguientes cobros, no solo el siguiente: si el
// préstamo es a 12 meses, que en los siguientes 12 meses salga el cobro de ese préstamo".
//
// QUÉ FALLABA en el calendario del listado de préstamos:
//   · el plazo se leía como `term_months || 12` y un INDEFINIDO (que guarda 1 sola cuota) daba
//     un único cobro, marcado además como "ÚLTIMO" — un indefinido no tiene último pago;
//   · los meses se sumaban como 30 DÍAS, así que las fechas se desplazaban un poco cada mes;
//   · el número de cuota se adivinaba con `(total - balance) / cuota`, que con cargos, mora o
//     abonos a capital da cualquier cosa.
//
// AHORA las fechas se generan con la misma aritmética de períodos que las cuotas guardadas, el
// número de cuota se cuenta desde la primera, y un indefinido genera cobros mientras dure la
// ventana que se le pida.

import {
  addPeriodsToIsoDate, countElapsedPeriods, getFirstDueDateIso, normalizeFrequency,
} from './frequencyUtils';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface AgendaLoanLike {
  id: string;
  status?: string | null;
  start_date?: string | null;
  first_payment_date?: string | null;
  next_payment_date?: string | null;
  end_date?: string | null;
  term_months?: number | null;
  payment_frequency?: string | null;
  amortization_type?: string | null;
  monthly_payment?: number | null;
  remaining_balance?: number | null;
}

export interface AgendaEvent<T = AgendaLoanLike> {
  loan: T;
  loanId: string;
  /** Día del cobro, 'YYYY-MM-DD' */
  dueDate: string;
  amount: number;
  /** Número de cuota, contando desde la primera del préstamo */
  number: number;
  /** Cuántas cuotas tiene el préstamo; `null` en los indefinidos */
  total: number | null;
  isLast: boolean;
  isOverdue: boolean;
  isIndefinite: boolean;
}

export interface AgendaWindow {
  /** Primer día que interesa, 'YYYY-MM-DD' */
  fromIso: string;
  /** Último día que interesa, 'YYYY-MM-DD' */
  toIso: string;
  todayIso: string;
  /** Tope de cobros por préstamo, por si la ventana fuera enorme */
  maxPerLoan?: number;
}

/** Un préstamo aporta cobros mientras esté vivo y deba algo. */
export const loanIsCollectable = (loan: AgendaLoanLike): boolean => {
  const status = String(loan?.status || '').toLowerCase();
  if (status !== 'active' && status !== 'overdue') return false;
  // `remaining_balance` puede venir sin definir: eso no es motivo para esconder el préstamo.
  const balance = loan?.remaining_balance;
  return balance === null || balance === undefined || Number(balance) > 0.005;
};

/**
 * Todos los cobros de UN préstamo dentro de la ventana pedida.
 *
 * Arranca en la próxima cuota pendiente (`next_payment_date`), así que incluye las vencidas que
 * siguen sin pagarse, y sigue período a período hasta agotar el plazo (o hasta el final de la
 * ventana, en un indefinido).
 */
export const buildLoanAgenda = <T extends AgendaLoanLike>(
  loan: T, window: AgendaWindow,
): Array<AgendaEvent<T>> => {
  if (!loanIsCollectable(loan)) return [];

  const frequency = normalizeFrequency(loan.payment_frequency);
  const start = dateOnly(loan.start_date);
  const firstDue = dateOnly(loan.first_payment_date) || (start ? getFirstDueDateIso(start, frequency) : '');
  const nextDue = dateOnly(loan.next_payment_date) || firstDue;
  if (!nextDue) return [];

  const isIndefinite = String(loan.amortization_type || '').toLowerCase() === 'indefinite';
  const term = Number(loan.term_months) || 0;
  // Un indefinido no tiene plazo; uno a plazo fijo sin `term_months` tampoco se puede limitar.
  const total = isIndefinite || term <= 0 ? null : term;

  // Número de la primera cuota que se va a generar: cuántas quedaron detrás de `nextDue`.
  const firstNumber = firstDue ? countElapsedPeriods(firstDue, nextDue, frequency) || 1 : 1;
  const amount = round2(Number(loan.monthly_payment) || 0);
  const maxPerLoan = window.maxPerLoan ?? 400;

  const events: Array<AgendaEvent<T>> = [];
  for (let n = 0; n < maxPerLoan; n++) {
    const dueDate = addPeriodsToIsoDate(nextDue, n, frequency);
    if (dueDate > window.toIso) break;
    const number = firstNumber + n;
    if (total !== null && number > total) break;

    if (dueDate >= window.fromIso) {
      events.push({
        loan, loanId: String(loan.id), dueDate, amount, number, total,
        isLast: total !== null && number === total,
        isOverdue: dueDate < window.todayIso,
        isIndefinite,
      });
    }
    // Sin plazo y con la última cuota ya fuera de la ventana no hay nada más que generar.
    if (total !== null && number === total) break;
  }
  return events;
};

/** La agenda completa, ordenada por fecha (y por cliente dentro del mismo día). */
export const buildCollectionAgenda = <T extends AgendaLoanLike>(
  loans: T[], window: AgendaWindow,
): Array<AgendaEvent<T>> =>
  (loans || [])
    .flatMap(loan => buildLoanAgenda(loan, window))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.loanId.localeCompare(b.loanId));

/** Agrupa la agenda por día ('YYYY-MM-DD'), para pintarla en un calendario. */
export const agendaByDay = <T extends AgendaLoanLike>(
  events: Array<AgendaEvent<T>>,
): Map<string, Array<AgendaEvent<T>>> => {
  const out = new Map<string, Array<AgendaEvent<T>>>();
  for (const e of events) {
    const list = out.get(e.dueDate);
    if (list) list.push(e); else out.set(e.dueDate, [e]);
  }
  return out;
};

/** Lo que se espera cobrar en un rango de fechas (ambos extremos incluidos). */
export const agendaTotal = <T extends AgendaLoanLike>(
  events: Array<AgendaEvent<T>>, fromIso: string, toIso: string,
): number => round2(events
  .filter(e => e.dueDate >= fromIso && e.dueDate <= toIso)
  .reduce((s, e) => s + e.amount, 0));
