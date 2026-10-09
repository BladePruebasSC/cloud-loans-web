// ============================================================================
// ABONO A CAPITAL: cuotas realmente pendientes y vista previa del nuevo balance
// ============================================================================
// FALLO REPORTADO (2026-10-09): en un préstamo DIARIO de 10,000 al 20% con cuota de 400 y 18
// cuotas ya cobradas, el abono a capital decía "Tiene 2 cuota(s) vencida(s)" —y bloqueaba el
// formulario— aunque la tarjeta dijera "0 días vencidos" y las tablas enseñaran todas las cuotas
// hasta hoy pagadas. Y al escribir un monto, el "nuevo balance" se disparaba: con 1,000 de abono
// pasaba de RD$4,800 a más de RD$10,000.
//
// DOS CAUSAS:
//
// 1. CUOTAS VENCIDAS CON EL `is_paid` DE LA BASE. El resto de la aplicación (ver cuotas, estado
//    de cuenta, inicio, pago avanzado) NO se fía de esa columna: reparte los pagos por fecha de
//    vencimiento y deduce qué está saldado (`computeInstallmentDues`). Dos cuotas cobradas hoy
//    cuyo `is_paid` se quedó sin actualizar se contaban como vencidas.
//
// 2. LA TASA SIN EL FACTOR DE LA FRECUENCIA. `loans.interest_rate` es MENSUAL por convención del
//    sistema (ver `frequencyUtils.getPeriodRate` y la prueba `interestPerInstallment.test.ts`).
//    El abono calculaba el interés de cada cuota como `capital × tasa / 100`, que en un préstamo
//    diario es TREINTA veces el interés real: 3,000 × 20% = 600 por cuota en vez de 20. Encima
//    el capital por cuota salía de `cuota − monto × tasa / 100` = 400 − 2,000 = NEGATIVO, así que
//    el número de cuotas nuevas tampoco tenía sentido.
//
// Aquí vive el cálculo, en funciones puras y probadas, para que la vista previa, el balance que
// se enseña y lo que se guarda salgan todos del mismo sitio.

import { getPeriodRate } from './frequencyUtils';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Interés que devenga UN período sobre un capital, respetando la frecuencia de pago. */
export const periodInterestFor = (
  capital: number, monthlyRatePercent: number, frequency?: string | null,
): number => round2((Number(capital) || 0) * getPeriodRate(Number(monthlyRatePercent) || 0, frequency));

export interface CapitalPaymentPreviewInput {
  /** Tipo de amortización del préstamo ('indefinite' u otro) */
  amortizationType?: string | null;
  /** Tasa MENSUAL guardada en el préstamo (%) */
  interestRate: number;
  frequency?: string | null;
  /** Cuota vigente del préstamo */
  monthlyPayment: number;
  /** Capital pendiente ANTES del abono */
  pendingCapitalBefore: number;
  /** Lo que se abona al capital (sin la penalidad) */
  capitalPaymentAmount: number;
  /** Cuántas cuotas REGULARES quedan realmente por cobrar (sin cargos, deducidas de los pagos) */
  pendingInstallmentsCount: number;
  /** Cargos pendientes: siguen debiéndose después del abono */
  unpaidChargesAmount?: number;
  /** true = mantener el número de cuotas y bajar su monto; false = mantener la cuota y acortar */
  keepInstallments?: boolean;
  /**
   * INDEFINIDOS: interés de un período por cada peso de capital. Se deduce de la cuota vigente
   * para respetar cómo se calculó (ver `indefiniteInterestRatio` en LoanUpdateForm).
   */
  indefiniteRatio?: number;
}

export interface CapitalPaymentPreviewResult {
  /** Capital pendiente después del abono */
  capitalAfter: number;
  /** Interés de cada cuota después del abono */
  interestPerInstallment: number;
  /** Cuota completa después del abono (capital + interés) */
  newInstallmentAmount: number;
  /** Cuántas cuotas quedarán */
  newInstallmentCount: number;
  /** Cuántas cuotas se eliminan (solo cuando se mantiene el monto de la cuota) */
  removedInstallments: number;
  /** Interés que queda por cobrar en las cuotas que quedan */
  interestPending: number;
  /** Balance después del abono: capital + interés pendiente + cargos pendientes */
  newBalance: number;
  /** El abono supera el capital pendiente */
  exceedsCapital: boolean;
}

/**
 * Qué pasa con el préstamo si se abona `capitalPaymentAmount` al capital.
 *
 * El balance resultante es el mismo criterio que usa el resto del sistema:
 * capital pendiente + interés de las cuotas que queden + cargos pendientes.
 */
export const computeCapitalPaymentPreview = (
  input: CapitalPaymentPreviewInput,
): CapitalPaymentPreviewResult => {
  const before = round2(input.pendingCapitalBefore);
  const abono = round2(input.capitalPaymentAmount);
  const cargos = round2(input.unpaidChargesAmount || 0);
  const pendingCount = Math.max(0, Math.floor(Number(input.pendingInstallmentsCount) || 0));
  const esIndefinido = String(input.amortizationType || '').toLowerCase() === 'indefinite';

  if (abono > before + 0.005) {
    return {
      capitalAfter: 0, interestPerInstallment: 0, newInstallmentAmount: 0, newInstallmentCount: 0,
      removedInstallments: 0, interestPending: 0, newBalance: 0, exceedsCapital: true,
    };
  }

  const capitalAfter = round2(Math.max(0, before - abono));

  // ---------------------------------------------------------------------
  // INDEFINIDO: la cuota es solo interés y baja con el capital.
  // ---------------------------------------------------------------------
  if (esIndefinido) {
    const ratio = Number(input.indefiniteRatio) > 0
      ? Number(input.indefiniteRatio)
      : getPeriodRate(input.interestRate, input.frequency);
    const interes = round2(capitalAfter * ratio);
    return {
      capitalAfter,
      interestPerInstallment: interes,
      newInstallmentAmount: interes,
      newInstallmentCount: 0, // un indefinido no tiene un número de cuotas
      removedInstallments: 0,
      // Siempre hay un período corriendo: el interés pendiente es el de la próxima cuota.
      interestPending: interes,
      newBalance: round2(capitalAfter + interes + cargos),
      exceedsCapital: false,
    };
  }

  // ---------------------------------------------------------------------
  // PLAZO FIJO
  // ---------------------------------------------------------------------
  // AQUÍ ESTABA EL FALLO: `capital × tasa / 100` cobraba la tasa de un MES en cada cuota.
  const interesPorCuota = periodInterestFor(capitalAfter, input.interestRate, input.frequency);

  if (capitalAfter <= 0.005) {
    // El abono salda el capital: no quedan cuotas regulares, solo los cargos pendientes.
    return {
      capitalAfter: 0, interestPerInstallment: 0, newInstallmentAmount: 0, newInstallmentCount: 0,
      removedInstallments: pendingCount, interestPending: 0,
      newBalance: round2(cargos), exceedsCapital: false,
    };
  }

  if (input.keepInstallments) {
    // Se mantienen las cuotas y baja su monto.
    const capitalPorCuota = pendingCount > 0 ? round2(capitalAfter / pendingCount) : 0;
    const cuota = round2(capitalPorCuota + interesPorCuota);
    const interesPendiente = round2(interesPorCuota * pendingCount);
    return {
      capitalAfter,
      interestPerInstallment: interesPorCuota,
      newInstallmentAmount: cuota,
      newInstallmentCount: pendingCount,
      removedInstallments: 0,
      interestPending: interesPendiente,
      newBalance: round2(capitalAfter + interesPendiente + cargos),
      exceedsCapital: false,
    };
  }

  // Se mantiene la cuota y se acorta el préstamo. El capital de cada cuota es lo que queda de la
  // cuota después del interés (antes se restaba el interés de TODO el monto prestado, que daba
  // un capital por cuota negativo).
  const cuota = round2(Number(input.monthlyPayment) || 0);
  const capitalPorCuota = round2(Math.max(0, cuota - interesPorCuota));
  const nuevasCuotas = capitalPorCuota > 0.005
    ? Math.ceil(round2(capitalAfter / capitalPorCuota) - 0.0001)
    : pendingCount;
  const cuotasFinales = Math.max(1, Math.min(nuevasCuotas, Math.max(pendingCount, 1)));
  const interesPendiente = round2(interesPorCuota * cuotasFinales);

  return {
    capitalAfter,
    interestPerInstallment: interesPorCuota,
    newInstallmentAmount: cuota,
    newInstallmentCount: cuotasFinales,
    removedInstallments: Math.max(0, pendingCount - cuotasFinales),
    interestPending: interesPendiente,
    newBalance: round2(capitalAfter + interesPendiente + cargos),
    exceedsCapital: false,
  };
};

export interface DueLikeRow {
  dueDate: string;
  pending: number;
  isCharge?: boolean;
}

/**
 * Cuotas VENCIDAS de verdad: las que ya pasaron de su vencimiento (más la gracia) y siguen
 * debiendo algo, según el reparto de los pagos —no según `installments.is_paid`.
 *
 * Es el dato con el que el abono a capital decide si bloquea: tiene que decir lo mismo que
 * "0 días vencidos" de la tarjeta del préstamo.
 */
export const countOverdueDues = (
  dues: DueLikeRow[] | null | undefined,
  todayIso: string,
  graceDays = 0,
): number => {
  const hoy = String(todayIso || '').split('T')[0];
  if (!hoy) return 0;
  const gracia = Math.max(0, Number(graceDays) || 0);
  const diasDeAtraso = (dueIso: string): number => {
    const [dy, dm, dd] = dueIso.split('-').map(Number);
    const [ty, tm, td] = hoy.split('-').map(Number);
    if (!dy || !ty) return 0;
    const due = Date.UTC(dy, (dm || 1) - 1, dd || 1);
    const today = Date.UTC(ty, (tm || 1) - 1, td || 1);
    return Math.floor((today - due) / 86400000);
  };

  return (dues || []).filter(row => {
    if ((Number(row?.pending) || 0) <= 0.005) return false;
    const due = String(row?.dueDate || '').split('T')[0];
    if (!due) return false;
    return diasDeAtraso(due) > gracia;
  }).length;
};
