// ============================================================================
// LOS SALDOS QUE ENSEÑA EL HISTORIAL EN UNA ENTRADA DE "AGREGAR CARGO"
// ============================================================================
// El historial no enseña el "antes" y el "después" tal como se guardaron: los REHACE. Se hizo
// así porque los valores guardados arrastraban desfases de redondeo (245,996 contra 246,000 por
// una cuota redondeada) y porque las entradas viejas se escribieron con cálculos que ya no
// existen. Rehacerlos desde el total del préstamo y los cargos del propio historial daba una
// cadena coherente de principio a fin.
//
// FALLO REPORTADO (2026-10-19): "en historial de modificaciones, valores anteriores y valores
// nuevos, pasa de 1,083.33 a 2,083.33; pero ese monto antes del cargo tenía un gasto de cierre,
// o sea que pasó de 3,083.33 a 4,083.33 como sale en los datos".
//
// POR QUÉ: la cadena arrancaba en `loans.total_amount` —capital + interés, SIN cargos— y solo le
// sumaba los cargos que aparecen EN EL HISTORIAL. El cargo de los gastos de cierre se crea junto
// con el préstamo y nunca pasa por el historial, así que no entraba en la cuenta: faltaba en el
// "antes" y en el "después" de todas las entradas.
//
// AHORA el punto de partida incluye los cargos que existen en `installments` y que NO vienen de
// una entrada del historial —que son, justamente, los gastos de cierre—, y se descuenta lo que
// ya se había cobrado antes de cada entrada, para que las cifras digan lo mismo que la tarjeta
// del préstamo y no el saldo de un préstamo al que nadie hubiera pagado nada.

const round2 = (v: number) => Math.round((Number.isFinite(Number(v)) ? Number(v) : 0) * 100) / 100;

export interface ChargeHistoryEntryLike {
  id: string;
  /** Cuándo se registró la entrada. Ordena la cadena y separa lo ya cobrado. */
  created_at?: string | null;
  /** Monto del cargo que agregó esa entrada. */
  amount: number;
}

export interface ChargeHistoryPaymentLike {
  /** Instante del cobro (el que la pantalla tenga: `created_at`, `payment_time_local`…). */
  at?: string | null;
  /** Lo acreditado al préstamo (sin mora). */
  amount: number;
}

export interface ChargeHistoryBalance {
  /** Saldo antes de agregar el cargo. */
  prev: number;
  /** Saldo después. Siempre `prev` + el monto del cargo. */
  next: number;
}

const msOf = (value?: string | null): number | null => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
};

/**
 * El "antes" y el "después" de cada entrada de "Agregar Cargo", en orden cronológico.
 *
 * `baseTotal` es `loans.total_amount` (capital + interés, sin cargos) y `chargesTotal` la suma de
 * TODOS los cargos guardados en `installments`. La diferencia entre esa suma y lo que suman las
 * entradas del historial son los cargos que nunca pasaron por él —los gastos de cierre—, y esos
 * ya estaban ahí antes de la primera entrada.
 */
export function chargeHistoryBalances(input: {
  baseTotal: number;
  chargesTotal: number;
  entries: ChargeHistoryEntryLike[] | null | undefined;
  payments?: ChargeHistoryPaymentLike[] | null;
}): Map<string, ChargeHistoryBalance> {
  const map = new Map<string, ChargeHistoryBalance>();

  const entries = [...(input.entries || [])].sort((a, b) => {
    const am = msOf(a?.created_at) ?? 0;
    const bm = msOf(b?.created_at) ?? 0;
    return am - bm;
  });
  if (entries.length === 0) return map;

  const enElHistorial = round2(entries.reduce((s, e) => s + (Number(e?.amount) || 0), 0));
  // Los cargos que no salen del historial (gastos de cierre) ya estaban desde el principio.
  const cargosDeSiempre = Math.max(0, round2(round2(input.chargesTotal) - enElHistorial));
  const base = round2(round2(input.baseTotal) + cargosDeSiempre);

  const cobros = (input.payments || [])
    .map((p) => ({ ms: msOf(p?.at), amount: Number(p?.amount) || 0 }))
    .filter((p) => p.amount > 0.005);

  let acumulado = 0;
  for (const entry of entries) {
    const monto = Number(entry?.amount) || 0;
    const entryMs = msOf(entry?.created_at);

    // Lo cobrado ANTES de esta entrada. Sin instante en la entrada no se descuenta nada: más
    // vale no restar que restar de más.
    const cobrado = entryMs === null
      ? 0
      : round2(cobros.reduce((s, c) => (c.ms !== null && c.ms < entryMs ? s + c.amount : s), 0));

    const prev = Math.max(0, round2(base + acumulado - cobrado));
    const next = Math.max(0, round2(prev + monto));
    map.set(entry.id, { prev, next });

    acumulado = round2(acumulado + monto);
  }

  return map;
}
