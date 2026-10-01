import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentDateStringForSantoDomingo } from './dateUtils';
import { addPeriodsToIsoDate, getFirstDueDateIso } from './frequencyUtils';
import {
  buildIndefiniteInterestResolver, resolveIndefiniteCapital, sumCapitalPayments,
  type CapitalPaymentLike,
} from './indefiniteInterest';
import { allocatePaymentsToPeriods, splitChargeAndRegularPayments } from './chargeAwarePayments';

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
  /** 'paid' = saldado: no debe nada, pase lo que pase con sus cuotas. */
  status?: string | null;
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
  // PRÉSTAMO SALDADO: no debe nada.
  //
  // FALLO REPORTADO (2026-09-22): un indefinido ya pagado ("Pagado" en la tarjeta, balance 0)
  // salía en el estado de cuenta con RD$20,166.32 de "Balance Restante". La rama de indefinidos
  // de abajo nunca devuelve 0 —siempre hay un período devengándose— y aquí no se miraba el
  // estado; la tarjeta sí lo miraba, así que cada pantalla decía una cosa.
  if (String(loan?.status || '').toLowerCase() === 'paid') {
    return { baseBalance: 0, pendingCharges: 0, totalBalance: 0, capitalPending: 0, interestPending: 0 };
  }

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

    // CARGO Y CUOTA EL MISMO DÍA (2026-10-01). Antes, todo lo cobrado en la fecha de un cargo
    // se descartaba aquí ("no contar pagos a cargos como interés"), así que el dinero cobrado de
    // más en ese día no bajaba el balance: el préstamo seguía debiendo cuotas ya pagadas. Ahora
    // los cargos cobran primero —hasta lo que valen— y el resto es dinero de cuotas.
    const chargeTotalByDue = new Map<string, number>();
    for (const inst of installments) {
      if (!isChargeInst(inst)) continue;
      const d = (inst as any)?.due_date ? String((inst as any).due_date).split('T')[0] : null;
      if (!d) continue;
      const total = Number((inst as any).total_amount ?? (inst as any).amount ?? 0) || 0;
      chargeTotalByDue.set(d, round2((chargeTotalByDue.get(d) || 0) + total));
    }
    const { regular: regularPaidEntries } = splitChargeAndRegularPayments(payments as any[], chargeTotalByDue);
    const totalRegularPaid = round2(regularPaidEntries.reduce((s, e) => s + e.amount, 0));

    // Períodos devengados: desde la primera cuota hasta HOY, incluido el que está EN CURSO (el
    // primero que aún no vence), y además los que el cliente ya pagó por adelantado —si no, lo
    // ya cobrado por adelantado no tendría dónde aplicarse.
    const periods: Array<{ dueDate: string; expected: number }> = [];
    if (firstDueFromStart) {
      let currentDue = firstDueFromStart;
      let acumulado = 0;
      for (let guard = 0; guard < 100000; guard++) { // tope de seguridad
        const expected = round2(interestFor(currentDue));
        periods.push({ dueDate: currentDue, expected });
        acumulado = round2(acumulado + expected);
        if (currentDue > todayIso && acumulado >= totalRegularPaid - tol) break;
        currentDue = addPeriod(currentDue, freq);
      }
    }

    const { paidByPeriod } = allocatePaymentsToPeriods(periods, regularPaidEntries);
    let totalPendingInterest = round2(periods.reduce(
      (s, p) => s + Math.max(0, round2(p.expected - (paidByPeriod.get(p.dueDate)?.paid || 0))), 0,
    ));

    // Respaldo: en un préstamo indefinido siempre hay al menos un período devengándose, así que
    // nunca debe mostrarse RD$0 de interés pendiente: el siguiente ya está corriendo.
    if (totalPendingInterest <= 0.01 && periods.length > 0) {
      totalPendingInterest = round2(interestFor(addPeriod(periods[periods.length - 1].dueDate, freq)));
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
