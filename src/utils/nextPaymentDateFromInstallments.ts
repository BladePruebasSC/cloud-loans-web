/**
 * Calcula la fecha de próximo pago (primera cuota/cargo pendiente) desde installments + payments,
 * con la misma lógica que InstallmentsTable/LoanDetailsView: asignar pagos a cargos primero, luego a cuotas regulares.
 * Así la fecha es correcta cuando hay cargos y no se depende del is_paid de la BD.
 */
export function getFirstUnpaidDueDate(
  installments: Array<{
    id: string;
    due_date?: string | null;
    installment_number?: number;
    principal_amount?: number | null;
    interest_amount?: number | null;
    total_amount?: number | null;
    amount?: number | null;
    is_paid?: boolean;
  }>,
  payments: Array<{
    id: string;
    due_date?: string | null;
    amount?: number | null;
    principal_amount?: number | null;
    interest_amount?: number | null;
    payment_date?: string | null;
    payment_time_local?: string | null;
    created_at?: string | null;
  }>
): string | null {
  if (!installments.length) return null;

  const sortedInstallments = [...installments].sort((a, b) => {
    const aDue = (a.due_date || '').split('T')[0] || '';
    const bDue = (b.due_date || '').split('T')[0] || '';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (a.installment_number || 0) - (b.installment_number || 0);
  });
  const sortedPayments = [...payments].sort((a, b) => {
    const at = (a.payment_date || a.payment_time_local || a.created_at || '').toString();
    const bt = (b.payment_date || b.payment_time_local || b.created_at || '').toString();
    return new Date(at).getTime() - new Date(bt).getTime();
  });

  const isCharge = (inst: (typeof installments)[0]) => {
    const total =
      inst.total_amount ??
      inst.amount ??
      (Number(inst.principal_amount || 0) + Number(inst.interest_amount || 0));
    return (
      Math.abs(Number(inst.interest_amount || 0)) < 0.01 &&
      Math.abs((inst.principal_amount || 0) - total) < 0.01
    );
  };

  const computedIsPaid = new Map<string, boolean>();
  const assignedPaymentIdsForCharges = new Set<string>();

  for (const chargeInst of sortedInstallments.filter(isCharge)) {
    const chargeTotal =
      chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
    const chargeDueDate = chargeInst.due_date?.split('T')[0];
    let accumulatedPrincipal = 0;
    for (const payment of sortedPayments) {
      if (assignedPaymentIdsForCharges.has(payment.id)) continue;
      const paymentDueDate =
        (payment.due_date as string)?.split?.('T')?.[0] || (payment.due_date as string);
      const hasNoInterest = (payment.interest_amount || 0) < 0.01;
      const reasonableAmount =
        (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
      if (
        paymentDueDate === chargeDueDate &&
        hasNoInterest &&
        reasonableAmount
      ) {
        const amt = payment.principal_amount || payment.amount || 0;
        if (amt > 0 && accumulatedPrincipal + amt <= chargeTotal * 1.01) {
          assignedPaymentIdsForCharges.add(payment.id);
          accumulatedPrincipal += amt;
          if (accumulatedPrincipal >= chargeTotal * 0.99) break;
        }
      }
    }
    computedIsPaid.set(chargeInst.id, accumulatedPrincipal >= chargeTotal * 0.99);
  }

  const round2 = (v: number) => Math.round(Number(v || 0) * 100) / 100;
  for (const regularInst of sortedInstallments) {
    if (isCharge(regularInst)) continue;
    const expectedTotal = round2(
      regularInst.total_amount ??
        regularInst.amount ??
        (Number(regularInst.principal_amount || 0) + Number(regularInst.interest_amount || 0))
    );
    const dueKey = regularInst.due_date?.split('T')[0] || regularInst.due_date;
    let totalPaidForDue = 0;
    if (dueKey) {
      const paymentsForThisDue = sortedPayments.filter((p) => {
        if (assignedPaymentIdsForCharges.has(p.id)) return false;
        const pDue =
          (p.due_date as string)?.split?.('T')?.[0] || (p.due_date as string) || null;
        return pDue === dueKey;
      });
      totalPaidForDue = round2(
        paymentsForThisDue.reduce((s, p) => s + (Number(p.amount || 0) || 0), 0)
      );
    }
    computedIsPaid.set(
      regularInst.id,
      totalPaidForDue + 0.05 >= expectedTotal && expectedTotal > 0
    );
  }

  const getPaid = (inst: (typeof installments)[0]) =>
    computedIsPaid.get(inst.id) ?? inst.is_paid ?? false;
  const firstUnpaid = sortedInstallments.find((inst) => !getPaid(inst));
  return firstUnpaid?.due_date ? firstUnpaid.due_date.split('T')[0] : null;
}
