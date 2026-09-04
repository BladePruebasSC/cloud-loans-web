import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentDateStringForSantoDomingo } from './dateUtils';
import { addPeriodsToIsoDate, getFirstDueDateIso } from './frequencyUtils';

export type LoanBalanceBreakdown = {
  baseBalance: number; // capital + interés (SIN cargos)
  pendingCharges: number; // cargos pendientes
  totalBalance: number; // baseBalance + pendingCharges (SIN mora)
};

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

export async function getLoanBalanceBreakdown(
  supabase: SupabaseClient,
  loan: {
    id: string;
    amount: number;
    interest_rate?: number;
    term_months?: number;
    amortization_type?: string;
    next_payment_date?: string;
    start_date?: string;
    first_payment_date?: string;
    payment_frequency?: string;
  }
): Promise<LoanBalanceBreakdown> {
  const amort = String(loan?.amortization_type || '').toLowerCase();

  // Payments
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('amount, due_date, interest_amount, principal_amount')
    .eq('loan_id', loan.id);
  if (paymentsError) {
    const fallback = round2(Number((loan as any)?.remaining_balance || 0));
    return { baseBalance: fallback, pendingCharges: 0, totalBalance: fallback };
  }

  // Installments
  const { data: installments, error: installmentsError } = await supabase
    .from('installments')
    .select('due_date, installment_number, principal_amount, interest_amount, total_amount, amount, is_paid, id')
    .eq('loan_id', loan.id);
  if (installmentsError) {
    const fallback = round2(Number((loan as any)?.remaining_balance || 0));
    return { baseBalance: fallback, pendingCharges: 0, totalBalance: fallback };
  }

  // Capital payments
  const { data: capitalPayments } = await supabase
    .from('capital_payments')
    .select('amount')
    .eq('loan_id', loan.id);
  const totalCapitalPayments = round2((capitalPayments || []).reduce((s: number, cp: any) => s + (Number(cp?.amount) || 0), 0));

  // Paid by due_date (sum of payment.amount) - para cuotas regulares
  const paidByDue = new Map<string, number>();
  // Pagos aplicados a cargos: solo pagos con interest_amount ~ 0 (igual que LoanDetailsView)
  const paidToChargesByDue = new Map<string, number>();
  for (const p of payments || []) {
    const due = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
    if (!due) continue;
    const amt = round2(Number((p as any).amount) || 0);
    paidByDue.set(due, round2((paidByDue.get(due) || 0) + amt));
    if (Math.abs(Number((p as any).interest_amount || 0)) < 0.01 && amt > 0.01) {
      paidToChargesByDue.set(due, round2((paidToChargesByDue.get(due) || 0) + amt));
    }
  }

  // Pending charges: sumar todos los cargos menos lo pagado (distribuir pagos por due_date entre cargos con misma fecha)
  const chargeInstallments = (installments || [])
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
    for (const inst of installments || []) {
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

    const interestPerPayment =
      round2(Number((loan as any)?.monthly_payment || 0)) > 0.01
        ? round2(Number((loan as any)?.monthly_payment))
        : round2((Number(loan.amount || 0) * (Number(loan.interest_rate || 0) / 100)) || 0);

    const paidByDueValid = new Map<string, number>();
    let invalidPaidTotal = 0;

    for (const p of payments || []) {
      const rawDue = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
      if (!rawDue) continue;
      // No contar pagos a cargos (solo principal) como interés: evita que balance pendiente baje de más
      if (chargeDueDates.has(rawDue) && (Number((p as any).interest_amount || 0) || 0) < 0.01) continue;

      const interestField = Number((p as any).interest_amount || 0) || 0;
      const amt = Number((p as any).amount || 0) || 0;
      const paidValue =
        interestField > 0.01
          ? interestField
          : (amt > 0.01 && interestPerPayment > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
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
      if (paid + tol < interestPerPayment) {
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
    if (activeDue && interestPerPayment > 0.01) {
      let rollover = 0;
      for (const [due, paid] of paidByDueValid.entries()) {
        if (due >= activeDue) continue;
        const capped = round2(Math.min(paid, interestPerPayment));
        const overflow = round2(Math.max(0, paid - interestPerPayment));
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
    const todayIso = getCurrentDateStringForSantoDomingo();

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
    if (firstDueFromStart && interestPerPayment > 0.01) {
      let currentDue = firstDueFromStart;
      while (true) {
        const isNotDueYet = currentDue > todayIso;
        const paid = round2(paidByDueValid.get(currentDue) || 0);
        const unpaid = round2(Math.max(0, round2(interestPerPayment - paid)));
        totalPendingInterest = round2(totalPendingInterest + unpaid);
        // Se incluye el período en curso (el primero que aún no vence) y se detiene ahí:
        // los períodos posteriores todavía no se han devengado.
        if (isNotDueYet) break;
        currentDue = addPeriod(currentDue, freq);
      }
    }
    // Respaldo: en un préstamo indefinido siempre hay al menos un período devengándose, así que
    // nunca debe mostrarse RD$0 de interés pendiente.
    if (totalPendingInterest <= 0.01 && interestPerPayment > 0.01) {
      totalPendingInterest = interestPerPayment;
    }

    const baseBalance = round2((Number(loan.amount || 0)) + totalPendingInterest);
    const totalBalance = round2(baseBalance + pendingCharges);
    return { baseBalance, pendingCharges, totalBalance };
  }

  // Fixed-term: base = capital pendiente + interés pendiente (sin cargos)
  const capitalPaidRegular = round2(
    (installments || [])
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
    (installments || [])
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
  return { baseBalance, pendingCharges, totalBalance };
}

