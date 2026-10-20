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
  /** Monto del cargo que agregó —o que cobró— esa entrada. Siempre en positivo. */
  amount: number;
  /**
   * `charge` (por defecto) agrega un cargo y SUBE el saldo; `payment` cobra cargos y lo BAJA.
   *
   * FALLO REPORTADO (2026-10-20): "cuando haces un pago por actualización-pagar cargos, este
   * genera un historial de modificación erróneo: se crea un cargo, se paga, y en el historial
   * sale de nuevo un 'agregar cargo' donde suma los 1,000 que se pagó al monto".
   */
  kind?: 'charge' | 'payment';
  /**
   * Los pagos que registró esta entrada. Se excluyen de "lo cobrado" para no descontarlos dos
   * veces: la entrada ya los representa con su propio `amount`.
   */
  paymentIds?: Array<string | null | undefined> | null;
}

export interface ChargeHistoryPaymentLike {
  /** Id del cobro, para poder enlazarlo con la entrada que lo registró. */
  id?: string | null;
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

/** Las notas de una entrada del historial, que se guardan como JSON. */
const notasDe = (entry: unknown): Record<string, unknown> | null => {
  const notas = (entry as { notes?: unknown })?.notes;
  if (notas && typeof notas === 'object') return notas as Record<string, unknown>;
  if (typeof notas === 'string' && notas.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(notas);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;   // No todas las notas son JSON: algunas son texto del usuario.
    }
  }
  return null;
};

/**
 * ¿Esta entrada del historial COBRA cargos (en vez de agregarlos)?
 *
 * FALLO REPORTADO (2026-10-20): "cuando haces un pago por actualización-pagar cargos, este
 * genera un historial de modificación erróneo: se crea un cargo, se paga, y en el historial sale
 * de nuevo un 'Agregar Cargo' donde suma los 1,000 que se pagó al monto". La pantalla decidía la
 * etiqueta con un `description.includes('Cargo')`, y "Pago de Cargos" también lleva esa palabra.
 */
export const isPayChargesEntry = (entry: unknown): boolean => {
  const notas = notasDe(entry);
  if (notas && String(notas.update_type || '') === 'pay_charges') return true;
  const description = (entry as { description?: string | null } | null)?.description;
  return /^\s*pago de cargos/i.test(String(description || ''));
};

/** Los pagos que registró una entrada de "Pagar cargos" (van en sus notas). */
export const paymentIdsOfEntry = (entry: unknown): string[] => {
  const ids = notasDe(entry)?.payment_ids;
  return Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
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

  // Los CARGOS que agregó el historial. Los cobros no cuentan aquí: no crean cuotas.
  const enElHistorial = round2(
    entries
      .filter((e) => e?.kind !== 'payment')
      .reduce((s, e) => s + (Number(e?.amount) || 0), 0)
  );
  // Los cargos que no salen del historial (gastos de cierre) ya estaban desde el principio.
  const cargosDeSiempre = Math.max(0, round2(round2(input.chargesTotal) - enElHistorial));
  const base = round2(round2(input.baseTotal) + cargosDeSiempre);

  // Los cobros que registró una entrada se excluyen: esa entrada ya los representa con su
  // propio monto, y contarlos además como "lo cobrado" los restaría dos veces.
  const deEntradas = new Set<string>();
  for (const entry of entries) {
    for (const id of entry?.paymentIds || []) {
      if (id) deEntradas.add(String(id));
    }
  }

  const cobros = (input.payments || [])
    .filter((p) => !(p?.id && deEntradas.has(String(p.id))))
    .map((p) => ({ ms: msOf(p?.at), amount: Number(p?.amount) || 0 }))
    .filter((p) => p.amount > 0.005);

  let acumulado = 0;
  for (const entry of entries) {
    const monto = Number(entry?.amount) || 0;
    const entryMs = msOf(entry?.created_at);
    const esCobro = entry?.kind === 'payment';

    // Lo cobrado ANTES de esta entrada. Sin instante en la entrada no se descuenta nada: más
    // vale no restar que restar de más.
    const cobrado = entryMs === null
      ? 0
      : round2(cobros.reduce((s, c) => (c.ms !== null && c.ms < entryMs ? s + c.amount : s), 0));

    const prev = Math.max(0, round2(base + acumulado - cobrado));
    // Agregar un cargo SUBE el saldo; cobrarlo lo BAJA.
    const next = Math.max(0, round2(esCobro ? prev - monto : prev + monto));
    map.set(entry.id, { prev, next });

    acumulado = round2(acumulado + (esCobro ? -monto : monto));
  }

  return map;
}
