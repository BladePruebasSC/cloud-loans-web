// Utilidad para post-procesar el desglose de mora al aplicar un abono.
//
// IMPORTANTE (auditoría de cálculos): Este archivo contenía anteriormente un SEGUNDO motor de
// cálculo de mora, completamente independiente del real (src/utils/installmentLateFeeCalculator.ts).
// Ese motor antiguo:
//   - Ignoraba la tabla `installments` y "inventaba" un cronograma sintético a partir de
//     loan.next_payment_date + loan.term, asumiendo cuotas de capital idénticas.
//   - Exportaba una función `getLateFeeBreakdownFromInstallments` con el MISMO nombre que la
//     función real de `installmentLateFeeCalculator.ts`, pero con una implementación distinta
//     (no consultaba la base de datos). Esta duplicidad de nombres era una fuente directa de
//     confusión y de valores de mora distintos entre pantallas.
//   - Era invocado en producción SOLO por `GlobalLateFeeConfig.tsx` con `amount: 0, term: 0`,
//     lo que hacía que el bucle de cálculo nunca se ejecutara y la mora se "reseteara" a 0 en
//     TODOS los préstamos cada vez que se guardaba la configuración global de mora.
//   - El resto de sus ~20 funciones (`test*`, `validateLateFeeCalculation`, etc.) eran código
//     muerto (nunca importado por ningún componente) que solo agregaba peso al bundle y, en un
//     caso, registraba un helper de depuración en `window` incluso en producción.
//
// Se eliminó ese motor duplicado. La ÚNICA fuente de verdad para calcular mora ahora es
// `getLateFeeBreakdownFromInstallments` en `src/utils/installmentLateFeeCalculator.ts`, que
// calcula la mora cuota por cuota usando las fechas y montos reales de la tabla `installments`.
// Ver también la corrección aplicada en `src/hooks/useLateFee.tsx` y en `GlobalLateFeeConfig.tsx`.
//
// Lo único que se conserva aquí es `applyLateFeePayment`, un post-procesador genérico que
// distribuye un abono de mora sobre un desglose ya calculado (no recalcula fechas ni montos por
// su cuenta, así que es seguro combinarlo con el desglose real obtenido de la BD).

export interface LateFeeCalculation {
  daysOverdue: number;
  lateFeeAmount: number;
  totalLateFee: number;
}

/**
 * Aplica un abono de mora sobre un desglose de mora YA CALCULADO (por ejemplo, el resultado de
 * `getLateFeeBreakdownFromInstallments`). Distribuye el abono cuota por cuota, en el orden en que
 * vienen en `originalBreakdown.breakdown`, hasta agotar el monto abonado.
 *
 * MANTIENE todas las cuotas originales con sus números, fechas y días específicos; solo ajusta
 * el monto de mora pendiente (y marca como pagada la cuota cuyo abono la cubre por completo).
 *
 * @param originalBreakdown - Desglose de mora real (de installmentLateFeeCalculator.ts)
 * @param lateFeePayment - Monto del abono de mora a distribuir
 * @returns Desglose actualizado después del abono
 */
export const applyLateFeePayment = (
  originalBreakdown: any,
  lateFeePayment: number
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
    remainingPayment?: number;
  }>;
} => {
  if (!originalBreakdown || !originalBreakdown.breakdown || lateFeePayment <= 0) {
    return originalBreakdown || { totalLateFee: 0, breakdown: [] };
  }

  let remainingPayment = lateFeePayment;
  let totalLateFee = 0;

  // MANTENER TODAS LAS CUOTAS ORIGINALES con sus días específicos
  const breakdown = originalBreakdown.breakdown.map((item: any) => {
    let adjustedLateFee = item.lateFee; // Mantener el monto original
    let isPaid = item.isPaid; // Mantener el estado de pago original
    let itemRemainingPayment = 0;

    // Solo aplicar abono a cuotas que NO están pagadas y tienen mora
    if (!item.isPaid && remainingPayment > 0 && item.lateFee > 0) {
      if (remainingPayment >= item.lateFee) {
        // El abono cubre completamente esta cuota
        isPaid = true;
        remainingPayment -= item.lateFee;
        adjustedLateFee = 0; // Solo cambiar el monto a 0, mantener todo lo demás
      } else {
        // El abono cubre parcialmente esta cuota
        adjustedLateFee = item.lateFee - remainingPayment;
        itemRemainingPayment = remainingPayment;
        remainingPayment = 0;
      }
    }

    // Solo agregar al total si la cuota NO está completamente pagada
    if (!isPaid && adjustedLateFee > 0) {
      totalLateFee += adjustedLateFee;
    }

    return {
      installment: item.installment, // MANTENER número de cuota original
      dueDate: item.dueDate, // MANTENER fecha original
      daysOverdue: item.daysOverdue, // MANTENER días originales
      principal: item.principal, // MANTENER capital original
      lateFee: isPaid ? 0 : adjustedLateFee, // Mostrar $0 si está pagada
      isPaid,
      remainingPayment: itemRemainingPayment
    };
  });

  totalLateFee = Math.round(totalLateFee * 100) / 100;

  return { totalLateFee, breakdown };
};
