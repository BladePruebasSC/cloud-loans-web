// ============================================================================
// PENALIDADES de un préstamo
// ============================================================================
// CAMBIO SOLICITADO (2026-09-18): "Penalidad, es el monto que se agrega haciendo un abono a
// capital u otras actualizaciones y debe tener un apartado en el préstamo que lo muestre y vaya
// sumando en caso de ser varias veces."
//
// Hasta ahora la penalidad del abono a capital solo quedaba escrita en el TEXTO del historial
// ("Penalidad (2%): RD$3,000.00") y en el recibo. Ahora cada una es una fila de
// `loan_penalties` (migración 20260918000000), que es lo que se suma.
//
// Mientras la migración no esté aplicada, la tabla no existe: en ese caso las penalidades se
// leen del historial con los mismos patrones que usa la migración para recuperarlas, así la
// pantalla no se queda en cero.

import type { SupabaseClient } from '@supabase/supabase-js';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export type PenaltySource = 'capital_payment' | 'charge' | 'other';

export interface LoanPenalty {
  id: string;
  loan_id: string;
  amount: number;
  percentage: number | null;
  base_amount: number | null;
  source: PenaltySource;
  capital_payment_id?: string | null;
  installment_id?: string | null;
  loan_history_id?: string | null;
  description: string | null;
  created_at: string;
}

export const PENALTY_SOURCE_LABEL: Record<PenaltySource, string> = {
  capital_payment: 'Abono a capital',
  charge: 'Cargo por penalización',
  other: 'Otra actualización',
};

/** Evento que se dispara al registrar una penalidad: `detail.loanId`. */
export const LOAN_PENALTIES_EVENT = 'loanPenaltiesUpdated';

/**
 * Monto escrito como lo formatea la app en es-DO ("3,000.00") → número.
 * Si trae coma Y punto, el último separador es el decimal; si solo trae comas y el último grupo
 * tiene tres cifras, son de miles.
 */
export const parseDopAmount = (text: string | null | undefined): number => {
  const raw = String(text ?? '').replace(/[^0-9.,]/g, '');
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastDot > lastComma
      ? raw.replace(/,/g, '')
      : raw.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const decimals = raw.length - lastComma - 1;
    normalized = decimals === 3 ? raw.replace(/,/g, '') : raw.replace(/,/g, '.');
  } else {
    normalized = raw;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(n) : 0;
};

// Los mismos patrones que la migración 20260918000000. El monto no se traga el punto final de la
// frase ("RD$3,000.00. Motivo…").
const CAPITAL_PAYMENT_PENALTY = /Penalidad \((\d+(?:\.\d+)?)%\): RD\$(\d[\d,]*(?:\.\d+)?)/i;
const PENALTY_CHARGE = /^(?:Agregar Cargo|add_charge)\s*:\s*penalty_fee/i;
const CHARGE_AMOUNT = /Monto: RD\$(\d[\d,]*(?:\.\d+)?)/i;

export interface HistoryRowLike {
  id: string;
  loan_id: string;
  description: string | null;
  created_at: string | null;
}

/** Penalidades leídas del TEXTO del historial (respaldo mientras no exista la tabla). */
export const penaltiesFromHistory = (rows: HistoryRowLike[]): LoanPenalty[] => {
  const out: LoanPenalty[] = [];
  for (const h of rows || []) {
    const desc = String(h?.description || '');
    const abono = desc.match(CAPITAL_PAYMENT_PENALTY);
    if (abono) {
      const amount = parseDopAmount(abono[2]);
      if (amount > 0.005) {
        out.push({
          id: `h-${h.id}`, loan_id: h.loan_id, amount, percentage: Number(abono[1]), base_amount: null,
          source: 'capital_payment', loan_history_id: h.id,
          description: `Penalidad del abono a capital (${abono[1]}%)`, created_at: String(h.created_at || ''),
        });
      }
      continue;
    }
    if (PENALTY_CHARGE.test(desc)) {
      const amount = parseDopAmount(desc.match(CHARGE_AMOUNT)?.[1]);
      if (amount > 0.005) {
        out.push({
          id: `h-${h.id}`, loan_id: h.loan_id, amount, percentage: null, base_amount: null,
          source: 'charge', loan_history_id: h.id,
          description: 'Cargo por Penalización', created_at: String(h.created_at || ''),
        });
      }
    }
  }
  return out;
};

export interface PenaltyTotals {
  total: number;
  count: number;
}

/** Total y cantidad de penalidades. */
export const summarizePenalties = (rows: Array<Pick<LoanPenalty, 'amount'>>): PenaltyTotals => ({
  total: round2((rows || []).reduce((s, p) => s + (Number(p?.amount) || 0), 0)),
  count: (rows || []).filter(p => (Number(p?.amount) || 0) > 0.005).length,
});

/** Total acumulado por préstamo. */
export const penaltyTotalsByLoan = (
  rows: Array<Pick<LoanPenalty, 'loan_id' | 'amount'>>,
): Map<string, PenaltyTotals> => {
  const out = new Map<string, PenaltyTotals>();
  for (const p of rows || []) {
    const amount = Number(p?.amount) || 0;
    if (amount <= 0.005) continue;
    const prev = out.get(p.loan_id) || { total: 0, count: 0 };
    out.set(p.loan_id, { total: round2(prev.total + amount), count: prev.count + 1 });
  }
  return out;
};

/** La tabla `loan_penalties` todavía no existe en la base (migración sin aplicar). */
export const isMissingPenaltiesTable = (error: unknown): boolean => {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = String(e.message || '');
  // 42P01: la relación no existe (Postgres). PGRST205: PostgREST no la tiene en su caché.
  return e.code === '42P01' || e.code === 'PGRST205'
    || (/loan_penalties/i.test(msg) && /(does not exist|could not find the table)/i.test(msg));
};

const CHUNK = 120;

const normalizeRow = (r: any): LoanPenalty => ({
  id: String(r.id),
  loan_id: String(r.loan_id),
  amount: round2(Number(r.amount) || 0),
  percentage: r.percentage === null || r.percentage === undefined ? null : Number(r.percentage),
  base_amount: r.base_amount === null || r.base_amount === undefined ? null : round2(Number(r.base_amount)),
  source: (['capital_payment', 'charge', 'other'].includes(r.source) ? r.source : 'other') as PenaltySource,
  capital_payment_id: r.capital_payment_id ?? null,
  installment_id: r.installment_id ?? null,
  loan_history_id: r.loan_history_id ?? null,
  description: r.description ?? null,
  created_at: String(r.created_at || ''),
});

/**
 * Penalidades de varios préstamos, de la más antigua a la más reciente.
 * `fromHistory` indica que la tabla no existe y se leyeron del historial.
 */
export async function fetchLoanPenalties(
  supabase: SupabaseClient,
  loanIds: string[],
): Promise<{ rows: LoanPenalty[]; fromHistory: boolean }> {
  const ids = Array.from(new Set((loanIds || []).filter(Boolean)));
  if (ids.length === 0) return { rows: [], fromHistory: false };

  const rows: LoanPenalty[] = [];
  let missingTable = false;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('loan_penalties' as any)
      .select('id, loan_id, amount, percentage, base_amount, source, capital_payment_id, installment_id, loan_history_id, description, created_at')
      .in('loan_id', part)
      .order('created_at', { ascending: true });
    if (error) {
      if (isMissingPenaltiesTable(error)) { missingTable = true; break; }
      console.error('[penalidades] fallo al leer loan_penalties:', error);
      continue;
    }
    rows.push(...((data || []) as any[]).map(normalizeRow));
  }
  if (!missingTable) return { rows, fromHistory: false };

  console.warn(
    '[penalidades] la tabla loan_penalties no existe todavía: se leen del historial. ' +
    'Aplica la migración 20260918000000_loan_penalties.sql para guardarlas.',
  );
  const history: HistoryRowLike[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('loan_history')
      .select('id, loan_id, description, created_at')
      .in('loan_id', part)
      .order('created_at', { ascending: true });
    if (error) { console.error('[penalidades] fallo al leer el historial:', error); continue; }
    history.push(...((data || []) as HistoryRowLike[]));
  }
  return { rows: penaltiesFromHistory(history), fromHistory: true };
}

export interface NewLoanPenalty {
  loan_id: string;
  amount: number;
  source: PenaltySource;
  percentage?: number | null;
  base_amount?: number | null;
  capital_payment_id?: string | null;
  installment_id?: string | null;
  description?: string | null;
  created_by?: string | null;
}

/**
 * Registra una penalidad. Devuelve su id, o null si no se pudo (nunca lanza: una penalidad que no
 * se guarda no debe tumbar el abono a capital ni el cargo, que ya se registraron).
 * No duplica: si el abono o el cargo ya tienen su penalidad, devuelve la existente.
 */
export async function recordLoanPenalty(
  supabase: SupabaseClient,
  input: NewLoanPenalty,
): Promise<string | null> {
  const amount = round2(Number(input.amount) || 0);
  if (!input.loan_id || amount <= 0.005) return null;

  try {
    const linkColumn = input.capital_payment_id ? 'capital_payment_id' : input.installment_id ? 'installment_id' : null;
    const linkValue = input.capital_payment_id || input.installment_id || null;
    if (linkColumn && linkValue) {
      const { data: existing, error: existingError } = await supabase
        .from('loan_penalties' as any)
        .select('id')
        .eq(linkColumn, linkValue)
        .limit(1);
      if (existingError && isMissingPenaltiesTable(existingError)) {
        console.warn('[penalidades] no se guardó: falta aplicar la migración 20260918000000_loan_penalties.sql');
        return null;
      }
      const found = (existing as any[] | null)?.[0];
      if (found?.id) {
        console.log('[penalidades] ya estaba registrada:', found.id);
        return String(found.id);
      }
    }

    const payload = {
      loan_id: input.loan_id,
      amount,
      source: input.source,
      percentage: input.percentage ?? null,
      base_amount: input.base_amount !== null && input.base_amount !== undefined ? round2(input.base_amount) : null,
      capital_payment_id: input.capital_payment_id ?? null,
      installment_id: input.installment_id ?? null,
      description: input.description ?? null,
      created_by: input.created_by ?? null,
    };
    console.log('[penalidades] registrando:', payload);
    const { data, error } = await supabase
      .from('loan_penalties' as any)
      .insert([payload])
      .select('id')
      .single();
    if (error) {
      if (isMissingPenaltiesTable(error)) {
        console.warn('[penalidades] no se guardó: falta aplicar la migración 20260918000000_loan_penalties.sql');
      } else {
        console.error('[penalidades] error guardando la penalidad:', error);
      }
      return null;
    }
    const id = (data as any)?.id ? String((data as any).id) : null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOAN_PENALTIES_EVENT, { detail: { loanId: input.loan_id } }));
    }
    return id;
  } catch (err) {
    console.error('[penalidades] error inesperado guardando la penalidad:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ¿Qué CARGOS son en realidad una penalidad?
// ---------------------------------------------------------------------------
// FALLO REPORTADO (2026-10-14): "cuando se agrega un cargo a un préstamo y se le pone como razón
// penalidad, no cuenta como una penalidad como tal, sino que sigue siendo un cargo normal y
// corriente". Un "Cargo por Penalización" se guarda como un cargo más de `installments` —y así
// debe ser, porque se cobra igual que un cargo—, pero en pantalla no había forma de distinguirlo:
// salía como "Cargo #2" y el usuario lo leía como otro cargo distinto de la penalidad que enseña
// la tarjeta, es decir, como si el mismo dinero se debiera dos veces.
//
// Aquí se emparejan las penalidades con sus cargos: por `installment_id` cuando la tabla
// `loan_penalties` existe, y por monto y día cuando se están leyendo del historial (mientras la
// migración 20260918000000 no esté aplicada).

export interface ChargeLike {
  id?: string | null;
  total_amount?: number | null;
  amount?: number | null;
  created_at?: string | null;
}

const dayOf = (v: unknown): string => String(v ?? '').split('T')[0];
const chargeAmount = (c: ChargeLike): number =>
  round2(Number(c?.total_amount ?? c?.amount ?? 0) || 0);

/**
 * Devuelve el conjunto de ids de cargos que SON una penalidad.
 *
 * `charges` son las filas de `installments` que ya se identificaron como cargos.
 */
export const penaltyChargeIds = (
  penalties: Array<Pick<LoanPenalty, 'amount' | 'source' | 'installment_id' | 'created_at'>>,
  charges: ChargeLike[],
): Set<string> => {
  const out = new Set<string>();
  const porId = new Set(
    (penalties || []).map(p => String(p?.installment_id || '')).filter(Boolean),
  );
  const libres = (charges || []).filter(c => c?.id && !porId.has(String(c.id)));

  for (const c of charges || []) {
    if (c?.id && porId.has(String(c.id))) out.add(String(c.id));
  }

  // Las que no traen `installment_id` (leídas del historial): por monto y, si se sabe, por día.
  const usados = new Set<string>();
  for (const p of (penalties || []).filter(x => x?.source === 'charge' && !x?.installment_id)) {
    const monto = round2(Number(p?.amount) || 0);
    const dia = dayOf(p?.created_at);
    const candidato = libres.find(c => {
      const id = String(c.id);
      if (usados.has(id)) return false;
      if (Math.abs(chargeAmount(c) - monto) > 0.01) return false;
      const diaCargo = dayOf(c.created_at);
      // Si alguno de los dos no trae fecha, basta con que coincida el monto.
      return !dia || !diaCargo || dia === diaCargo;
    });
    if (candidato?.id) {
      usados.add(String(candidato.id));
      out.add(String(candidato.id));
    }
  }
  return out;
};

/** Cuánto de lo que se debe en cargos es, en realidad, penalidad. */
export const penaltyAmountInCharges = (
  penaltyIds: Set<string>,
  charges: Array<ChargeLike & { pending?: number | null }>,
): number => round2((charges || []).reduce((sum, c) => {
  if (!c?.id || !penaltyIds.has(String(c.id))) return sum;
  const pendiente = c.pending === null || c.pending === undefined
    ? chargeAmount(c)
    : round2(Number(c.pending) || 0);
  return sum + Math.max(0, pendiente);
}, 0));

/** Enlaza una penalidad con la entrada del historial que la describe. */
export async function linkPenaltyToHistory(
  supabase: SupabaseClient,
  penaltyId: string | null,
  historyId: string | null | undefined,
): Promise<void> {
  if (!penaltyId || !historyId) return;
  const { error } = await supabase
    .from('loan_penalties' as any)
    .update({ loan_history_id: historyId })
    .eq('id', penaltyId);
  if (error) console.warn('[penalidades] no se pudo enlazar con el historial:', error);
}
