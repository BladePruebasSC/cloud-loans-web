// ============================================================================
// Abonos a capital como filas de la tabla de amortización
// ============================================================================
// PEDIDO (2026-09-11): "en las tablas de amortización, tanto de Ver cuotas como del estado de
// cuenta, debe colocar como una fila nueva o un separador el abono a capital, debido a que al
// final el abono a capital es un pago más y así se lleva un mejor control".
//
// Las tablas solo listaban cuotas. Un abono a capital —que cambia el capital y, en muchos
// préstamos, la cuota de ahí en adelante— no aparecía en ninguna parte de ellas: se veía que las
// cuotas bajaban de golpe sin que la tabla dijera por qué.
//
// Aquí se intercalan los abonos entre las cuotas, por fecha. Un abono va justo antes de la
// primera cuota que vence DESPUÉS del día del abono; las cuotas que vencen ese mismo día quedan
// antes, porque se cobraron con el capital de antes.

import { capitalPaymentDateIso, type CapitalPaymentLike } from './indefiniteInterest';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

/** Un abono a capital listo para pintarse como fila. */
export interface CapitalPaymentEntry {
  key: string;
  /** Día del abono en Santo Domingo ('YYYY-MM-DD'). */
  dateIso: string;
  amount: number;
  /** Capital antes y después del abono (null si la fila no los trae). */
  capitalBefore: number | null;
  capitalAfter: number | null;
  /** Motivo escrito al registrar el abono. */
  reason: string | null;
}

export type ScheduleEntry<T> =
  | { kind: 'installment'; row: T }
  | { kind: 'capital_payment'; entry: CapitalPaymentEntry };

const numberOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : round2(n);
};

/** Abonos válidos, en orden cronológico. */
export const toCapitalPaymentEntries = (
  capitalPayments?: Array<CapitalPaymentLike & { id?: string | null; adjustment_reason?: string | null }> | null,
): CapitalPaymentEntry[] =>
  (capitalPayments || [])
    .filter(cp => (Number(cp?.amount) || 0) > 0.005)
    .slice()
    .sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')))
    .map((cp, index) => ({
      key: `abono-${cp.id || cp.created_at || index}`,
      dateIso: capitalPaymentDateIso(cp.created_at) || '',
      amount: round2(Number(cp.amount) || 0),
      capitalBefore: numberOrNull(cp.capital_before),
      capitalAfter: numberOrNull(cp.capital_after),
      reason: cp.adjustment_reason ? String(cp.adjustment_reason) : null,
    }));

/**
 * Intercala los abonos a capital entre las filas de una tabla ya ordenada por vencimiento.
 *
 * `includeTrailing` decide qué pasa con los abonos posteriores a la última fila: se muestran al
 * final (tabla completa) o se omiten (una vista recortada a "los próximos N", donde un abono
 * que cae más allá del corte no corresponde a lo que se está viendo).
 */
export const interleaveCapitalPayments = <T,>(
  rows: T[],
  dueOf: (row: T) => string | null | undefined,
  capitalPayments?: Array<CapitalPaymentLike & { id?: string | null; adjustment_reason?: string | null }> | null,
  options: { includeTrailing?: boolean } = {},
): ScheduleEntry<T>[] => {
  const entries = toCapitalPaymentEntries(capitalPayments);
  const out: ScheduleEntry<T>[] = [];
  let next = 0;

  for (const row of rows) {
    const due = dateOnly(dueOf(row));
    while (next < entries.length && due && entries[next].dateIso && entries[next].dateIso < due) {
      out.push({ kind: 'capital_payment', entry: entries[next] });
      next++;
    }
    out.push({ kind: 'installment', row });
  }

  if (options.includeTrailing !== false) {
    for (; next < entries.length; next++) out.push({ kind: 'capital_payment', entry: entries[next] });
  }
  return out;
};
