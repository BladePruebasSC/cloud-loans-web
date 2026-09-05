// Condonación de mora ("Actualizar préstamo → Eliminar Mora") y crédito de mora ya pagada.
//
// La mora condonada o cobrada se anota en `installments.late_fee_paid`, y el cálculo de la mora
// (installmentLateFeeCalculator) la descuenta de la mora devengada. Estas dos operaciones
// —anotar y descontar— vivían escritas dos veces con fórmulas ligeramente distintas, y en los
// préstamos INDEFINIDOS no llegaban a encontrarse nunca (ver la nota del fallo en
// `spendLateFeeCredit`). Aquí quedan como funciones puras para que las dos usen la misma
// aritmética y se puedan probar con números concretos.

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export type LateFeeCalculationType = 'daily' | 'monthly' | 'compound';

export interface LateFeeFormulaInput {
  /** Monto sobre el que se calcula la mora (capital de la cuota, o interés en indefinidos). */
  base: number;
  /** Días que devengan mora: días vencidos MENOS los de gracia. */
  feeDays: number;
  /** Tasa de mora en % (por día, por período o compuesta, según `calculationType`). */
  rate: number;
  calculationType: LateFeeCalculationType | string | null | undefined;
  /** Largo del período en días según la frecuencia de pago; solo lo usa el tipo 'monthly'. */
  periodDays: number;
  /** Tope de mora del préstamo; 0 o ausente = sin tope. */
  maxLateFee?: number;
}

/**
 * Mora devengada por una cuota. Es la MISMA fórmula que aplica
 * `getLateFeeBreakdownFromInstallments`; si las dos se separan, el monto que se anota como
 * condonado deja de coincidir con el que se descuenta y la condonación se pierde a medias.
 */
export const computeInstallmentLateFee = ({
  base,
  feeDays,
  rate,
  calculationType,
  periodDays,
  maxLateFee,
}: LateFeeFormulaInput): number => {
  const safeBase = Number(base) || 0;
  const safeDays = Math.max(0, Math.floor(Number(feeDays) || 0));
  const safeRate = Number(rate) || 0;
  if (safeBase <= 0 || safeDays <= 0) return 0;

  let lateFee: number;
  switch (calculationType) {
    case 'monthly': {
      // El período es el de la frecuencia de pago, no siempre 30 días: en un préstamo diario o
      // semanal, "un mes de mora" no significa nada.
      const days = Math.max(1, Number(periodDays) || 30);
      lateFee = (safeBase * safeRate / 100) * Math.ceil(safeDays / days);
      break;
    }
    case 'compound':
      lateFee = safeBase * (Math.pow(1 + safeRate / 100, safeDays) - 1);
      break;
    case 'daily':
    default:
      lateFee = (safeBase * safeRate / 100) * safeDays;
      break;
  }

  const cap = Number(maxLateFee) || 0;
  if (cap > 0) lateFee = Math.min(lateFee, cap);
  return round2(lateFee);
};

export interface LateFeeCreditItem {
  dueDate: string;
  lateFee: number;
  isPaid?: boolean;
  isCharge?: boolean;
}

export interface LateFeeCreditResult {
  /** Cuánto crédito se llegó a descontar. */
  applied: number;
  /** Crédito que sobró (no había mora suficiente donde descontarlo). */
  remaining: number;
}

/**
 * Descuenta un crédito de mora sobre las cuotas pendientes, de la más vieja a la más nueva.
 * MUTA los elementos recibidos (bajando su `lateFee`), que es como lo necesita el desglose.
 *
 * FALLO QUE ARREGLA (2026-09-05): en un préstamo INDEFINIDO la mora condonada se anotaba en la
 * única fila que existe en `installments` —los demás períodos se generan sobre la marcha al
 * calcular—, pero el crédito de esa fila solo podía gastarse en los períodos GENERADOS: la fila
 * guardada se quedaba con su mora íntegra. En un préstamo cuya mora sale entera de esa fila (un
 * solo período vencido), condonar no quitaba ni un peso: el aviso decía "Nueva mora: RD$0" y al
 * recargar volvía exactamente el mismo monto.
 *
 * Los CARGOS quedan fuera a propósito: son obligaciones aparte y su mora no se cancela con el
 * crédito de las cuotas de interés.
 */
export const spendLateFeeCredit = <T extends LateFeeCreditItem>(
  items: T[],
  credit: number
): LateFeeCreditResult => {
  let pool = round2(credit);
  if (!(pool > 0.001)) return { applied: 0, remaining: Math.max(0, pool) };

  const order = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.isPaid && !item.isCharge && Number(item.lateFee) > 0.001)
    .sort((a, b) =>
      String(a.item.dueDate).localeCompare(String(b.item.dueDate)) || a.index - b.index
    );

  let applied = 0;
  for (const { item } of order) {
    if (pool <= 0.001) break;
    const take = Math.min(pool, round2(Number(item.lateFee) || 0));
    item.lateFee = round2(Number(item.lateFee) - take);
    pool = round2(pool - take);
    applied = round2(applied + take);
  }

  return { applied, remaining: Math.max(0, pool) };
};

export interface WaiverTargetRow {
  id: string;
  /** 'YYYY-MM-DD'. */
  dueDate: string;
  /** Mora que le queda pendiente a esta cuota (devengada − ya anotada). */
  pendingLateFee: number;
  /** Lo que la cuota ya tiene anotado en `late_fee_paid`. */
  currentLateFeePaid: number;
}

export interface WaiverAssignment {
  id: string;
  /** Nuevo valor ABSOLUTO de `late_fee_paid` para esa cuota. */
  lateFeePaid: number;
  /** Cuánto se le sumó (para el registro en el historial). */
  added: number;
}

/**
 * Reparte una condonación de mora entre las cuotas, de la más vieja a la más nueva y sin pasarse
 * de la mora pendiente de cada una.
 *
 * Antes se repartía en PROPORCIÓN a la mora de cada cuota. Con proporciones, cualquier diferencia
 * entre la fórmula de aquí y la del cálculo hacía que a una cuota le tocara más mora de la que
 * tenía; el cálculo recorta con `Math.max(0, mora − anotado)` y ese sobrante se perdía, así que la
 * mora total no bajaba lo que se había pedido quitar.
 *
 * Lo que sobre después de cubrir todas las cuotas se anota igualmente en la más vieja: en los
 * préstamos indefinidos la mayoría de los períodos no tienen fila, y ese resto es justamente el
 * crédito que `spendLateFeeCredit` repartirá sobre los períodos generados.
 */
export const distributeLateFeeWaiver = (
  rows: WaiverTargetRow[],
  amountToRemove: number
): WaiverAssignment[] => {
  const total = round2(amountToRemove);
  if (!(total > 0.001) || rows.length === 0) return [];

  const order = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) =>
      String(a.row.dueDate).localeCompare(String(b.row.dueDate)) || a.index - b.index
    );

  const added = new Map<string, number>();
  let pending = total;

  for (const { row } of order) {
    if (pending <= 0.001) break;
    const capacity = Math.max(0, round2(Number(row.pendingLateFee) || 0));
    if (capacity <= 0.001) continue;
    const take = round2(Math.min(pending, capacity));
    added.set(row.id, round2((added.get(row.id) || 0) + take));
    pending = round2(pending - take);
  }

  // Sobrante: a la cuota más vieja, que es de donde arranca el descuento.
  if (pending > 0.001) {
    const oldest = order[0].row;
    added.set(oldest.id, round2((added.get(oldest.id) || 0) + pending));
    pending = 0;
  }

  const byId = new Map(rows.map(r => [r.id, r]));
  return Array.from(added.entries())
    .filter(([, amount]) => amount > 0.001)
    .map(([id, amount]) => ({
      id,
      added: amount,
      lateFeePaid: round2((Number(byId.get(id)?.currentLateFeePaid) || 0) + amount),
    }));
};
