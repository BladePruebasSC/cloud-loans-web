// ============================================================================
// LO COBRADO de un préstamo: cargos, interés, capital y abonos
// ============================================================================
// FALLO REPORTADO (2026-10-01): "los préstamos indefinidos dan problemas cuando se elimina un
// pago: los siguientes los 'procesa' pero los datos no se actualizan; por más que realizo pagos y
// las tablas de amortización los muestran, el balance restante, el total pagado, etc. no cambian".
//
// Préstamo indefinido quincenal de 35,000 (cuota 525) con un cargo de 1,500: "Ver cuotas" decía
// "Total Pagado RD$4,650" (lo correcto: 1,500 del cargo + 6 cuotas de 525) mientras "Detalles"
// decía "Total Pagado RD$1,575" y no se movía al cobrar.
//
// POR QUÉ: "Detalles" sumaba `payments.interest_amount`, y un pago registrado sobre un período
// GENERADO (los indefinidos solo tienen una fila real en `installments`) se guardaba sin desglose
// —capital 0 e interés 0—. Esos pagos valían 0 en "Interés pagado", en "Total pagado" y en el
// porcentaje pagado, aunque sí aparecían en las tablas de amortización. Encima, lo cobrado a los
// CARGOS se medía con `principal_amount || amount`: como el capital de esos pagos es 0, el `||`
// tomaba el monto completo y una cuota cobrada el mismo día que un cargo se daba por dinero del
// cargo (y ahí se perdía).
//
// AQUÍ se calcula una sola vez, con el mismo reparto que usan las tablas de amortización
// (`chargeAwarePayments`): los cargos de cada fecha cobran primero —hasta lo que valen— y el
// resto es dinero de cuotas. En un indefinido ese resto es interés, que es de lo que vive la
// cuota. Así "Detalles" y "Ver cuotas" dicen lo mismo.

import {
  isChargePayment, paymentGross, splitChargeAndRegularPayments, type PaymentRowLike,
} from './chargeAwarePayments';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface InstallmentRowLike {
  due_date?: string | null;
  total_amount?: number | null;
  amount?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
}

/** Monto de una cuota/cargo (tolerante a las filas que solo traen `amount`). */
export const installmentTotal = (inst: InstallmentRowLike | null | undefined): number => {
  const total = Number(inst?.total_amount ?? inst?.amount);
  if (Number.isFinite(total) && Math.abs(total) > 0.005) return round2(total);
  return round2((Number(inst?.principal_amount) || 0) + (Number(inst?.interest_amount) || 0));
};

/** ¿La fila es un CARGO? No lleva interés y su capital es todo el monto. */
export const isChargeInstallment = (inst: InstallmentRowLike | null | undefined): boolean =>
  Math.abs(Number(inst?.interest_amount) || 0) < 0.01
  && Math.abs((Number(inst?.principal_amount) || 0) - installmentTotal(inst)) < 0.01;

/** Cuánto suman los CARGOS de cada fecha de vencimiento. */
export const chargeTotalsByDueDate = (
  installments: InstallmentRowLike[] | null | undefined,
): Map<string, number> => {
  const map = new Map<string, number>();
  for (const inst of installments || []) {
    if (!isChargeInstallment(inst)) continue;
    const due = dateOnly(inst?.due_date);
    if (!due) continue;
    map.set(due, round2((map.get(due) || 0) + installmentTotal(inst)));
  }
  return map;
};

export interface LoanPaidTotals {
  /** Dinero cobrado a los cargos (nunca más de lo que valen) */
  chargesPaid: number;
  /** Lo cobrado a los cargos de cada fecha */
  chargePaidByDue: Map<string, number>;
  /** Interés cobrado en cuotas (en un indefinido, todo el dinero de cuotas) */
  interestPaid: number;
  /** Capital cobrado en cuotas (sin cargos y sin abonos) */
  principalPaid: number;
  /** Abonos a capital */
  capitalPaid: number;
  /** Todo el dinero acreditado al préstamo: cargos + interés + capital + abonos */
  totalPaid: number;
}

export interface LoanPaidTotalsInput {
  /** Préstamo indefinido: los períodos se generan y los pagos pueden venir sin desglose */
  isIndefinite: boolean;
  payments: PaymentRowLike[] | null | undefined;
  installments: InstallmentRowLike[] | null | undefined;
  /** Abonos a capital (`capital_payments`) */
  capitalPayments?: Array<{ amount?: number | null }> | null;
}

/**
 * Lo cobrado de un préstamo, separado por concepto.
 *
 * Un pago a un CARGO no es capital del préstamo (el cargo es aparte), así que no suma en
 * "Capital pagado"; sí suma en "Total pagado", porque es dinero cobrado y el total del préstamo
 * también incluye los cargos.
 */
export const computeLoanPaidTotals = ({
  isIndefinite, payments, installments, capitalPayments,
}: LoanPaidTotalsInput): LoanPaidTotals => {
  const chargeTotalByDue = chargeTotalsByDueDate(installments);
  const { chargePaidByDue, regular } = splitChargeAndRegularPayments(
    (payments || []) as PaymentRowLike[], chargeTotalByDue,
  );

  let chargesPaid = 0;
  for (const monto of chargePaidByDue.values()) chargesPaid = round2(chargesPaid + monto);

  const capitalPaid = round2((capitalPayments || []).reduce((s, cp) => s + (Number(cp?.amount) || 0), 0));

  let interestPaid: number;
  let principalPaid: number;

  if (isIndefinite) {
    // La cuota de un indefinido es interés: todo el dinero que no es de un cargo es interés.
    // (Así se cuentan también los pagos guardados sin desglose.)
    interestPaid = round2(regular.reduce((s, e) => s + (Number(e.amount) || 0), 0));
    principalPaid = 0;
  } else {
    // En los demás tipos el pago SÍ trae su desglose (la cuota existe en `installments`).
    const deCuotas = ((payments || []) as PaymentRowLike[]).filter(p => !isChargePayment(p));
    interestPaid = round2(deCuotas.reduce((s, p) => s + (Number(p?.interest_amount) || 0), 0));
    principalPaid = round2(deCuotas.reduce((s, p) => s + (Number(p?.principal_amount) || 0), 0));
  }

  return {
    chargesPaid,
    chargePaidByDue,
    interestPaid,
    principalPaid,
    capitalPaid,
    totalPaid: round2(chargesPaid + interestPaid + principalPaid + capitalPaid),
  };
};

/**
 * Cuántos períodos saldó el dinero de cuotas de un indefinido.
 *
 * Se usa al eliminar un pago para dejar `loans.paid_installments` como corresponde: antes se
 * acumulaba `interest_amount`, así que los pagos sin desglose contaban 0 y al borrar un pago las
 * cuotas siguientes volvían a "pendiente" aunque estuvieran cobradas.
 */
export const paidPeriodsFromMoney = (money: number, cuota: number): number => {
  const valor = round2(Number(cuota) || 0);
  if (valor <= 0.005) return 0;
  const dinero = round2(Number(money) || 0);
  if (dinero <= 0.005) return 0;
  // Un centavo de tolerancia por período (la cuota puede venir redondeada).
  return Math.max(0, Math.floor(round2(dinero + valor * 0.01) / valor));
};

/** El dinero de cuotas (sin lo de los cargos) de una lista de pagos. */
export const regularMoneyOf = (
  payments: PaymentRowLike[] | null | undefined,
  installments: InstallmentRowLike[] | null | undefined,
): number => {
  const { regular } = splitChargeAndRegularPayments(
    (payments || []) as PaymentRowLike[], chargeTotalsByDueDate(installments),
  );
  return round2(regular.reduce((s, e) => s + (Number(e.amount) || 0), 0));
};

/** Lo cobrado a un CARGO concreto, repartiendo por fecha cuando hay varios el mismo día. */
export const chargePaidForInstallment = (
  charge: InstallmentRowLike & { id?: string | null; installment_number?: number | null },
  allInstallments: Array<InstallmentRowLike & { id?: string | null; installment_number?: number | null }>,
  chargePaidByDue: Map<string, number>,
): number => {
  const due = dateOnly(charge?.due_date);
  if (!due) return 0;
  const mismos = (allInstallments || [])
    .filter(i => isChargeInstallment(i) && dateOnly(i?.due_date) === due)
    .sort((a, b) => (Number(a?.installment_number) || 0) - (Number(b?.installment_number) || 0));

  let restante = round2(chargePaidByDue.get(due) || 0);
  for (const inst of mismos) {
    const total = installmentTotal(inst);
    const aplicado = round2(Math.min(Math.max(0, restante), total));
    const esEste = (charge?.id && inst?.id)
      ? inst.id === charge.id
      : Number(inst?.installment_number) === Number(charge?.installment_number);
    if (esEste) return aplicado;
    restante = round2(restante - aplicado);
  }
  return 0;
};

export { paymentGross };
