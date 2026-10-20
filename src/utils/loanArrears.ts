// ============================================================================
// ATRASO de un préstamo: UNA sola forma de calcularlo
// ============================================================================
// FALLO REPORTADO (2026-10-12): "dice que está al día y que tiene 0 días vencidos, pero en
// cobranza legal sale que tiene días de atraso". El mismo préstamo decía "0 días vencidos" en su
// tarjeta y "7 d · Cobranza administrativa" en la pantalla de cobranza legal, con una "próxima
// cuota" de hace dos semanas.
//
// POR QUÉ: cada pantalla lo calculaba a su manera.
//   · La tarjeta y el inicio parten de las CUOTAS y los PAGOS (`computeInstallmentDues` +
//     `overdueFromDues`): es el dato de origen y no se queda viejo.
//   · Cobranza legal hacía `hoy − loans.next_payment_date − gracia`. Esa columna la mantienen
//     triggers y se queda atrás en cuanto algo no pasa por ellos; además restarle la gracia
//     mezcla dos cosas distintas: los días de atraso son los que son, la gracia solo decide
//     cuántos de ellos generan mora.
//
// Aquí vive el cálculo, con la misma rejilla de períodos que usa el resto del sistema para los
// préstamos indefinidos, para que no vuelva a haber dos respuestas a la misma pregunta.

import { computeInstallmentDues, type IndefiniteSchedule } from './installmentDues';
import { overdueFromDues, type OverdueFacts } from './portfolioMetrics';
import {
  buildIndefiniteInterestResolver, regularPaidForResolver, type CapitalPaymentLike,
} from './indefiniteInterest';
import { getFirstDueDateIso } from './frequencyUtils';

export interface ArrearsLoanLike {
  id: string;
  status?: string | null;
  start_date?: string | null;
  monthly_payment?: number | null;
  amount?: number | null;
  interest_rate?: number | null;
  payment_frequency?: string | null;
  amortization_type?: string | null;
  grace_period_days?: number | null;
  next_payment_date?: string | null;
}

/** La agenda de períodos de un indefinido, con la cuota que corresponde a cada fecha. */
export const indefiniteScheduleFor = (
  loan: ArrearsLoanLike,
  todayIso: string,
  capitalPayments: CapitalPaymentLike[] = [],
  // Pagos y cuotas del préstamo: con ellos, una cuota que ya estaba pagada cuando se hizo un
  // abono a capital conserva su importe en vez de recalcularse (2026-10-20).
  payments: any[] = [],
  installments: any[] = [],
): IndefiniteSchedule | null => {
  if (String(loan.amortization_type || '').toLowerCase() !== 'indefinite') return null;
  if (!loan.start_date) return null;
  const frequency = String(loan.payment_frequency || 'monthly');
  return {
    startDate: String(loan.start_date),
    frequency,
    todayIso,
    periodInterest: Number(loan.monthly_payment) || undefined,
    interestForDue: capitalPayments.length > 0
      ? buildIndefiniteInterestResolver({
        amount: Number(loan.amount) || 0,
        interestRate: Number(loan.interest_rate) || 0,
        frequency,
        currentInterest: Number(loan.monthly_payment) || 0,
        capitalPayments,
        firstDueIso: getFirstDueDateIso(String(loan.start_date).split('T')[0], frequency),
        regularPaid: regularPaidForResolver(payments as any[], installments as any[]),
      })
      : undefined,
  };
};

/**
 * El atraso REAL de un préstamo, desde sus cuotas y sus pagos.
 *
 * `daysOverdue` NO descuenta los días de gracia (eso es `lateFeeDays`), igual que en la tarjeta
 * del préstamo y en el inicio.
 */
export const computeLoanArrears = (
  loan: ArrearsLoanLike,
  installments: any[],
  payments: any[],
  todayIso: string,
  capitalPayments: CapitalPaymentLike[] = [],
): OverdueFacts => {
  const schedule = indefiniteScheduleFor(loan, todayIso, capitalPayments, payments, installments);
  const dues = computeInstallmentDues(installments as never, payments as never, schedule);
  return overdueFromDues(dues, todayIso, Number(loan.grace_period_days) || 0);
};

/** Lo mismo para una cartera entera, con las cuotas y pagos ya agrupados por préstamo. */
export const computeArrearsByLoan = (
  loans: ArrearsLoanLike[],
  installmentsByLoan: Map<string, any[]>,
  paymentsByLoan: Map<string, any[]>,
  todayIso: string,
  capitalPaymentsByLoan?: Map<string, any[]>,
): Map<string, OverdueFacts> => {
  const out = new Map<string, OverdueFacts>();
  for (const loan of loans || []) {
    const id = String(loan.id);
    const rows = installmentsByLoan.get(id);
    // Sin cuotas leídas no se inventa nada: quien llama conserva lo que traía la fila.
    if (!rows || rows.length === 0) continue;
    try {
      out.set(id, computeLoanArrears(
        loan,
        rows,
        paymentsByLoan.get(id) || [],
        todayIso,
        (capitalPaymentsByLoan?.get(id) || []) as CapitalPaymentLike[],
      ));
    } catch (error) {
      console.error('[atraso] no se pudo calcular el atraso del préstamo', id, error);
    }
  }
  return out;
};
