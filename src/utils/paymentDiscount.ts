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

/** Descuento total de una lista de pagos. */
export const paymentsDiscountTotal = (payments: Array<{ discount_amount?: number | null }>): number =>
  round2((payments || []).reduce((s, p) => s + (Number(p?.discount_amount) || 0), 0));

/** Efectivo recibido de un pago: lo acreditado (cuota + mora) menos el descuento. */
export const paymentCashReceived = (payment: {
  amount?: number | null; late_fee?: number | null; discount_amount?: number | null;
}): number => round2(
  (Number(payment?.amount) || 0) + (Number(payment?.late_fee) || 0) - (Number(payment?.discount_amount) || 0),
);
