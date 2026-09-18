// ============================================================================
// RESPALDO: qué se exporta y cómo se restaura
// ============================================================================
// CAMBIO SOLICITADO (2026-09-18): "el back up hay que actualizarlo, ya que hay datos que no está
// exportando y por ende no está importando, por ejemplo todo el tema de la cédula, la foto, ni
// dirección, ni ubicación".
//
// QUÉ FALLABA
//   · La IMPORTACIÓN de clientes solo escribía 6 campos (nombre, cédula, teléfono, email,
//     dirección y ciudad). Todo lo que se añadió después —tipo de documento y verificación JCE,
//     foto, provincia/municipio/distrito/sector, coordenadas GPS, datos laborales y bancarios…—
//     se perdía al restaurar.
//   · La EXPORTACIÓN leía como mucho 1,000 filas por tabla (el tope de Supabase por consulta):
//     una cartera con más pagos quedaba respaldada a medias sin ningún aviso.
//   · Los pagos se filtraban por `created_by = empresa`, así que los que registró un EMPLEADO no
//     entraban en el respaldo.
//   · Las columnas JSON se aplanaban en columnas sueltas y no se podían volver a importar.
//   · Un préstamo restaurado quedaba SIN cuotas, pagos ni abonos: no se importaban.
//
// AHORA el respaldo completo exporta cada tabla entera (paginada), con TODAS sus columnas, y
// añade las hojas de Cuotas, Abonos a capital, Penalidades e Historial. La importación
// restaura todas las columnas que traiga el archivo y reconstruye los préstamos con sus cuotas,
// pagos, abonos, penalidades e historial, enlazados a los préstamos nuevos.
//
// Si la base todavía no tiene alguna columna del archivo (migración sin aplicar), esa columna se
// omite y se sigue: el resto del registro se restaura igual.

import type { SupabaseClient } from '@supabase/supabase-js';
import { findMissingColumn } from './supabaseErrors';

type Row = Record<string, any>;

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Nombres de hoja del Excel. Son los que busca la importación. */
export const BACKUP_SHEETS = {
  clients: 'Clientes',
  loans: 'Préstamos',
  installments: 'Cuotas',
  payments: 'Pagos',
  capitalPayments: 'Abonos a capital',
  penalties: 'Penalidades',
  history: 'Historial préstamos',
  inventory: 'Inventario',
  sales: 'Ventas',
  pawnshop: 'Empeños',
  documents: 'Documentos',
  requests: 'Solicitudes',
  agreements: 'Acuerdos',
  expenses: 'Gastos',
} as const;

export type BackupSheetKey = keyof typeof BACKUP_SHEETS;

/** Tope de caracteres de una celda de Excel. */
export const EXCEL_CELL_LIMIT = 32767;

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

/**
 * Prepara una fila para el Excel sin perder información:
 *  · el cliente anidado de un préstamo/pago va en `clients_dni`, `clients_nombre`,
 *    `clients_telefono` (el formato de siempre, que la importación reconoce);
 *  · cualquier otro objeto o lista (columnas JSON, etiquetas) se guarda como JSON, que es lo que
 *    la importación sabe volver a leer. Antes se aplanaba en columnas sueltas.
 */
export const serializeRowForBackup = (row: Row): Row => {
  const out: Row = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value === undefined) continue;
    if (value === null) { out[key] = null; continue; }
    if (value instanceof Date) { out[key] = value.toISOString(); continue; }
    if (Array.isArray(value)) { out[key] = JSON.stringify(value); continue; }
    if (typeof value === 'object') {
      if (key === 'clients' || key === 'client') {
        out.clients_nombre = value.full_name ?? null;
        out.clients_dni = value.dni ?? null;
        out.clients_telefono = value.phone ?? null;
      } else {
        out[key] = JSON.stringify(value);
      }
      continue;
    }
    if (typeof value === 'string' && value.length > EXCEL_CELL_LIMIT) {
      console.warn(`[respaldo] "${key}" supera el tope de Excel (${value.length} caracteres): se recorta`);
      out[key] = value.slice(0, EXCEL_CELL_LIMIT);
      continue;
    }
    out[key] = value;
  }
  return out;
};

export const serializeRowsForBackup = (rows: Row[]): Row[] => (rows || []).map(serializeRowForBackup);

const PAGE = 1000;
const ID_CHUNK = 120;

/** Lee TODAS las filas de una consulta, página a página (Supabase corta en 1,000). */
export async function fetchAllPages(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  label: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      console.error(`[respaldo] fallo al leer ${label}:`, error);
      throw Object.assign(new Error(`No se pudo leer ${label}: ${error.message || error.code || 'error'}`), { cause: error });
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Filas de una tabla hija para una lista de préstamos (por trozos y paginadas). */
async function fetchByLoanIds(
  supabase: SupabaseClient, table: string, loanIds: string[], label: string, optional = false,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < loanIds.length; i += ID_CHUNK) {
    const part = loanIds.slice(i, i + ID_CHUNK);
    try {
      rows.push(...await fetchAllPages(
        (from, to) => supabase.from(table as any).select('*').in('loan_id', part).order('id').range(from, to) as any,
        label,
      ));
    } catch (err) {
      // Una tabla opcional que no existe (migración sin aplicar) no debe tumbar el respaldo.
      if (optional) { console.warn(`[respaldo] se omite ${label}:`, err); return []; }
      throw err;
    }
  }
  return rows;
}

export interface BackupSheet {
  key: BackupSheetKey;
  name: string;
  rows: Row[];
}

/** Tablas de la empresa que se leen enteras: tabla, columna de la empresa y si es opcional. */
const COMPANY_TABLES: Partial<Record<BackupSheetKey, { table: string; column: string; label: string; optional?: boolean }>> = {
  clients: { table: 'clients', column: 'user_id', label: 'clientes' },
  inventory: { table: 'products', column: 'user_id', label: 'inventario', optional: true },
  sales: { table: 'sales', column: 'user_id', label: 'ventas', optional: true },
  pawnshop: { table: 'pawn_transactions', column: 'user_id', label: 'empeños', optional: true },
  documents: { table: 'documents', column: 'user_id', label: 'documentos', optional: true },
  requests: { table: 'loan_requests', column: 'user_id', label: 'solicitudes', optional: true },
  agreements: { table: 'payment_agreements', column: 'user_id', label: 'acuerdos', optional: true },
  expenses: { table: 'expenses', column: 'created_by', label: 'gastos', optional: true },
};

/** Tablas que cuelgan de un préstamo: se leen por `loan_id` de los préstamos de la empresa. */
const LOAN_TABLES: Partial<Record<BackupSheetKey, { table: string; label: string; optional?: boolean }>> = {
  installments: { table: 'installments', label: 'cuotas' },
  // Por préstamo, NO por `created_by`: los pagos que registra un empleado también son de la
  // empresa. Antes quedaban fuera del respaldo.
  payments: { table: 'payments', label: 'pagos' },
  capitalPayments: { table: 'capital_payments', label: 'abonos a capital' },
  penalties: { table: 'loan_penalties', label: 'penalidades', optional: true },
  history: { table: 'loan_history', label: 'historial de préstamos', optional: true },
};

/** Préstamos de la empresa (sin los eliminados) con la cédula de su cliente. */
const fetchCompanyLoans = (supabase: SupabaseClient, companyId: string) =>
  fetchAllPages(
    (from, to) => supabase.from('loans')
      .select('*, clients(full_name, dni, phone)')
      .eq('loan_officer_id', companyId)
      .neq('status', 'deleted')
      .order('id')
      .range(from, to) as any,
    'préstamos',
  );

/**
 * Filas de UNA hoja, sin preparar para Excel. `loanIds` evita volver a leer los préstamos cuando
 * ya se tienen.
 */
export async function fetchBackupSheetRows(
  supabase: SupabaseClient, companyId: string, key: BackupSheetKey, loanIds?: string[],
): Promise<Row[]> {
  if (key === 'loans') return fetchCompanyLoans(supabase, companyId);

  const companyTable = COMPANY_TABLES[key];
  if (companyTable) {
    try {
      return await fetchAllPages(
        (from, to) => supabase.from(companyTable.table as any).select('*')
          .eq(companyTable.column, companyId).order('id').range(from, to) as any,
        companyTable.label,
      );
    } catch (err) {
      if (companyTable.optional) { console.warn(`[respaldo] se omite ${companyTable.label}:`, err); return []; }
      throw err;
    }
  }

  const loanTable = LOAN_TABLES[key];
  if (loanTable) {
    const ids = loanIds ?? (await fetchCompanyLoans(supabase, companyId)).map(l => String(l.id));
    return fetchByLoanIds(supabase, loanTable.table, ids, loanTable.label, loanTable.optional);
  }
  return [];
}

/** Todo lo que entra en el respaldo completo de una empresa, ya listo para el Excel. */
export async function fetchFullBackup(supabase: SupabaseClient, companyId: string): Promise<BackupSheet[]> {
  const loans = await fetchCompanyLoans(supabase, companyId);
  const loanIds = loans.map(l => String(l.id));

  const keys = Object.keys(BACKUP_SHEETS) as BackupSheetKey[];
  const rowsByKey = await Promise.all(
    keys.map(key => key === 'loans' ? Promise.resolve(loans) : fetchBackupSheetRows(supabase, companyId, key, loanIds)),
  );

  const sheets: BackupSheet[] = keys.map((key, i) => ({
    key, name: BACKUP_SHEETS[key], rows: serializeRowsForBackup(rowsByKey[i]),
  }));
  console.log('[respaldo] filas por hoja:', Object.fromEntries(sheets.map(s => [s.name, s.rows.length])));
  return sheets;
}

// ---------------------------------------------------------------------------
// Importación: limpieza de filas
// ---------------------------------------------------------------------------

/**
 * Valor de una celda tal como debe llegar a la base:
 *  · vacío → null;
 *  · texto con forma de JSON (`{…}` o `[…]`) → el objeto o la lista, que es como se exportó.
 */
export const normalizeImportValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return null;
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.parse(t); } catch { return value; }
    }
    return value;
  }
  return value;
};

/** Columnas que salen del cliente anidado o de otras hojas: no son de la tabla. */
const isDerivedColumn = (key: string) =>
  key.startsWith('clients_') || key.startsWith('loans_') || key.startsWith('__EMPTY')
  || key === 'mensaje' || key === 'error';

/** Fila del archivo → columnas para la base, sin las indicadas en `drop`. */
export const cleanImportRow = (row: Row, drop: string[] = []): Row => {
  const out: Row = {};
  const skip = new Set(drop);
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    const key = String(rawKey).trim();
    if (!key || skip.has(key) || isDerivedColumn(key)) continue;
    out[key] = normalizeImportValue(rawValue);
  }
  return out;
};

/**
 * La cédula como se guarda: 11 dígitos sin guiones. Si Excel la convirtió en número se
 * pierden los ceros a la izquierda ("00112345678" → 112345678): se reponen. Un documento que
 * ya venía como texto con otro formato se respeta tal cual, para que siga coincidiendo con el
 * cliente que ya existe.
 */
export const normalizeDniForImport = (dni: unknown, documentType?: unknown): string | null => {
  if (dni === null || dni === undefined) return null;
  const isCedula = String(documentType || 'cedula').toLowerCase() === 'cedula';
  if (typeof dni === 'number') {
    const s = String(Math.trunc(dni));
    return isCedula && s.length < 11 ? s.padStart(11, '0') : s;
  }
  const s = String(dni).trim();
  if (!s) return null;
  return isCedula && /^\d+$/.test(s) && s.length < 11 ? s.padStart(11, '0') : s;
};

/** Columnas de texto de `clients` que Excel puede haber convertido en números. */
const CLIENT_TEXT_COLUMNS = [
  'phone', 'whatsapp', 'phone_secondary', 'rnc', 'card_number', 'bank_user', 'bank_code',
  'bank_token_identifier', 'account_number', 'routing_number', 'emergency_contact_phone',
  'spouse_phone', 'workplace_phone', 'supervisor_phone', 'custom_field_1', 'custom_field_2',
];

/** Columnas de dinero de `loans`: siempre con dos decimales (antes se redondeaban a enteros). */
const LOAN_MONEY_COLUMNS = [
  'amount', 'monthly_payment', 'total_amount', 'remaining_balance', 'closing_costs',
  'fixed_payment_amount', 'max_late_fee', 'current_late_fee', 'total_late_fee_paid',
];

/** Nombres alternativos que aceptaba la importación de préstamos hecha a mano. */
const LOAN_ALIASES: Record<string, string> = {
  monto: 'amount', tasa: 'interest_rate', tasa_interes: 'interest_rate', interestrate: 'interest_rate',
  plazo: 'term_months', term: 'term_months', termmonths: 'term_months',
};

/** Cliente del archivo → fila de `clients` (todas sus columnas). */
export const buildClientPayload = (row: Row, companyId: string): Row => {
  const p = cleanImportRow(row, ['id', 'user_id', 'company_id']);
  for (const col of CLIENT_TEXT_COLUMNS) {
    if (typeof p[col] === 'number') p[col] = String(p[col]);
  }
  p.dni = normalizeDniForImport(row.dni, row.document_type);
  if (!p.full_name) {
    const composed = `${String(p.first_name || '').trim()} ${String(p.last_name || '').trim()}`.trim();
    if (composed) p.full_name = composed;
  }
  if (p.phone === null || p.phone === undefined) p.phone = ''; // columna obligatoria
  p.user_id = companyId;
  if ('company_id' in (row || {})) p.company_id = companyId;
  p.updated_at = new Date().toISOString();
  return p;
};

/** Préstamo del archivo → fila de `loans` (todas sus columnas), sin cliente asignado aún. */
export const buildLoanPayload = (row: Row, companyId: string): Row => {
  const p = cleanImportRow(row, ['id', 'client_id', 'loan_officer_id', 'clients', 'client', 'company_id']);
  if ('company_id' in (row || {})) p.company_id = companyId;
  for (const [alias, column] of Object.entries(LOAN_ALIASES)) {
    if (p[alias] !== undefined) {
      if (p[column] === undefined || p[column] === null) p[column] = p[alias];
      delete p[alias];
    }
  }
  for (const col of LOAN_MONEY_COLUMNS) {
    if (p[col] !== null && p[col] !== undefined && p[col] !== '') {
      const n = Number(p[col]);
      if (Number.isFinite(n)) p[col] = round2(n);
    }
  }
  p.loan_officer_id = companyId;
  return p;
};

/** DNI del cliente de un préstamo en el archivo (columna del export o variantes a mano). */
export const loanRowClientDni = (row: Row): string | null => {
  const raw = row.clients_dni ?? row.client_dni ?? row['clients.dni'] ?? row['client.dni'] ?? row.dni ?? null;
  return normalizeDniForImport(raw, row.clients_document_type ?? 'cedula');
};

// ---------------------------------------------------------------------------
// Importación: escritura con reparación
// ---------------------------------------------------------------------------

/** Columna de una violación de clave foránea ("Key (portfolio_id)=(…) is not present"). */
export const foreignKeyColumn = (error: unknown): string | null => {
  const e = (error ?? {}) as { code?: string; details?: string; message?: string };
  if (e.code !== '23503') return null;
  const m = `${e.details || ''} ${e.message || ''}`.match(/Key \(([a-zA-Z0-9_]+)\)=/);
  return m ? m[1] : null;
};

/** Columna de una violación de NOT NULL ('null value in column "created_by" …'). */
export const notNullColumn = (error: unknown): string | null => {
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code !== '23502') return null;
  const m = String(e.message || '').match(/column "([a-zA-Z0-9_]+)"/);
  return m ? m[1] : null;
};

/** Columnas de "quién lo registró": si el usuario original ya no existe, pasa a ser quien restaura. */
const AUTHOR_COLUMNS = new Set(['created_by']);

/**
 * Inserta (o actualiza) reparando lo que se pueda reparar sin inventar datos:
 *  · columna que la base no tiene → se omite;
 *  · referencia a un registro que ya no existe (una cartera borrada, un usuario) → se deja vacía;
 *  · autor obligatorio que ya no existe → el usuario que restaura.
 * Cualquier otro error se devuelve tal cual.
 */
async function writeWithRepair(
  run: (payload: Row[]) => PromiseLike<{ data: any; error: any }>,
  rows: Row[],
  label: string,
  currentUserId?: string,
): Promise<{ data: any; error: any }> {
  const payload = rows.map(r => ({ ...r }));
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data, error } = await run(payload);
    if (!error) return { data, error: null };

    const missing = findMissingColumn(error);
    if (missing && missing !== 'desconocida' && payload.some(r => missing in r)) {
      console.warn(`[respaldo] ${label}: la base no tiene la columna "${missing}"; se omite (falta una migración)`);
      payload.forEach(r => { delete r[missing]; });
      continue;
    }
    const fk = foreignKeyColumn(error);
    if (fk && payload.some(r => r[fk] !== null && r[fk] !== undefined)) {
      console.warn(`[respaldo] ${label}: "${fk}" apunta a un registro que ya no existe; se deja vacío`);
      payload.forEach(r => { if (fk in r) r[fk] = null; });
      continue;
    }
    const required = notNullColumn(error);
    if (required && AUTHOR_COLUMNS.has(required) && currentUserId && payload.some(r => r[required] !== currentUserId)) {
      console.warn(`[respaldo] ${label}: "${required}" es obligatorio; se pone el usuario que restaura`);
      payload.forEach(r => { r[required] = currentUserId; });
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: new Error(`${label}: demasiados reintentos`) };
}

export interface SheetResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  /** Primeros motivos de error, para enseñarlos */
  messages: string[];
}

const emptyResult = (): SheetResult => ({ inserted: 0, updated: 0, skipped: 0, errors: 0, messages: [] });

const noteError = (result: SheetResult, message: string) => {
  result.errors++;
  if (result.messages.length < 5) result.messages.push(message);
};

const errorText = (error: any) => String(error?.message || error?.details || error?.code || error || 'error');

export interface RestoreContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  onProgress?: (message: string) => void;
}

/** Restaura clientes: actualiza el que ya existe (misma cédula) y crea los demás. */
export async function importClientRows(ctx: RestoreContext, rows: Row[]): Promise<{
  result: SheetResult; clientIdByOldId: Map<string, string>; clientIdByDni: Map<string, string>;
}> {
  const { supabase, companyId } = ctx;
  const result = emptyResult();
  const clientIdByOldId = new Map<string, string>();
  const clientIdByDni = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i % 25 === 0) ctx.onProgress?.(`Clientes: ${i + 1} de ${rows.length}`);
    const payload = buildClientPayload(row, companyId);
    if (!payload.full_name || !payload.dni) {
      noteError(result, `Fila ${i + 2}: falta el nombre o la cédula`);
      continue;
    }
    if (typeof payload.photo_url === 'string' && payload.photo_url.includes('/object/sign/')) {
      console.warn(`[respaldo] la foto de ${payload.full_name} es un enlace temporal (firmado) que ya pudo caducar`);
    }

    try {
      const { data: existing } = await supabase
        .from('clients').select('id').eq('user_id', companyId).eq('dni', payload.dni).limit(1);
      const existingId = (existing as any[] | null)?.[0]?.id as string | undefined;

      if (existingId) {
        const { error } = await writeWithRepair(
          ([p]) => supabase.from('clients').update(p as any).eq('id', existingId),
          [payload], 'clientes', ctx.userId,
        );
        if (error) { noteError(result, `${payload.full_name}: ${errorText(error)}`); continue; }
        result.updated++;
        clientIdByDni.set(payload.dni, existingId);
        if (row.id) clientIdByOldId.set(String(row.id), existingId);
      } else {
        if (!payload.created_by) payload.created_by = ctx.userId;
        const { data, error } = await writeWithRepair(
          p => supabase.from('clients').insert(p as any).select('id'),
          [payload], 'clientes', ctx.userId,
        );
        if (error) {
          const msg = error?.code === '23505'
            ? `${payload.full_name}: la cédula ${payload.dni} ya está registrada (en otra empresa)`
            : `${payload.full_name}: ${errorText(error)}`;
          noteError(result, msg);
          continue;
        }
        const newId = (data as any[] | null)?.[0]?.id as string | undefined;
        result.inserted++;
        if (newId) {
          clientIdByDni.set(payload.dni, newId);
          if (row.id) clientIdByOldId.set(String(row.id), newId);
        }
      }
    } catch (err) {
      noteError(result, `${payload.full_name}: ${errorText(err)}`);
    }
  }
  console.log('[respaldo] clientes restaurados:', result);
  return { result, clientIdByOldId, clientIdByDni };
}

/** Busca el cliente de un préstamo: por el id viejo (si vino en el mismo archivo) o por cédula. */
async function resolveClientId(
  ctx: RestoreContext, row: Row,
  clientIdByOldId: Map<string, string>, clientIdByDni: Map<string, string>,
): Promise<string | null> {
  if (row.client_id && clientIdByOldId.has(String(row.client_id))) return clientIdByOldId.get(String(row.client_id))!;
  const dni = loanRowClientDni(row);
  if (!dni) return null;
  if (clientIdByDni.has(dni)) return clientIdByDni.get(dni)!;
  const { data } = await ctx.supabase
    .from('clients').select('id').eq('user_id', ctx.companyId).eq('dni', dni).limit(1);
  const id = (data as any[] | null)?.[0]?.id as string | undefined;
  if (id) clientIdByDni.set(dni, id);
  return id || null;
}

/**
 * Restaura préstamos. Un préstamo cuyo id sigue existiendo en la empresa (se importa sobre una
 * base que no se vació) NO se duplica: se salta junto con sus cuotas y pagos, que ya están.
 */
export async function importLoanRows(
  ctx: RestoreContext, rows: Row[],
  clientIdByOldId = new Map<string, string>(), clientIdByDni = new Map<string, string>(),
): Promise<{ result: SheetResult; loanIdByOldId: Map<string, string> }> {
  const { supabase, companyId } = ctx;
  const result = emptyResult();
  const loanIdByOldId = new Map<string, string>();

  const oldIds = rows.map(r => r.id).filter(Boolean).map(String);
  const stillThere = new Set<string>();
  for (let i = 0; i < oldIds.length; i += ID_CHUNK) {
    const { data } = await supabase.from('loans').select('id').in('id', oldIds.slice(i, i + ID_CHUNK));
    ((data as any[]) || []).forEach(r => stillThere.add(String(r.id)));
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i % 10 === 0) ctx.onProgress?.(`Préstamos: ${i + 1} de ${rows.length}`);
    const oldId = row.id ? String(row.id) : null;
    if (oldId && stillThere.has(oldId)) { result.skipped++; continue; }

    try {
      const clientId = await resolveClientId(ctx, row, clientIdByOldId, clientIdByDni);
      if (!clientId) {
        noteError(result, `Fila ${i + 2}: no se encontró el cliente (cédula ${loanRowClientDni(row) || 'vacía'})`);
        continue;
      }
      const payload = buildLoanPayload(row, companyId);
      payload.client_id = clientId;
      if (!(Number(payload.amount) > 0)) { noteError(result, `Fila ${i + 2}: el monto no es válido`); continue; }

      const { data, error } = await writeWithRepair(
        p => supabase.from('loans').insert(p as any).select('id'),
        [payload], 'préstamos', ctx.userId,
      );
      if (error) { noteError(result, `Fila ${i + 2}: ${errorText(error)}`); continue; }
      const newId = (data as any[] | null)?.[0]?.id as string | undefined;
      result.inserted++;
      if (oldId && newId) loanIdByOldId.set(oldId, newId);
    } catch (err) {
      noteError(result, `Fila ${i + 2}: ${errorText(err)}`);
    }
  }
  console.log('[respaldo] préstamos restaurados:', result, `(${result.skipped} ya existían)`);
  return { result, loanIdByOldId };
}

interface ChildOptions {
  table: string;
  label: string;
  /** Columnas a quitar además de `id` */
  drop?: string[];
  /** Columnas que pasan a ser de la empresa que restaura */
  companyColumns?: string[];
  /** Reescribe referencias a otras filas restauradas (abono, cuota, historial) */
  remap?: (payload: Row, row: Row) => void;
  /** Devuelve el mapa id viejo → id nuevo (inserta de una en una) */
  trackIds?: boolean;
}

/** Restaura filas que cuelgan de un préstamo (cuotas, pagos, abonos, historial…). */
export async function importLoanChildRows(
  ctx: RestoreContext, rows: Row[], loanIdByOldId: Map<string, string>, opts: ChildOptions,
): Promise<{ result: SheetResult; idByOldId: Map<string, string> }> {
  const result = emptyResult();
  const idByOldId = new Map<string, string>();
  const payloads: Array<{ payload: Row; oldId: string | null }> = [];

  for (const row of rows) {
    const oldLoanId = row.loan_id ? String(row.loan_id) : null;
    const newLoanId = oldLoanId ? loanIdByOldId.get(oldLoanId) : undefined;
    // Préstamo que no se restauró (ya existía o falló): sus filas tampoco.
    if (!newLoanId) { result.skipped++; continue; }
    const payload = cleanImportRow(row, ['id', ...(opts.drop || [])]);
    payload.loan_id = newLoanId;
    for (const col of opts.companyColumns || []) {
      if (col in payload) payload[col] = ctx.companyId;
    }
    opts.remap?.(payload, row);
    payloads.push({ payload, oldId: row.id ? String(row.id) : null });
  }

  const BATCH = opts.trackIds ? 1 : 200;
  for (let i = 0; i < payloads.length; i += BATCH) {
    if (i % 200 === 0) ctx.onProgress?.(`${opts.label}: ${i + 1} de ${payloads.length}`);
    const batch = payloads.slice(i, i + BATCH);
    const { data, error } = await writeWithRepair(
      p => ctx.supabase.from(opts.table as any).insert(p as any).select('id'),
      batch.map(b => b.payload), opts.label, ctx.userId,
    );
    if (!error) {
      result.inserted += batch.length;
      if (opts.trackIds) {
        const newId = (data as any[] | null)?.[0]?.id;
        if (batch[0].oldId && newId) idByOldId.set(batch[0].oldId, String(newId));
      }
      continue;
    }
    if (batch.length === 1) { noteError(result, errorText(error)); continue; }
    // El lote falló por una fila: se reintenta de una en una para no perder las demás.
    for (const item of batch) {
      const single = await writeWithRepair(
        p => ctx.supabase.from(opts.table as any).insert(p as any).select('id'),
        [item.payload], opts.label, ctx.userId,
      );
      if (single.error) noteError(result, errorText(single.error));
      else result.inserted++;
    }
  }
  console.log(`[respaldo] ${opts.label} restaurados:`, result);
  return { result, idByOldId };
}

/**
 * Restaura préstamos con todo lo que cuelga de ellos, en orden: préstamos → cuotas → pagos →
 * abonos a capital → historial → penalidades (que apuntan al abono, la cuota y el historial).
 */
export async function restoreLoansWithChildren(
  ctx: RestoreContext,
  sheets: Partial<Record<BackupSheetKey, Row[]>>,
  clientIdByOldId: Map<string, string>,
  clientIdByDni: Map<string, string>,
): Promise<Partial<Record<BackupSheetKey, SheetResult>>> {
  const out: Partial<Record<BackupSheetKey, SheetResult>> = {};
  const { result: loans, loanIdByOldId } = await importLoanRows(ctx, sheets.loans || [], clientIdByOldId, clientIdByDni);
  out.loans = loans;
  if (loanIdByOldId.size === 0) return out;

  const installments = await importLoanChildRows(ctx, sheets.installments || [], loanIdByOldId, {
    table: 'installments', label: 'Cuotas', trackIds: (sheets.penalties || []).some(p => p.installment_id),
  });
  out.installments = installments.result;

  out.payments = (await importLoanChildRows(ctx, sheets.payments || [], loanIdByOldId, {
    table: 'payments', label: 'Pagos', companyColumns: ['company_id'],
  })).result;

  const capital = await importLoanChildRows(ctx, sheets.capitalPayments || [], loanIdByOldId, {
    table: 'capital_payments', label: 'Abonos a capital', trackIds: true,
  });
  out.capitalPayments = capital.result;

  const history = await importLoanChildRows(ctx, sheets.history || [], loanIdByOldId, {
    table: 'loan_history', label: 'Historial', trackIds: (sheets.penalties || []).some(p => p.loan_history_id),
  });
  out.history = history.result;

  out.penalties = (await importLoanChildRows(ctx, sheets.penalties || [], loanIdByOldId, {
    table: 'loan_penalties', label: 'Penalidades',
    remap: (payload, row) => {
      payload.capital_payment_id = row.capital_payment_id ? capital.idByOldId.get(String(row.capital_payment_id)) ?? null : null;
      payload.installment_id = row.installment_id ? installments.idByOldId.get(String(row.installment_id)) ?? null : null;
      payload.loan_history_id = row.loan_history_id ? history.idByOldId.get(String(row.loan_history_id)) ?? null : null;
    },
  })).result;

  return out;
}

/** Hoja del Excel → clave del respaldo (acepta los nombres de versiones anteriores). */
export const sheetKeyFromName = (name: string): BackupSheetKey | null => {
  const n = String(name || '').trim().toLowerCase();
  for (const [key, sheetName] of Object.entries(BACKUP_SHEETS)) {
    if (sheetName.toLowerCase() === n) return key as BackupSheetKey;
  }
  if (n === 'historial') return 'history';
  return null;
};
