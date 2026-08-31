// ============================================================================
// PENDIENTE POR CUOTA y REPARTO DE UN PAGO ENTRE VARIAS CUOTAS — funciones puras
// ============================================================================
// Las usa el "Pago avanzado" del formulario de pagos, donde el empleado elige a qué cuotas
// abonar y escribe un monto mayor al de una sola cuota.
//
// El sistema vincula un pago con su cuota por `payments.due_date`. Aquí se respeta esa
// convención: los pagos se agrupan por fecha de vencimiento y se reparten en cascada entre
// las cuotas de esa fecha, en orden de número de cuota.
//
// Los pagos de CARGO (con interés 0) solo alimentan cargos y los pagos de cuota solo cuotas
// regulares: es la misma separación que ya hace `PaymentForm` al recalcular `paid_amount`.

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface RawInstallment {
  id: string;
  installment_number: number;
  due_date: string;
  total_amount?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
  paid_amount?: number | null;
  is_paid?: boolean | null;
}

export interface RawPayment {
  amount?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
  due_date?: string | null;
}

export interface DueRow {
  id: string;
  installmentNumber: number;
  dueDate: string;
  isCharge: boolean;
  total: number;
  paid: number;
  pending: number;
  isPaid: boolean;
  /** Parte de capital de la cuota completa (para repartir un abono parcial) */
  principal: number;
  interest: number;
}

/** ¿La fila es un CARGO? (sin interés y principal = total) — misma regla que el resto del sistema. */
const rowIsCharge = (i: RawInstallment) =>
  Math.abs(Number(i.interest_amount || 0)) < 0.01 &&
  Number(i.principal_amount || 0) > 0.01 &&
  Math.abs(Number(i.principal_amount || 0) - Number(i.total_amount || 0)) < 0.01;

/**
 * Calcula cuánto queda pendiente en cada cuota/cargo.
 *
 * Prioridad de la señal de "pagado", de más fiable a menos:
 *   1. `is_paid = true`  → pendiente 0.
 *   2. `paid_amount` > 0 → lo que diga la columna (la mantiene el flujo de cargos).
 *   3. Los pagos con esa `due_date`, repartidos en cascada.
 */
export const computeInstallmentDues = (
  installments: RawInstallment[],
  payments: RawPayment[],
): DueRow[] => {
  const rows: DueRow[] = (installments || []).map(i => {
    const total = round2(Number(i.total_amount || 0));
    const isCharge = rowIsCharge(i);
    return {
      id: i.id,
      installmentNumber: Number(i.installment_number) || 0,
      dueDate: dateOnly(i.due_date),
      isCharge,
      total,
      paid: 0,
      pending: total,
      isPaid: !!i.is_paid,
      principal: round2(Number(i.principal_amount || 0)),
      interest: round2(Number(i.interest_amount || 0)),
    };
  });

  // Pagos disponibles por (fecha, tipo). Un pago sin interés se considera de cargo.
  const pool = new Map<string, number>();
  for (const p of payments || []) {
    const due = dateOnly(p.due_date);
    if (!due) continue;
    const principal = Number(p.principal_amount ?? p.amount ?? 0) || 0;
    const interest = Number(p.interest_amount ?? 0) || 0;
    const gross = Number(p.amount ?? 0) || round2(principal + interest);
    const isChargePayment = principal > 0 && interest < 0.01;
    const key = `${due}|${isChargePayment ? 'charge' : 'regular'}`;
    pool.set(key, round2((pool.get(key) || 0) + gross));
  }

  // Reparto en cascada dentro de cada (fecha, tipo), por número de cuota.
  const groups = new Map<string, DueRow[]>();
  for (const r of rows) {
    const key = `${r.dueDate}|${r.isCharge ? 'charge' : 'regular'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const byId = new Map((installments || []).map(i => [i.id, i]));

  for (const [key, group] of groups) {
    group.sort((a, b) => a.installmentNumber - b.installmentNumber);
    let available = pool.get(key) || 0;

    for (const r of group) {
      if (r.isPaid) { r.paid = r.total; r.pending = 0; available = round2(Math.max(0, available - r.total)); continue; }

      // `paid_amount` solo se consulta en CARGOS: es el único caso en que el sistema lo mantiene
      // al día (`PaymentActions` lo recalcula solo para cargos al borrar un pago). En una cuota
      // regular puede quedar obsoleto, así que ahí el pagado se deriva siempre de `payments`.
      const explicit = r.isCharge ? round2(Number(byId.get(r.id)?.paid_amount || 0)) : 0;
      if (explicit > 0.005) {
        r.paid = Math.min(explicit, r.total);
        r.pending = round2(Math.max(0, r.total - r.paid));
        available = round2(Math.max(0, available - r.paid));
        continue;
      }

      const assign = Math.min(Math.max(available, 0), r.total);
      r.paid = round2(assign);
      r.pending = round2(Math.max(0, r.total - assign));
      r.isPaid = r.pending < 0.01 && r.total > 0;
      available = round2(Math.max(0, available - assign));
    }
  }

  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);
};

export interface Allocation {
  row: DueRow;
  /** Cuánto de este pago va a esta cuota */
  applied: number;
  principal: number;
  interest: number;
  /** Queda saldada por completo tras aplicar este pago */
  settles: boolean;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Total efectivamente repartido */
  applied: number;
  /** Lo que sobra porque el monto supera lo pendiente de las cuotas elegidas */
  leftover: number;
  /** Lo que falta para saldar por completo todas las cuotas elegidas */
  shortfall: number;
}

/**
 * Reparte `amount` entre `rows` en orden cronológico: satura cada cuota antes de pasar a la
 * siguiente. El último abono puede quedar parcial.
 */
export const allocateAmountToInstallments = (rows: DueRow[], amount: number): AllocationResult => {
  const ordered = [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);
  let remaining = round2(Math.max(0, Number(amount) || 0));
  const totalPending = round2(ordered.reduce((s, r) => s + r.pending, 0));
  const allocations: Allocation[] = [];

  for (const row of ordered) {
    if (row.pending <= 0.005) continue;
    const applied = round2(Math.min(remaining, row.pending));
    if (applied <= 0.005) continue;
    remaining = round2(remaining - applied);

    // Se reparte capital/interés en la misma proporción que tiene la cuota, para que el
    // desglose por antigüedad y los informes sigan cuadrando.
    let principal: number;
    let interest: number;
    if (row.isCharge || row.total <= 0) {
      principal = applied;
      interest = 0;
    } else {
      principal = round2(applied * (row.principal / row.total));
      interest = round2(applied - principal);
    }

    allocations.push({ row, applied, principal, interest, settles: applied >= row.pending - 0.005 });
    if (remaining <= 0.005) break;
  }

  const applied = round2(allocations.reduce((s, a) => s + a.applied, 0));
  return {
    allocations,
    applied,
    leftover: round2(Math.max(0, remaining)),
    shortfall: round2(Math.max(0, totalPending - applied)),
  };
};
