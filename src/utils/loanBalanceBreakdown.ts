import type { SupabaseClient } from '@supabase/supabase-js';

export type LoanBalanceBreakdown = {
  baseBalance: number; // capital + interés (SIN cargos)
  pendingCharges: number; // cargos pendientes
  totalBalance: number; // baseBalance + pendingCharges (SIN mora)
};

const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;

const isChargeInst = (inst: any) =>
  Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
  Math.abs(Number(inst?.principal_amount || 0) - Number(inst?.total_amount ?? inst?.amount ?? 0)) < 0.01;

const parseIsoToLocalDate = (iso: string): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatLocalDateToIso = (dt: Date): string => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addPeriod = (iso: string, frequency: string): string => {
  const base = parseIsoToLocalDate(iso);
  if (!base) return iso;
  const freq = String(frequency || 'monthly').toLowerCase();
  const dt = new Date(base);
  switch (freq) {
    case 'daily':
      dt.setDate(dt.getDate() + 1);
      break;
    case 'weekly':
      dt.setDate(dt.getDate() + 7);
      break;
    case 'biweekly':
      dt.setDate(dt.getDate() + 14);
      break;
    case 'monthly':
    default:
      // Preservar el día del mes y dejar que JS haga rollover (ej. 30-Jan + 1 mes => 02-Mar)
      dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      break;
  }
  return formatLocalDateToIso(dt);
};

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

  // Paid by due_date (sum of payment.amount)
  const paidByDue = new Map<string, number>();
  for (const p of payments || []) {
    const due = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
    if (!due) continue;
    paidByDue.set(due, round2((paidByDue.get(due) || 0) + (Number((p as any).amount) || 0)));
  }

  // Pending charges (by due_date)
  const pendingCharges = round2(
    (installments || [])
      .filter((inst: any) => isChargeInst(inst))
      .reduce((sum: number, inst: any) => {
        const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
        const total = round2(Number(inst?.total_amount ?? inst?.amount ?? 0));
        const paid = due ? (paidByDue.get(due) || 0) : 0;
        return sum + Math.max(0, round2(total - paid));
      }, 0)
  );

  // Indefinite: base = capital actual + interés pendiente (por due_date)
  if (amort === 'indefinite') {
    // ✅ INDEFINIDOS: Siempre existe 1 cuota “activa” (puede estar parcial).
    // Normalizar pagos con due_date inválido (ej. 28-feb “clamp”) hacia la cuota activa real.
    const freq = String(loan.payment_frequency || 'monthly');
    const startIso = loan.start_date ? String(loan.start_date).split('T')[0] : '';
    const firstDueFromStart = startIso ? addPeriod(startIso, freq) : null;
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

    let pendingInterest = round2(Math.max(0, round2(interestPerPayment - paidActive)));
    // Si ya se pagó completo, el próximo período vuelve a ser el mismo interés
    if (pendingInterest <= 0.01 && interestPerPayment > 0.01) {
      pendingInterest = interestPerPayment;
    }

    const baseBalance = round2((Number(loan.amount || 0)) + pendingInterest);
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
        const totalPaid = paidByDue.get(due) || 0;
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
        const totalPaid = due ? (paidByDue.get(due) || 0) : 0;
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

