// ============================================================================
// TOTALES DE UNA TABLA DE AMORTIZACIÓN
// ============================================================================
// El pie de la tabla debe SUMAR LAS FILAS QUE SE MUESTRAN, nunca valores calculados aparte.
//
// Antes no era así y el pie contradecía a su propia tabla:
//   · El capital usaba el monto ESCRITO en el formulario. Con los gastos de cierre financiados
//     el capital repartido es mayor (10,000 → 12,000) y el total seguía diciendo 10,000.
//   · "A pagar" usaba `total_amount` del préstamo, que por convención excluye los cargos. Con
//     2,000 de gastos de cierre la última cuota mostraba 5,666.67 pero el total seguía en
//     22,000 en vez de 24,000.

export interface AmortizationTotalsRow {
  interest?: number | null;
  principal?: number | null;
  /** Lo que se cobra en esa cuota, cargos incluidos */
  totalPayment?: number | null;
}

export interface AmortizationTotals {
  interest: number;
  principal: number;
  payment: number;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Suma las tres columnas de importe de la tabla.
 *
 * Se acumula en CRUDO y se redondea una sola vez al final. Redondeando fila a fila, un préstamo
 * de 10,000 en 6 cuotas daría 10,000.02 de capital (1,666.67 × 6), y el pie diría que el
 * cliente debe más capital del que se le prestó.
 *
 * A cambio, sumando a mano las filas de la pantalla —que sí se muestran redondeadas— puede
 * salir un par de céntimos de diferencia. Es el compromiso habitual en una tabla de
 * amortización, y preferible a que el total contradiga al monto del préstamo.
 */
export const sumAmortizationTotals = (rows: AmortizationTotalsRow[]): AmortizationTotals => {
  const raw = (rows || []).reduce<AmortizationTotals>(
    (acc, row) => ({
      interest: acc.interest + (Number(row.interest) || 0),
      principal: acc.principal + (Number(row.principal) || 0),
      payment: acc.payment + (Number(row.totalPayment) || 0),
    }),
    { interest: 0, principal: 0, payment: 0 },
  );

  return {
    interest: round2(raw.interest),
    principal: round2(raw.principal),
    payment: round2(raw.payment),
  };
};
