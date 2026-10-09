// ============================================================================
// DESCUENTO en un pago
// ============================================================================
// CAMBIO SOLICITADO (2026-09-22): "necesito que los formularios de pago, tanto normal como
// avanzado, tengan un apartado de descuento, por porcentaje o monto, y que esto se refleje en la
// factura, en el historial y datos".
//
// CÓMO SE GUARDA (importante para que las cuentas del préstamo sigan cuadrando):
//   · `payments.amount` sigue siendo lo que se ACREDITA a la cuota (el monto completo). Todo el
//     sistema —cuotas pendientes, balance, "Total pagado", mora— mide contra ese número, así que
//     una cuota con descuento queda SALDADA, no a medias.
//   · `payments.discount_amount` es lo que se perdonó, y `discount_percentage` el porcentaje
//     aplicado (cuando se pidió por porcentaje).
//   · EL EFECTIVO RECIBIDO es `amount - discount_amount`. Es lo que se cobra en caja, lo que sale
//     en el recibo y lo que suma en los ingresos.

import { isChargePayment } from './chargeAwarePayments';
import { findMissingColumn } from './supabaseErrors';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export type DiscountMode = 'amount' | 'percent';

export interface DiscountResult {
  /** Monto perdonado, ya redondeado y limitado al total */
  amount: number;
  /** Porcentaje aplicado (siempre se deduce, aunque se haya escrito un monto) */
  percentage: number | null;
  /** Aviso para la pantalla cuando el valor escrito no es válido */
  error: string | null;
}

/** Descuento a partir de lo que escribió el usuario, sobre `base` (el monto de la cuota). */
export const computeDiscount = (
  mode: DiscountMode, value: number | string | null | undefined, base: number,
): DiscountResult => {
  const total = round2(Number(base) || 0);
  const raw = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return { amount: 0, percentage: null, error: null };
  if (total <= 0) return { amount: 0, percentage: null, error: 'Escribe primero el monto del pago' };

  if (mode === 'percent') {
    if (raw > 100) {
      return { amount: total, percentage: 100, error: 'El descuento no puede pasar del 100%' };
    }
    return { amount: round2(total * raw / 100), percentage: round2(raw), error: null };
  }

  const amount = round2(raw);
  if (amount > total) {
    return { amount: total, percentage: 100, error: 'El descuento no puede ser mayor que el monto del pago' };
  }
  return { amount, percentage: round2((amount / total) * 100), error: null };
};

/** Lo que el cliente entrega: el total menos el descuento. */
export const netToCollect = (total: number, discount: number): number =>
  round2(Math.max(0, round2(Number(total) || 0) - round2(Number(discount) || 0)));

/**
 * Reparte un descuento entre varias filas (pago avanzado), proporcional a cada monto. Los
 * centavos que sobran por el redondeo se ajustan en la última fila, así la suma cuadra exacta.
 */
export const splitDiscount = (amounts: number[], discount: number): number[] => {
  const total = round2((amounts || []).reduce((s, a) => s + (Number(a) || 0), 0));
  const target = round2(Math.min(round2(Number(discount) || 0), total));
  if (amounts.length === 0 || target <= 0 || total <= 0) return (amounts || []).map(() => 0);

  const parts = amounts.map(a => round2(((Number(a) || 0) / total) * target));
  const diff = round2(target - round2(parts.reduce((s, p) => s + p, 0)));
  if (Math.abs(diff) >= 0.01) {
    // Se ajusta en la fila más grande, que es la que puede absorberlo sin quedar negativa.
    let biggest = 0;
    for (let i = 1; i < amounts.length; i++) if ((amounts[i] || 0) > (amounts[biggest] || 0)) biggest = i;
    parts[biggest] = round2(Math.max(0, parts[biggest] + diff));
  }
  return parts;
};

/** Texto para el recibo y el historial. */
export const describeDiscount = (amount: number, percentage?: number | null): string => {
  if (!(Number(amount) > 0.005)) return '';
  const pct = Number(percentage);
  return Number.isFinite(pct) && pct > 0 ? `Descuento (${round2(pct)}%)` : 'Descuento';
};

// ---------------------------------------------------------------------------
// Guardado tolerante: la migración puede no estar aplicada todavía
// ---------------------------------------------------------------------------

export const DISCOUNT_COLUMNS = ['discount_amount', 'discount_percentage', 'discount_reason'] as const;

/** El error dice que falta una de las columnas del descuento (migración sin aplicar). */
export const isMissingDiscountColumn = (error: unknown): boolean => {
  const column = findMissingColumn(error);
  return !!column && (DISCOUNT_COLUMNS as readonly string[]).includes(column);
};

const withoutDiscountColumns = <T extends Record<string, any>>(rows: T[]): T[] =>
  rows.map(row => {
    const copy = { ...row };
    for (const column of DISCOUNT_COLUMNS) delete copy[column];
    return copy;
  });

export interface PaymentDiscountFields {
  discount_amount: number;
  discount_percentage: number | null;
  discount_reason: string | null;
}

/** Campos del descuento listos para `payments` (0 y nulos cuando no hay descuento). */
export const discountFields = (
  amount: number, percentage?: number | null, reason?: string | null,
): PaymentDiscountFields => ({
  discount_amount: round2(Number(amount) || 0),
  discount_percentage: Number(percentage) > 0 ? round2(Number(percentage)) : null,
  discount_reason: (reason || '').trim() || null,
});

/**
 * Inserta pagos. Si la base todavía no tiene las columnas del descuento, reintenta sin ellas para
 * no perder el cobro y avisa en la consola (la migración 20260922000000 las añade).
 */
export async function insertPaymentsWithDiscount(
  supabase: { from: (table: string) => any },
  rows: Array<Record<string, any>>,
  select?: string,
): Promise<{ data: any; error: any; discountSaved: boolean }> {
  const run = async (payload: Array<Record<string, any>>) => {
    const query = supabase.from('payments').insert(payload);
    return select ? await query.select(select) : await query;
  };

  const first = await run(rows);
  if (!first.error) return { data: first.data, error: null, discountSaved: true };
  if (!isMissingDiscountColumn(first.error)) return { data: null, error: first.error, discountSaved: false };

  console.warn(
    '[descuento] la base no tiene las columnas del descuento: el pago se guarda SIN él. ' +
    'Aplica la migración 20260922000000_payment_discounts.sql.',
  );
  const retry = await run(withoutDiscountColumns(rows));
  return { data: retry.data, error: retry.error, discountSaved: false };
}

export interface DueDiscount {
  /** Lo perdonado en esa fecha de vencimiento */
  amount: number;
  /** Qué porcentaje representa sobre lo acreditado a esa cuota */
  percentage: number | null;
  /** Lo que se ACREDITÓ a la cuota (el monto completo) */
  credited: number;
  /** Lo que el cliente entregó de verdad: acreditado − descuento */
  net: number;
}

/**
 * Descuento aplicado a cada CUOTA (por su fecha de vencimiento), para las tablas de amortización.
 *
 * CAMBIO SOLICITADO (2026-10-01): "en recibo de ingreso y ver cuotas, las tablas de amortización
 * deben mostrar las cuotas que recibieron un descuento, en monto y porcentaje: que en la cuota
 * aparezca que se pagó el monto completo, pero que se pagó tanto debido a tal descuento".
 */
export const discountsByDueDate = (
  payments: Array<{ due_date?: string | null; amount?: number | null; discount_amount?: number | null }>,
): Map<string, DueDiscount> => {
  const acreditado = new Map<string, number>();
  const descuento = new Map<string, number>();

  for (const p of payments || []) {
    const due = String(p?.due_date ?? '').split('T')[0];
    if (!due) continue;
    const disc = round2(Number(p?.discount_amount) || 0);
    acreditado.set(due, round2((acreditado.get(due) || 0) + (Number(p?.amount) || 0)));
    if (disc > 0.005) descuento.set(due, round2((descuento.get(due) || 0) + disc));
  }

  const out = new Map<string, DueDiscount>();
  for (const [due, amount] of descuento) {
    const base = acreditado.get(due) || 0;
    out.set(due, {
      amount,
      percentage: base > 0.005 ? round2((amount / base) * 100) : null,
      credited: base,
      net: round2(Math.max(0, base - amount)),
    });
  }
  return out;
};

export interface DueDiscountSplit {
  /** Descuentos de los pagos a CARGOS, por fecha */
  charges: Map<string, DueDiscount>;
  /** Descuentos de los pagos de CUOTA, por fecha */
  regular: Map<string, DueDiscount>;
}

/**
 * Lo mismo, pero separando el cargo de la cuota.
 *
 * FALLO (2026-10-01): un cargo casi siempre vence el mismo día que una cuota, así que el descuento
 * de uno salía TAMBIÉN en la fila del otro ("Descuento RD$280.00 (7.78%)" repetido en el cargo y
 * en la cuota 1/X). Cada fila debe enseñar solo lo que se perdonó en SU concepto.
 */
export const discountsByDueDateSplit = (
  payments: Array<{
    due_date?: string | null; amount?: number | null; discount_amount?: number | null;
    principal_amount?: number | null; interest_amount?: number | null;
  }>,
): DueDiscountSplit => ({
  charges: discountsByDueDate((payments || []).filter(p => isChargePayment(p as any))),
  regular: discountsByDueDate((payments || []).filter(p => !isChargePayment(p as any))),
});

const money = (v: number) => `RD$${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Texto para la fila de una tabla: "Descuento RD$0.29 (17.37%) · pagó RD$1.38".
 *
 * CAMBIO SOLICITADO (2026-10-09): "en la tabla de ver recibos quiero que se vea el monto real que
 * se pagó con descuento y no solo el monto que se descontó". La cuota se acredita completa —por
 * eso sale saldada—, pero en caja entró menos: las dos cifras tienen que estar a la vista.
 */
export const describeDueDiscount = (d: DueDiscount | undefined | null): string => {
  if (!d || d.amount <= 0.005) return '';
  const base = `Descuento ${money(d.amount)}${d.percentage ? ` (${d.percentage}%)` : ''}`;
  // `credited`/`net` no existían en los primeros descuentos guardados: si no vienen, se enseña
  // solo lo perdonado, que es lo que se sabe.
  return typeof d.net === 'number' && d.credited > 0.005
    ? `${base} · pagó ${money(d.net)} de ${money(d.credited)}`
    : base;
};

/** Solo el monto que entró de verdad: "Pagó RD$1.38". Para columnas estrechas. */
export const describeDueNet = (d: DueDiscount | undefined | null): string =>
  (!d || d.amount <= 0.005 || typeof d.net !== 'number') ? '' : `Pagó ${money(d.net)}`;

/** Descuento total de una lista de pagos. */
export const paymentsDiscountTotal = (payments: Array<{ discount_amount?: number | null }>): number =>
  round2((payments || []).reduce((s, p) => s + (Number(p?.discount_amount) || 0), 0));

/** Efectivo recibido de un pago: lo acreditado (cuota + mora) menos el descuento. */
export const paymentCashReceived = (payment: {
  amount?: number | null; late_fee?: number | null; discount_amount?: number | null;
}): number => round2(
  (Number(payment?.amount) || 0) + (Number(payment?.late_fee) || 0) - (Number(payment?.discount_amount) || 0),
);
