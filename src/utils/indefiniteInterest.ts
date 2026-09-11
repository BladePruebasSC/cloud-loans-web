// ============================================================================
// Capital e interés por período de un préstamo INDEFINIDO con abonos a capital
// ============================================================================
// Un indefinido cobra solo interés: cada período vale `capital vigente × tasa del período`.
// Cuando el cliente hace un abono a capital la cuota baja, pero NO para todos los períodos:
//
//   · la cuota del período en que se hizo el abono conserva el monto anterior (se devengó
//     con el capital de antes): es la regla "abono + 1 período" que ya aplicaban "Ver cuotas"
//     y el estado de cuenta;
//   · los períodos siguientes se cobran con la cuota nueva.
//
// FALLO REPORTADO (2026-09-10): "cuando se hace un abono a capital y la cuota se reevalúa, en
// pago avanzado sigue mostrando la cuota vieja y no la nueva". El pago avanzado, la mora y el
// balance tomaban el interés de la ÚNICA fila guardada en `installments` —la primera cuota,
// con el capital original— para TODOS los períodos. Un préstamo de 150,000 al 3% que bajó a
// 100,000 seguía pidiendo 4,500 por cuota en vez de 3,000.
//
// Y otro, del mismo día: "cuando se hace un abono a capital el monto prestado no debe bajar".
// El abono reescribía `loans.amount` con el capital restante, así que el monto prestado se
// perdía. Ahora `loans.amount` es SIEMPRE lo prestado y el capital vigente se deduce:
// `monto prestado − abonos`. Es lo mismo que ya hacían los préstamos a plazo fijo y la función
// SQL del balance (20260905000000), que restaba los abonos sobre un monto que ya venía rebajado.

import { addPeriodsToIsoDate, getFrequencyRateFactor } from './frequencyUtils';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Fila de `capital_payments` (los campos que importan aquí). */
export interface CapitalPaymentLike {
  amount?: number | null;
  capital_before?: number | null;
  capital_after?: number | null;
  created_at?: string | null;
}

/** Día calendario de Santo Domingo en que se registró un abono ('YYYY-MM-DD'). */
export const capitalPaymentDateIso = (createdAt?: string | null): string | null => {
  if (!createdAt) return null;
  const raw = String(createdAt);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // ya es un día calendario
  const instant = new Date(raw);
  if (isNaN(instant.getTime())) return raw.split('T')[0] || null;
  // `created_at` es un instante UTC: un abono de las 9 de la noche en Santo Domingo ya es el
  // día siguiente en UTC, y cortar el texto por la 'T' lo fechaba un día tarde.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const byCreatedAt = (a: CapitalPaymentLike, b: CapitalPaymentLike) =>
  String(a?.created_at || '').localeCompare(String(b?.created_at || ''));

/** Suma de los abonos a capital. */
export const sumCapitalPayments = (capitalPayments?: CapitalPaymentLike[] | null): number =>
  round2((capitalPayments || []).reduce((s, cp) => s + (Number(cp?.amount) || 0), 0));

/**
 * Monto prestado y capital vigente de un INDEFINIDO.
 *
 * `loans.amount` es lo prestado y no cambia; el capital vigente es lo prestado menos los
 * abonos. Los préstamos a los que la versión anterior ya les rebajó `amount` —hasta que se
 * aplique la migración 20260911000000, que lo devuelve a su valor— se reconocen porque su
 * `amount` coincide con el capital que quedó tras el último abono: en ellos restar los abonos
 * otra vez los descontaría dos veces.
 */
export const resolveIndefiniteCapital = (
  amount: number | null | undefined,
  capitalPayments?: CapitalPaymentLike[] | null,
): { lentAmount: number; currentCapital: number; capitalPaid: number } => {
  const monto = round2(Number(amount) || 0);
  const abonos = (capitalPayments || []).filter(cp => (Number(cp?.amount) || 0) > 0.005);
  const capitalPaid = sumCapitalPayments(abonos);
  if (abonos.length === 0) return { lentAmount: monto, currentCapital: monto, capitalPaid: 0 };

  const last = [...abonos].sort(byCreatedAt)[abonos.length - 1];
  const lastAfter = Number(last?.capital_after);
  const yaRebajado = Number.isFinite(lastAfter) && Math.abs(monto - lastAfter) < 0.01;

  return yaRebajado
    ? { lentAmount: round2(monto + capitalPaid), currentCapital: monto, capitalPaid }
    : { lentAmount: monto, currentCapital: round2(Math.max(0, monto - capitalPaid)), capitalPaid };
};

export interface IndefiniteInterestInput {
  /** `loans.amount` (lo prestado). */
  amount: number | null | undefined;
  /** `loans.interest_rate`: tasa MENSUAL en %. */
  interestRate: number | null | undefined;
  /** `loans.payment_frequency`. */
  frequency: string | null | undefined;
  /**
   * `loans.monthly_payment`: interés de un período con el capital VIGENTE. El abono a capital
   * lo actualiza, así que es la cuota nueva.
   */
  currentInterest?: number | null;
  capitalPayments?: CapitalPaymentLike[] | null;
}

/** Interés que corresponde a un período, según su fecha de vencimiento ('YYYY-MM-DD'). */
export type InterestForDue = (dueIso: string) => number;

/**
 * Devuelve el interés de cada período de un indefinido.
 *
 * Sin abonos es siempre la cuota vigente. Con abonos, un período que vence hasta un período
 * después del abono (`fecha del abono + 1 período`) vale el capital de ANTES por la tasa; los
 * siguientes, la cuota vigente. Con varios abonos manda el primero cuyo corte alcance la fecha.
 */
export const buildIndefiniteInterestResolver = (input: IndefiniteInterestInput): InterestForDue => {
  const abonos = (input.capitalPayments || [])
    .filter(cp => (Number(cp?.amount) || 0) > 0.005)
    .sort(byCreatedAt);
  const { currentCapital } = resolveIndefiniteCapital(input.amount, abonos);

  const periodRate = ((Number(input.interestRate) || 0) / 100) * getFrequencyRateFactor(input.frequency);
  const cuotaVigente = Number(input.currentInterest) || 0;
  // Interés por peso de capital. Se deduce de la cuota vigente cuando existe, porque así respeta
  // cómo se calculó la cuota de ese préstamo al crearlo; si no, la tasa ajustada a la frecuencia.
  const ratio = cuotaVigente > 0.005 && currentCapital > 0.005 ? cuotaVigente / currentCapital : periodRate;
  const interestNow = cuotaVigente > 0.005 ? round2(cuotaVigente) : round2(currentCapital * ratio);

  if (abonos.length === 0) return () => interestNow;

  const tramos = abonos
    .map(cp => {
      const fecha = capitalPaymentDateIso(cp.created_at);
      const antes = Number(cp.capital_before);
      return {
        corte: fecha ? addPeriodsToIsoDate(fecha, 1, input.frequency) : null,
        interesAntes: Number.isFinite(antes) && antes > 0.005 ? round2(antes * ratio) : null,
      };
    })
    .filter((t): t is { corte: string; interesAntes: number } => !!t.corte && t.interesAntes !== null);

  return (dueIso: string) => {
    const due = String(dueIso || '').split('T')[0];
    for (const t of tramos) {
      if (due <= t.corte) return t.interesAntes;
    }
    return interestNow;
  };
};
