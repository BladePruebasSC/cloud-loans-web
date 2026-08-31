// ============================================================================
// REPROGRAMACIÓN DE CUOTAS (extensión de plazo) — función pura
// ============================================================================
// Fuente ÚNICA del cálculo: la vista previa de "Extensión de Plazo" y lo que
// realmente se guarda llaman a esta misma función, así que no pueden diferir.
//
// Corrige tres defectos del cálculo anterior:
//
//  1. IGNORABA LA FRECUENCIA. Usaba `(monto × tasa × plazo) / 100`, tratando el plazo como
//     si siempre fueran meses. En un préstamo QUINCENAL de RD$10,000 al 15 % mensual con 8
//     cuotas eso daba RD$12,000 de interés en vez de RD$6,000, y una cuota de RD$2,750 donde
//     correspondía RD$2,000.
//
//  2. NO RECALCULABA LAS CUOTAS EXISTENTES. Solo insertaba las nuevas, con un importe
//     distinto al del resto. El capital terminaba sobre-repartido: 6 × 1,666.67 + 2 × 2,000
//     = RD$14,000 repartidos en un préstamo de RD$10,000.
//
//  3. MEZCLABA DOS BASES DE CONTEO. La cuota se calculaba sobre `term_months + adicionales`
//     (incluye cuotas ya pagadas) mientras la vista previa mostraba "cuotas pendientes +
//     adicionales". Con cuotas pagadas, el número mostrado y el aplicado no coincidían.
//
// Ahora se re-amortiza el CAPITAL PENDIENTE sobre las cuotas pendientes + las adicionales,
// respetando el tipo de amortización, y las cuotas pagadas no se tocan (son historia).

import {
  addPeriodsToDate, formatDateLocalIso, getFrequencyRateFactor, parseIsoDateLocal,
} from './frequencyUtils';

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface InstallmentInput {
  id?: string;
  installment_number: number;
  due_date: string;
  principal_amount?: number | null;
  interest_amount?: number | null;
  total_amount?: number | null;
  amount?: number | null;
  is_paid?: boolean | null;
}

export interface ScheduleRow {
  /** Presente solo en cuotas que ya existen en la BD (hay que ACTUALIZARLAS) */
  id?: string;
  installmentNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  isNew: boolean;
}

export interface ExtendedSchedule {
  /** Cuotas pendientes tras la extensión: las existentes recalculadas + las nuevas */
  rows: ScheduleRow[];
  updatedRows: ScheduleRow[];
  newRows: ScheduleRow[];
  paidCount: number;
  pendingCountBefore: number;
  pendingCountAfter: number;
  additionalCount: number;
  outstandingCapital: number;
  periodRate: number;
  /** Cuota resultante. Con cuota uniforme (simple/francés) es el importe de todas. */
  representativePayment: number;
  /** true si todas las cuotas pendientes quedan del mismo importe */
  uniformPayment: boolean;
  /** Suma de las cuotas pendientes tras la extensión */
  totalPendingAmount: number;
  /** Interés que suman las cuotas pendientes */
  totalPendingInterest: number;
  /** `loans.total_amount` resultante (capital + interés, sin cargos) */
  newTotalAmount: number;
  /** `loans.term_months` resultante (pagadas + pendientes) */
  newTermPeriods: number;
  newEndDate: string;
  /** Explicación legible de cómo se repartieron las cuotas */
  description: string;
}

/** ¿La fila es un CARGO? (sin interés y principal = total) */
export const isChargeInstallment = (inst: InstallmentInput): boolean => {
  const interest = Math.abs(Number(inst.interest_amount || 0));
  const principal = Number(inst.principal_amount || 0);
  const total = Number(inst.total_amount ?? inst.amount ?? 0);
  return interest < 0.01 && principal > 0.01 && Math.abs(principal - total) < 0.01;
};

export interface RescheduleInput {
  /** Capital original del préstamo */
  amount: number;
  /** Tasa MENSUAL en porcentaje (como se guarda en `loans.interest_rate`) */
  interestRate: number;
  frequency: string;
  amortizationType: string;
  /** Todas las cuotas del préstamo (cargos incluidos: se filtran aquí) */
  installments: InstallmentInput[];
  /** Cuántas cuotas se agregan */
  additionalCount: number;
  /** Abonos a capital ya aplicados (reducen el capital pendiente) */
  capitalPayments?: number;
  /** Respaldo para la primera fecha si no hubiera ninguna cuota */
  fallbackDueDate?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  simple: 'interés simple', french: 'amortización francesa', german: 'amortización alemana',
  american: 'línea de crédito (solo interés)',
};

/**
 * Re-amortiza el capital pendiente sobre (cuotas pendientes + adicionales).
 * Las cuotas ya pagadas no se modifican.
 */
export const computeExtendedSchedule = (input: RescheduleInput): ExtendedSchedule => {
  const type = String(input.amortizationType || 'simple').toLowerCase();
  const additionalCount = Math.max(0, Math.floor(Number(input.additionalCount) || 0));
  const periodRate = (Number(input.interestRate) || 0) / 100 * getFrequencyRateFactor(input.frequency);

  // Un CARGO se reconoce por "sin interés y principal = total": es la única señal que existe
  // (la tabla `installments` no tiene una columna que los distinga). En un préstamo al 0 % esa
  // señal es ciega — TODAS las cuotas la cumplen — así que ahí se desactiva: confundir un cargo
  // con una cuota reparte de más, pero confundir todas las cuotas con cargos dejaría el préstamo
  // sin cuotas que reprogramar, que es un error mucho peor.
  const canDetectCharges = periodRate > 0;
  const regular = (input.installments || []).filter(i => !(canDetectCharges && isChargeInstallment(i)));
  const paid = regular.filter(i => !!i.is_paid);
  const pending = regular
    .filter(i => !i.is_paid)
    .sort((a, b) => dateOnly(a.due_date).localeCompare(dateOnly(b.due_date)) || a.installment_number - b.installment_number);

  // Capital ya asignado a cuotas pagadas + abonos directos a capital
  const capitalPaid = round2(
    paid.reduce((s, i) => s + (Number(i.principal_amount) || 0), 0) + (Number(input.capitalPayments) || 0)
  );
  const outstandingCapital = round2(Math.max(0, (Number(input.amount) || 0) - capitalPaid));

  const pendingCountAfter = pending.length + additionalCount;

  // ----- Fechas -----
  // Las cuotas pendientes conservan su fecha; las nuevas se encadenan tras la última.
  const lastKnownDue = dateOnly(
    pending.length ? pending[pending.length - 1].due_date
      : regular.length ? regular[regular.length - 1].due_date
      : input.fallbackDueDate || ''
  );
  const anchor = parseIsoDateLocal(lastKnownDue);
  const dates: string[] = pending.map(p => dateOnly(p.due_date));
  for (let k = 1; k <= additionalCount; k++) {
    dates.push(anchor ? formatDateLocalIso(addPeriodsToDate(anchor, k, input.frequency)) : lastKnownDue);
  }

  // ----- Importes según el tipo de amortización -----
  const rows: ScheduleRow[] = [];
  let balance = outstandingCapital;
  let uniform = true;

  if (pendingCountAfter > 0) {
    if (type === 'american') {
      // Solo interés; el capital completo va en la última cuota.
      const interest = round2(outstandingCapital * periodRate);
      for (let i = 0; i < pendingCountAfter; i++) {
        const isLast = i === pendingCountAfter - 1;
        const principal = isLast ? outstandingCapital : 0;
        rows.push({ installmentNumber: 0, dueDate: dates[i], principal, interest, total: round2(principal + interest), isNew: i >= pending.length });
      }
      uniform = pendingCountAfter === 1;
    } else if (type === 'french' && periodRate > 0) {
      // Cuota fija; el interés se calcula sobre el saldo insoluto.
      const n = pendingCountAfter;
      const fixed = round2(outstandingCapital * (periodRate * Math.pow(1 + periodRate, n)) / (Math.pow(1 + periodRate, n) - 1));
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        const interest = round2(balance * periodRate);
        const principal = isLast ? round2(balance) : round2(fixed - interest);
        balance = round2(balance - principal);
        rows.push({ installmentNumber: 0, dueDate: dates[i], principal, interest, total: round2(principal + interest), isNew: i >= pending.length });
      }
      uniform = true; // la cuota total es fija (salvo redondeo de la última)
    } else if (type === 'german') {
      // Capital fijo, interés sobre saldo decreciente ⇒ cuota decreciente.
      const principalPer = round2(outstandingCapital / pendingCountAfter);
      for (let i = 0; i < pendingCountAfter; i++) {
        const isLast = i === pendingCountAfter - 1;
        const interest = round2(balance * periodRate);
        const principal = isLast ? round2(balance) : principalPer;
        balance = round2(balance - principal);
        rows.push({ installmentNumber: 0, dueDate: dates[i], principal, interest, total: round2(principal + interest), isNew: i >= pending.length });
      }
      uniform = false;
    } else {
      // SIMPLE (por defecto): capital repartido en partes iguales e interés fijo por período
      // sobre el monto ORIGINAL, que es la convención con la que se generan las cuotas al
      // crear el préstamo (`generateOriginalInstallments`).
      const interest = round2((Number(input.amount) || 0) * periodRate);
      const principalPer = round2(outstandingCapital / pendingCountAfter);
      for (let i = 0; i < pendingCountAfter; i++) {
        const isLast = i === pendingCountAfter - 1;
        const principal = isLast ? round2(balance) : principalPer;
        balance = round2(balance - principal);
        rows.push({ installmentNumber: 0, dueDate: dates[i], principal, interest, total: round2(principal + interest), isNew: i >= pending.length });
      }
      uniform = true;
    }
  }

  // Numeración y vínculo con las filas existentes.
  // Las cuotas que ya existen CONSERVAN su número: renumerarlas rompería `loans.paid_installments`
  // (que guarda números de cuota) y el historial. Las nuevas continúan desde el número más alto
  // usado en el préstamo — incluidos los CARGOS, que consumen números de la misma secuencia; si
  // se numeraran solo a partir de las cuotas regulares chocarían con un cargo existente.
  const maxUsedNumber = (input.installments || []).reduce(
    (max, i) => Math.max(max, Number(i.installment_number) || 0), 0
  );
  let nextNumber = maxUsedNumber;
  rows.forEach((r, i) => {
    if (i < pending.length) {
      r.installmentNumber = pending[i].installment_number;
      r.id = pending[i].id;
    } else {
      r.installmentNumber = ++nextNumber;
    }
  });

  const updatedRows = rows.filter(r => !r.isNew);
  const newRows = rows.filter(r => r.isNew);

  const totalPendingAmount = round2(rows.reduce((s, r) => s + r.total, 0));
  const totalPendingInterest = round2(rows.reduce((s, r) => s + r.interest, 0));
  const paidTotal = round2(paid.reduce((s, i) => s + Number(i.total_amount ?? i.amount ?? 0), 0));

  const representativePayment = rows.length ? rows[0].total : 0;
  const newEndDate = dates.length ? dates[dates.length - 1] : lastKnownDue;

  const money = (v: number) => `RD$${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const typeName = TYPE_LABEL[type] || 'interés simple';
  const composicion = additionalCount > 0
    ? `las ${pendingCountAfter} cuotas pendientes (${pending.length} existentes + ${additionalCount} nuevas)`
    : `las ${pendingCountAfter} cuotas pendientes`;
  const description = pendingCountAfter === 0
    ? 'No quedan cuotas pendientes que reprogramar.'
    : uniform
      ? `El capital pendiente de ${money(outstandingCapital)} se reparte entre ${composicion} con ${typeName}. Todas quedan en ${money(representativePayment)}.`
      : `El capital pendiente de ${money(outstandingCapital)} se reparte entre ${composicion} con ${typeName}: la cuota es decreciente, desde ${money(rows[0].total)} hasta ${money(rows[rows.length - 1].total)}.`;

  return {
    rows, updatedRows, newRows,
    paidCount: paid.length,
    pendingCountBefore: pending.length,
    pendingCountAfter,
    additionalCount,
    outstandingCapital,
    periodRate,
    representativePayment,
    uniformPayment: uniform,
    totalPendingAmount,
    totalPendingInterest,
    newTotalAmount: round2(paidTotal + totalPendingAmount),
    newTermPeriods: paid.length + pendingCountAfter,
    newEndDate,
    description,
  };
};
