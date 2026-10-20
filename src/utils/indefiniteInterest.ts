// ============================================================================
// Capital e interés por período de un préstamo INDEFINIDO con abonos a capital
// ============================================================================
// Un indefinido cobra solo interés: cada período vale `capital vigente × tasa del período`.
// Cuando el cliente hace un abono a capital la cuota baja, pero NO para todos los períodos:
//
//   · una cuota que VENCE DESPUÉS del abono se cobra con la cuota nueva;
//   · una que venció antes (o el mismo día) conserva la anterior: se devengó y se cobró con el
//     capital de entonces;
//   · y una que YA ESTABA PAGADA cuando se hizo el abono conserva la anterior aunque venza más
//     tarde: lo cobrado no se recalcula (2026-10-20, ver la nota dentro del resolutor).
//
// REGLA CORREGIDA (2026-09-16): antes la cuota vieja se mantenía hasta "fecha del abono + 1
// período". Con un abono el 14 de septiembre, la cuota del 1 de octubre seguía cobrándose a
// 6,000 en vez de 4,500; y, peor, la del 1 de septiembre —pagada ANTES del abono— se recalculaba
// a la nueva, así que los 6,000 ya cobrados parecían un sobrepago de 1,500 que se acreditaba a la
// cuota siguiente ("solo debía pagar 3,000 de la segunda cuota").
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
import {
  splitChargeAndRegularPayments, type PaymentRowLike, type RegularPaidEntry,
} from './chargeAwarePayments';
import { chargeTotalsByDueDate, type InstallmentRowLike } from './loanPaidTotals';

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
  /**
   * Fecha de la PRIMERA cuota ('YYYY-MM-DD'). Hace falta —junto con `regularPaid`— para saber
   * qué períodos ya estaban saldados cuando se hizo cada abono. Sin ella, el corte es solo la
   * fecha del abono (el comportamiento anterior).
   */
  firstDueIso?: string | null;
  /**
   * Lo cobrado A CUOTAS (ya separado de los cargos), con el día en que entró el dinero.
   * `regularPaidForResolver` lo arma a partir de los pagos y las cuotas del préstamo.
   */
  regularPaid?: Array<{ amount: number; paidDate?: string | null; dueDate?: string | null }> | null;
}

/**
 * Lo cobrado a CUOTAS (sin lo que se llevaron los cargos), listo para pasárselo al resolutor.
 *
 * Es el mismo reparto que usa el resto del sistema (`splitChargeAndRegularPayments`): los cargos
 * de cada fecha cobran primero, hasta lo que valen, y el resto es dinero de cuotas.
 */
export const regularPaidForResolver = (
  payments: PaymentRowLike[] | null | undefined,
  installments: InstallmentRowLike[] | null | undefined,
): RegularPaidEntry[] =>
  splitChargeAndRegularPayments(payments || [], chargeTotalsByDueDate(installments)).regular;

/** Interés que corresponde a un período, según su fecha de vencimiento ('YYYY-MM-DD'). */
export type InterestForDue = (dueIso: string) => number;

/**
 * Devuelve el interés de cada período de un indefinido.
 *
 * Sin abonos es siempre la cuota vigente. Con abonos, un período que vence HASTA el corte del
 * abono vale el capital de ANTES por la tasa; los que vencen después, la cuota vigente. Con
 * varios abonos manda el primero cuyo corte alcance el vencimiento.
 *
 * El corte es el día del abono, estirado hasta el último período que ya estaba PAGADO cuando se
 * hizo (ver la nota de abajo): lo ya cobrado no se recalcula.
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
        // El corte es el DÍA del abono: lo que vence después ya se cobra con el capital nuevo.
        corte: fecha,
        interesAntes: Number.isFinite(antes) && antes > 0.005 ? round2(antes * ratio) : null,
      };
    })
    .filter((t): t is { corte: string; interesAntes: number } => !!t.corte && t.interesAntes !== null);

  // ──────────────────────────────────────────────────────────────────────────
  // LO YA PAGADO NO SE RECALCULA
  //
  // FALLO REPORTADO (2026-10-20): "en los indefinidos, cuando haces un abono a capital está
  // recalculando las cuotas ya pagadas: si tengo una cuota de 700 y la pago, luego hago el
  // abono y esa cuota la recalcula a 400, genera una segunda de 400 y le abona los 300
  // sobrantes. Antes del abono el préstamo debe seguir igual; es después, con las cuotas aún
  // sin saldar, con las que debe trabajar".
  //
  // El corte era solo la FECHA del abono, y una cuota que ya estaba PAGADA pero que vencía
  // después de ese día se recalculaba a la cuota nueva: lo cobrado de más se convertía en un
  // sobrante fantasma que saltaba a la cuota siguiente.
  //
  // Tampoco sirve volver a "fecha del abono + 1 período" (lo que había antes del 2026-09-16):
  // eso mantenía la cuota vieja en períodos que NADIE había pagado. Lo que distingue un caso
  // del otro no es la fecha, es si el período ya estaba saldado.
  //
  // Así que el corte de cada abono se estira hasta el último período que el dinero cobrado
  // ANTES de ese abono ya tenía cubierto. El dinero del MISMO DÍA cuenta como anterior: el
  // cliente paga su cuota y, en la misma visita, abona al capital; esa cuota se cobró con el
  // capital de antes (y así no depende de comparar horas de relojes distintos).
  const firstDue = String(input.firstDueIso || '').split('T')[0];
  const cobros = (input.regularPaid || [])
    .map(e => ({
      dia: String(e?.paidDate || e?.dueDate || '').split('T')[0],
      amount: round2(Number(e?.amount) || 0),
    }))
    .filter(e => e.dia && e.amount > 0.005);

  if (firstDue && cobros.length > 0 && tramos.length > 0) {
    const freq = String(input.frequency || 'monthly');
    // El interés que regía ANTES del abono `k`: el de un abono anterior si el período cae en su
    // tramo, y si no el de este.
    const interesAntesDe = (k: number, due: string): number => {
      for (let j = 0; j < k; j++) {
        if (due <= tramos[j].corte) return tramos[j].interesAntes;
      }
      return tramos[k].interesAntes;
    };

    for (let k = 0; k < tramos.length; k++) {
      const dinero = round2(
        cobros.reduce((s, c) => (c.dia <= tramos[k].corte ? s + c.amount : s), 0)
      );
      if (dinero <= 0.005) continue;

      let due = firstDue;
      let acumulado = 0;
      let ultimoCubierto: string | null = null;
      for (let guard = 0; guard < 5000; guard++) {
        const esperado = interesAntesDe(k, due);
        if (esperado <= 0.005) break;
        if (acumulado + esperado > dinero + 0.01) break;   // ya no alcanza: período sin saldar
        acumulado = round2(acumulado + esperado);
        ultimoCubierto = due;
        due = addPeriodsToIsoDate(due, 1, freq);
      }

      if (ultimoCubierto && ultimoCubierto > tramos[k].corte) {
        tramos[k].corte = ultimoCubierto;
      }
    }
  }

  return (dueIso: string) => {
    const due = String(dueIso || '').split('T')[0];
    for (const t of tramos) {
      if (due <= t.corte) return t.interesAntes;
    }
    return interestNow;
  };
};
