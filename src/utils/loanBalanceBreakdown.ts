import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentDateStringForSantoDomingo } from './dateUtils';
import { addPeriodsToIsoDate, getFirstDueDateIso } from './frequencyUtils';
import {
  buildIndefiniteInterestResolver, resolveIndefiniteCapital, sumCapitalPayments,
  type CapitalPaymentLike,
} from './indefiniteInterest';

export type LoanBalanceBreakdown = {
  baseBalance: number; // capital + interés (SIN cargos)
  pendingCharges: number; // cargos pendientes
  totalBalance: number; // baseBalance + pendingCharges (SIN mora)
  /** Capital que queda por pagar, sin interés ni cargos. */
  capitalPending?: number;
  /** Interés pendiente (en indefinidos: los períodos devengados hasta el que está en curso). */
  interestPending?: number;
};

export interface LoanBalanceLoan {
  id: string;
  /** Monto PRESTADO. No cambia con los abonos a capital. */
  amount: number;
  interest_rate?: number;
  term_months?: number;
  amortization_type?: string;
  next_payment_date?: string;
  start_date?: string;
  first_payment_date?: string;
  payment_frequency?: string;
  monthly_payment?: number;
  remaining_balance?: number;
}

/** Filas ya leídas de `payments`, `installments` y `capital_payments` de UN préstamo. */
export interface LoanBalanceData {
  payments: any[] | null | undefined;
  installments: any[] | null | undefined;
  capitalPayments: CapitalPaymentLike[] | null | undefined;
}

const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;

// Cargo: sin interés y monto principal = total (o solo total/amount si principal no viene)
const isChargeInst = (inst: any) => {
  const interest = Number(inst?.interest_amount ?? 0);
  const principal = Number(inst?.principal_amount ?? 0);
  const total = Number(inst?.total_amount ?? inst?.amount ?? 0);
  if (Math.abs(interest) >= 0.01 || total < 0.01) return false;
  return Math.abs(principal - total) < 0.01 || (principal < 0.01 && total > 0.01);
};

// CORRECCIÓN (auditoría 2026-08-28): esta función hacía "rollover" en la frecuencia mensual
// (31-ene + 1 mes => 03-mar, tal como documentaba su propio comentario), mientras que el motor
// de mora y el avance de `next_payment_date` RECORTAN al último día del mes (=> 28-feb). Con dos
// reglas distintas para el mismo préstamo, las fechas de período dejaban de coincidir a partir
// de cualquier mes con 31 días y el "Interés pendiente hoy" contaba períodos que la tabla de
// cuotas situaba en otra fecha. Ahora se delega en `frequencyUtils` (recorte, no rollover), que
// además soporta las frecuencias trimestral y anual.
const addPeriod = (iso: string, frequency: string): string =>
  addPeriodsToIsoDate(iso, 1, frequency);

/**
 * Balance pendiente de un préstamo a partir de sus datos YA LEÍDOS. No consulta la base.
 *
 * Es el cálculo de la tarjeta del listado, Detalles y el formulario de pago. Vive separado de
 * la consulta (2026-09-10) para que el INICIO lo use con los datos que ya carga: antes el
 * inicio sumaba las cuotas pendientes —con su redondeo de cuota a cuota— mientras la ficha
 * partía del monto prestado, y el mismo préstamo decía una cifra en cada pantalla.
 */
export function computeLoanBalanceBreakdown(
  loan: LoanBalanceLoan,
  data: LoanBalanceData,
  todayIso: string = getCurrentDateStringForSantoDomingo(),
): LoanBalanceBreakdown {
  const amort = String(loan?.amortization_type || '').toLowerCase();
  const payments = data.payments || [];
  const installments = data.installments || [];
  const capitalPayments = data.capitalPayments || [];
  const totalCapitalPayments = sumCapitalPayments(capitalPayments);

  // Paid by due_date (sum of payment.amount) - para cuotas regulares
  const paidByDue = new Map<string, number>();
  // Pagos aplicados a cargos: solo pagos con interest_amount ~ 0 (igual que LoanDetailsView)
  const paidToChargesByDue = new Map<string, number>();
  for (const p of payments) {
    const due = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
    if (!due) continue;
    const amt = round2(Number((p as any).amount) || 0);
    paidByDue.set(due, round2((paidByDue.get(due) || 0) + amt));
    if (Math.abs(Number((p as any).interest_amount || 0)) < 0.01 && amt > 0.01) {
      paidToChargesByDue.set(due, round2((paidToChargesByDue.get(due) || 0) + amt));
    }
  }

  // Pending charges: sumar todos los cargos menos lo pagado (distribuir pagos por due_date entre cargos con misma fecha)
  const chargeInstallments = installments
    .filter((inst: any) => isChargeInst(inst))
    .map((inst: any) => ({
      due: inst?.due_date ? String(inst.due_date).split('T')[0] : null,
      total: round2(Number(inst?.total_amount ?? inst?.amount ?? 0)),
      installment_number: Number(inst?.installment_number ?? 0)
    }))
    .sort((a, b) => (a.due || '').localeCompare(b.due || '') || a.installment_number - b.installment_number);
  const remainingPaidByDue = new Map<string, number>();
  for (const [k, v] of paidToChargesByDue) remainingPaidByDue.set(k, v);
  // Cuánto se llevó realmente cada fecha en CARGOS. Se necesita más abajo para no volver a
  // contar ese mismo dinero como si hubiera pagado la cuota regular del mismo día.
  const appliedToChargesByDue = new Map<string, number>();
  let pendingCharges = 0;
  for (const ch of chargeInstallments) {
    const paid = ch.due ? (remainingPaidByDue.get(ch.due) || 0) : 0;
    const applied = round2(Math.min(paid, ch.total));
    pendingCharges = round2(pendingCharges + Math.max(0, round2(ch.total - applied)));
    if (ch.due && applied > 0.01) {
      remainingPaidByDue.set(ch.due, round2(paid - applied));
      appliedToChargesByDue.set(ch.due, round2((appliedToChargesByDue.get(ch.due) || 0) + applied));
    }
  }
  pendingCharges = round2(pendingCharges);

  /**
   * Lo pagado en una fecha que corresponde a la CUOTA REGULAR de ese día.
   *
   * AQUÍ ESTABA EL FALLO. `paidByDue` suma todos los pagos de una fecha, cargos incluidos, y
   * el cálculo de abajo lo usaba tal cual para decidir cuánto se había pagado de la cuota
   * regular. Un cargo suele fecharse el mismo día que una cuota, así que al cobrarlo su
   * importe se contaba TAMBIÉN como si hubiera saldado la cuota de esa fecha: el balance
   * bajaba una cuota entera de más.
   *
   * Caso reportado: préstamo de 10,000 a 13 cuotas diarias de 836.11 con un cargo de 1,250
   * ya cobrado. El saldo real es 8,361.02 y mostraba 7,524.91 — exactamente 836.11 menos,
   * una cuota fantasma. Y no era un desfase de presentación: "A saldar" es la cifra con la
   * que se liquida el préstamo.
   *
   * Se descuenta lo que los cargos ya consumieron de esa fecha.
   */
  const paidForRegular = (due: string | null): number => {
    if (!due) return 0;
    const total = paidByDue.get(due) || 0;
    const toCharges = appliedToChargesByDue.get(due) || 0;
    return round2(Math.max(0, round2(total - toCharges)));
  };

  // Indefinite: base = capital actual + interés pendiente (por due_date)
  if (amort === 'indefinite') {
    // Due dates de cargos: no contar esos pagos como interés (evita balance/interest pendiente incorrectos)
    const chargeDueDates = new Set<string>();
    for (const inst of installments) {
      if (isChargeInst(inst)) {
        const d = (inst as any)?.due_date ? String((inst as any).due_date).split('T')[0] : null;
        if (d) chargeDueDates.add(d);
      }
    }

    // ✅ INDEFINIDOS: Siempre existe 1 cuota "activa" (puede estar parcial).
    // Normalizar pagos con due_date inválido (ej. 28-feb "clamp") hacia la cuota activa real.
    const freq = String(loan.payment_frequency || 'monthly');
    const startIso = loan.start_date ? String(loan.start_date).split('T')[0] : '';
    const firstDueFromStart = startIso ? getFirstDueDateIso(startIso, freq) : null;
    const tol = 0.05;

    // ABONOS A CAPITAL (2026-09-10). El capital es lo prestado MENOS los abonos —`loans.amount`
    // ya no se rebaja—, y la cuota de cada período depende de su fecha: la del período en que se
    // hizo el abono se devengó con el capital de antes; las siguientes, con el nuevo. Antes se
    // usaba `monthly_payment` (la cuota NUEVA) para todos, así que los períodos ya cobrados con
    // la cuota vieja parecían pagados de más.
    const { currentCapital } = resolveIndefiniteCapital(loan.amount, capitalPayments);
    const interestFor = buildIndefiniteInterestResolver({
      amount: loan.amount,
      interestRate: loan.interest_rate,
      frequency: freq,
      currentInterest: loan.monthly_payment,
      capitalPayments,
    });

    const paidByDueValid = new Map<string, number>();
    let invalidPaidTotal = 0;

    for (const p of payments) {
      const rawDue = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
      if (!rawDue) continue;
      // No contar pagos a cargos (solo principal) como interés: evita que balance pendiente baje de más
      if (chargeDueDates.has(rawDue) && (Number((p as any).interest_amount || 0) || 0) < 0.01) continue;

      const interestField = Number((p as any).interest_amount || 0) || 0;
      const principalField = Number((p as any).principal_amount || 0) || 0;
      const amt = Number((p as any).amount || 0) || 0;
      const expected = interestFor(rawDue);
      // Un pago sin interés NI capital es un pago de cuota guardado sin desglose (lo hacía el pago
      // normal en los períodos generados): todo es interés. El tope de 1.25 cuotas solo aplica a
      // los que traen capital, que podrían ser otra cosa. Sin esto, una cuota pagada por
      // adelantado con la cuota de antes del abono se ignoraba entera.
      const paidValue =
        interestField > 0.01
          ? interestField
          : (amt > 0.01 && expected > 0.01 && (principalField < 0.01 || amt <= (expected * 1.25)) ? amt : 0);
      if (paidValue <= 0.01) continue;

      if (firstDueFromStart && rawDue < firstDueFromStart) {
        invalidPaidTotal = round2(invalidPaidTotal + paidValue);
      } else {
        paidByDueValid.set(rawDue, round2((paidByDueValid.get(rawDue) || 0) + paidValue));
      }
    }

    const fullyPaid: string[] = [];
    let partialDue: string | null = null;
    for (const [due, paid] of paidByDueValid.entries()) {
      if (paid <= 0.01) continue;
      if (paid + tol < interestFor(due)) {
        partialDue = !partialDue || due < partialDue ? due : partialDue;
      } else {
        fullyPaid.push(due);
      }
    }

    const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
    const activeDue = partialDue || (maxFull ? addPeriod(maxFull, freq) : firstDueFromStart);

    let paidActive = activeDue ? (paidByDueValid.get(activeDue) || 0) : 0;
    // Reasignar pagos inválidos (28-feb) a la cuota activa real (ej. 02-abr tras pagar 02-mar)
    if (activeDue) {
      paidActive = round2(paidActive + invalidPaidTotal);
    }

    // ✅ Normalizar “overpay” en cuotas ya saldadas:
    // si por bug un pago cae en un due_date antiguo (ej. 02-mar ya pagado) y lo sobrepasa,
    // mover el excedente a la cuota activa (para que "Falta" baje correctamente).
    // También es lo que pasa con un período pagado por adelantado con la cuota vieja y que,
    // tras el abono, vale menos: lo cobrado de más se acredita a la cuota activa.
    if (activeDue) {
      let rollover = 0;
      for (const [due, paid] of paidByDueValid.entries()) {
        if (due >= activeDue) continue;
        const expected = interestFor(due);
        if (expected <= 0.01) continue;
        const capped = round2(Math.min(paid, expected));
        const overflow = round2(Math.max(0, paid - expected));
        if (overflow > 0.01) {
          rollover = round2(rollover + overflow);
          paidByDueValid.set(due, capped);
        }
      }
      if (rollover > 0.01) {
        paidActive = round2(paidActive + rollover);
      }
    }

    // Sync activeDue's full paid amount (includes invalid + rollover) into the map
    if (activeDue) {
      paidByDueValid.set(activeDue, paidActive);
    }

    // Sum ALL pending interest: iterate every period from firstDue to the first upcoming future period.
    // CORRECCIÓN (auditoría 2026-08-28): "hoy" se tomaba de la zona horaria del EQUIPO
    // (`new Date()`), no de Santo Domingo. Todo el resto del sistema (mora, estado de cuenta)
    // usa la fecha de Santo Domingo, así que en las horas de la noche el saldo pendiente y la
    // mora podían referirse a días distintos y no cuadrar entre pantallas.
    //
    // CAMBIO SOLICITADO (2026-08-28): "Interés pend. hoy" debe incluir TAMBIÉN el interés de la
    // cuota EN CURSO —la que ya está pendiente pero cuya fecha de vencimiento aún no llegó—, no
    // solo el de los períodos ya vencidos.
    //
    // Antes se cortaba en el último período vencido (`if (currentDue > todayIso) break;` ANTES de
    // sumar). Eso dejaba este panel por debajo de la tabla de cuotas, que sí lista la cuota en
    // curso: un préstamo quincenal de RD$370 con 15 cuotas vencidas mostraba RD$5,550 aquí
    // (15 × 370) mientras "Ver cuotas" totalizaba RD$5,920 (16 × 370). Dos cifras distintas para
    // lo mismo, en la misma pantalla.
    //
    // Ahora se suma el período en curso y LUEGO se corta, de modo que se incluye exactamente un
    // período futuro: el actual. Esto alinea "Interés pend. hoy", "Balance restante", el desglose
    // por antigüedad (que reconcilia su total contra este valor y coloca la diferencia en el rango
    // "Al día (aún no vence)") y la tabla de cuotas.
    let totalPendingInterest = 0;
    if (firstDueFromStart) {
      let currentDue = firstDueFromStart;
      for (let guard = 0; guard < 100000; guard++) { // tope de seguridad
        const isNotDueYet = currentDue > todayIso;
        const paid = round2(paidByDueValid.get(currentDue) || 0);
        const unpaid = round2(Math.max(0, round2(interestFor(currentDue) - paid)));
        totalPendingInterest = round2(totalPendingInterest + unpaid);
        // Se incluye el período en curso (el primero que aún no vence) y se detiene ahí:
        // los períodos posteriores todavía no se han devengado.
        if (isNotDueYet) break;
        currentDue = addPeriod(currentDue, freq);
      }
    }
    // Respaldo: en un préstamo indefinido siempre hay al menos un período devengándose, así que
    // nunca debe mostrarse RD$0 de interés pendiente. Es el de la cuota activa, descontando lo
    // que ya tenga abonado (un excedente acreditado, por ejemplo).
    if (totalPendingInterest <= 0.01 && activeDue) {
      const remainingActive = round2(Math.max(0, interestFor(activeDue) - (paidByDueValid.get(activeDue) || 0)));
      totalPendingInterest = remainingActive > 0.01 ? remainingActive : interestFor(addPeriod(activeDue, freq));
    }

    const baseBalance = round2(currentCapital + totalPendingInterest);
    const totalBalance = round2(baseBalance + pendingCharges);
    return {
      baseBalance, pendingCharges, totalBalance,
      capitalPending: round2(currentCapital), interestPending: round2(totalPendingInterest),
    };
  }

  // Fixed-term: base = capital pendiente + interés pendiente (sin cargos)
  const capitalPaidRegular = round2(
    installments
      .filter((inst: any) => !isChargeInst(inst))
      .reduce((sum: number, inst: any) => {
        const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
        if (!due) return sum;
        const totalPaid = paidForRegular(due);
        const expectedInterest = round2(Number(inst.interest_amount || 0));
        const expectedPrincipal = round2(Number(inst.principal_amount || 0));
        const principalPaid = Math.min(expectedPrincipal, Math.max(0, round2(totalPaid - expectedInterest)));
        return sum + principalPaid;
      }, 0)
  );

  const capitalPending = round2(Math.max(0, round2(Number(loan.amount || 0) - capitalPaidRegular - totalCapitalPayments)));

  const interestPending = round2(
    installments
      .filter((inst: any) => !isChargeInst(inst))
      .reduce((sum: number, inst: any) => {
        const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
        const totalPaid = paidForRegular(due);
        const expectedInterest = round2(Number(inst.interest_amount || 0));
        const interestPaid = Math.min(expectedInterest, totalPaid);
        const rem = Math.max(0, round2(expectedInterest - interestPaid));
        return sum + rem;
      }, 0)
  );

  const baseBalance = round2(capitalPending + interestPending);
  const totalBalance = round2(baseBalance + pendingCharges);
  return { baseBalance, pendingCharges, totalBalance, capitalPending, interestPending };
}

export async function getLoanBalanceBreakdown(
  supabase: SupabaseClient,
  loan: LoanBalanceLoan
): Promise<LoanBalanceBreakdown> {
  const fallback = () => {
    const value = round2(Number((loan as any)?.remaining_balance || 0));
    return { baseBalance: value, pendingCharges: 0, totalBalance: value };
  };

  const [paymentsRes, installmentsRes, capitalRes] = await Promise.all([
    supabase
      .from('payments')
      .select('amount, due_date, interest_amount, principal_amount')
      .eq('loan_id', loan.id),
    supabase
      .from('installments')
      .select('due_date, installment_number, principal_amount, interest_amount, total_amount, amount, is_paid, id')
      .eq('loan_id', loan.id),
    supabase
      .from('capital_payments')
      .select('amount, capital_before, capital_after, created_at')
      .eq('loan_id', loan.id),
  ]);

  if (paymentsRes.error || installmentsRes.error) return fallback();

  return computeLoanBalanceBreakdown(loan, {
    payments: paymentsRes.data,
    installments: installmentsRes.data,
    capitalPayments: (capitalRes.data || []) as CapitalPaymentLike[],
  });
}
