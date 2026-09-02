// ============================================================================
// Orden de los pagos en el historial: del más reciente al más antiguo
// ============================================================================
// Parece trivial y no lo es, por un detalle de Postgres: `now()` devuelve el instante en que
// EMPEZÓ LA TRANSACCIÓN, no el momento de cada fila. El pago avanzado inserta todas sus filas
// en un solo `insert`, así que las tres cuotas de un mismo cobro salen con `created_at`
// IDÉNTICO. Y `payment_date` es un DATE, así que también empata.
//
// Con los dos criterios empatados el `sort` se queda como venga la lista —el orden de
// inserción, 1, 2, 3— y el historial mostraba el primer pago abajo del todo, como si fuera el
// más reciente. Hace falta un tercer criterio que rompa el empate con sentido.

export interface OrderablePayment {
  payment_date?: string | null;
  created_at?: string | null;
  /** Cuota a la que se aplicó. Es lo que desempata dentro de un mismo cobro. */
  due_date?: string | null;
  id?: string | null;
}

const time = (value?: string | null): number => {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Comparador para `sort`: deja primero el pago más reciente.
 *
 * Criterios, en orden:
 *   1. `payment_date`  — el día en que se cobró.
 *   2. `created_at`    — el instante de registro.
 *   3. `due_date`      — DESEMPATE REAL. Dentro de un mismo cobro, el abono que fue a la
 *      cuota más lejana es el último de la tanda: se pagó la 1, luego la 2, luego la 3.
 *   4. `id`            — para que el orden sea estable y no baile entre recargas cuando
 *      todo lo demás empata (dos abonos a la misma cuota el mismo día).
 */
export const comparePaymentsNewestFirst = (
  a: OrderablePayment, b: OrderablePayment,
): number => {
  const byPaymentDate = time(b.payment_date) - time(a.payment_date);
  if (byPaymentDate !== 0) return byPaymentDate;

  const byCreated = time(b.created_at) - time(a.created_at);
  if (byCreated !== 0) return byCreated;

  const dueA = String(a.due_date ?? '');
  const dueB = String(b.due_date ?? '');
  if (dueA !== dueB) return dueB.localeCompare(dueA);

  return String(b.id ?? '').localeCompare(String(a.id ?? ''));
};

/** Copia ordenada del más reciente al más antiguo. No muta la lista original. */
export const sortPaymentsNewestFirst = <T extends OrderablePayment>(payments: T[]): T[] =>
  [...(payments || [])].sort(comparePaymentsNewestFirst);

/** Copia ordenada del más antiguo al más reciente, para recorridos acumulativos. */
export const sortPaymentsOldestFirst = <T extends OrderablePayment>(payments: T[]): T[] =>
  [...(payments || [])].sort((a, b) => comparePaymentsNewestFirst(b, a));
