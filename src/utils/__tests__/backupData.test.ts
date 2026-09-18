// Respaldo: exportación completa e importación de TODAS las columnas.
//
// CAMBIO SOLICITADO (2026-09-18): "el back up hay que actualizarlo, ya que hay datos que no está
// exportando y por ende no está importando, por ejemplo todo el tema de la cédula, la foto, ni
// dirección, ni ubicación".
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

// exportUtils trae jsPDF, que en Node no hace falta para estas pruebas.
vi.mock('jspdf', () => ({ default: class {} }));
vi.mock('jspdf-autotable', () => ({ default: () => undefined }));

import {
  buildClientPayload, buildLoanPayload, cleanImportRow, foreignKeyColumn, importClientRows,
  normalizeDniForImport, normalizeImportValue, notNullColumn, restoreLoansWithChildren,
  serializeRowForBackup, serializeRowsForBackup, sheetKeyFromName, BACKUP_SHEETS,
  type RestoreContext,
} from '../backupData';
import { parseCsvText } from '../exportUtils';

// ---------------------------------------------------------------------------
// Un cliente con todo lo que se añadió después del respaldo original
// ---------------------------------------------------------------------------
const CLIENTE = {
  id: 'c-viejo',
  user_id: 'empresa-vieja',
  full_name: 'María Pérez',
  first_name: 'María',
  last_name: 'Pérez',
  document_type: 'cedula',
  dni: '00112345678',
  jce_verified: true,
  jce_verified_at: '2026-09-02T14:00:00+00:00',
  photo_url: 'https://x.supabase.co/storage/v1/object/public/documents/user-1/client-photos/1.jpg',
  phone: '8095551234',
  whatsapp: '8295551234',
  address: 'Calle 5 #12, esquina Duarte',
  province: 'Santo Domingo',
  municipality: 'Santo Domingo Este',
  municipal_district: 'San Luis',
  sector: 'Los Mina',
  latitude: 18.4861234,
  longitude: -69.8601234,
  location_accuracy: 12,
  location_note: 'Casa verde, portón negro',
  location_updated_at: '2026-09-02T14:05:00+00:00',
  references_json: [{ name: 'Juan', phone: '8095550000' }],
  monthly_income: 45000,
  created_at: '2026-01-10T10:00:00+00:00',
};

/** Exporta a una hoja de Excel y la vuelve a leer, como hace el respaldo. */
const roundTripExcel = (rows: any[]) => {
  const ws = XLSX.utils.json_to_sheet(serializeRowsForBackup(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, BACKUP_SHEETS.clients);
  const bin = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
  const back = XLSX.read(bin, { type: 'binary' });
  return XLSX.utils.sheet_to_json<any>(back.Sheets[BACKUP_SHEETS.clients]);
};

describe('exportación', () => {
  it('Una columna JSON se guarda como JSON, no aplanada en columnas sueltas', () => {
    const out = serializeRowForBackup({ references_json: [{ name: 'Juan', phone: '1' }], meta: { a: 1, phone: 'x' } });
    expect(out.references_json).toBe('[{"name":"Juan","phone":"1"}]');
    expect(out.meta).toBe('{"a":1,"phone":"x"}');
    expect(out).not.toHaveProperty('meta_telefono');
  });

  it('El cliente anidado de un préstamo va en clients_dni / clients_nombre (formato de siempre)', () => {
    const out = serializeRowForBackup({ id: 'L1', amount: 1000, clients: { full_name: 'Ana', dni: '001', phone: '809' } });
    expect(out).toMatchObject({ clients_dni: '001', clients_nombre: 'Ana', clients_telefono: '809' });
    expect(out).not.toHaveProperty('clients');
  });

  it('Un texto más largo que una celda de Excel se recorta en vez de romper el archivo', () => {
    const out = serializeRowForBackup({ notes: 'x'.repeat(40000) });
    expect(out.notes.length).toBe(32767);
  });
});

describe('importación de clientes: TODAS las columnas', () => {
  it('EL CASO REPORTADO: cédula, foto, dirección y ubicación sobreviven al viaje Excel → base', () => {
    const [fila] = roundTripExcel([CLIENTE]);
    const payload = buildClientPayload(fila, 'empresa-nueva');

    expect(payload).toMatchObject({
      document_type: 'cedula',
      dni: '00112345678',
      jce_verified: true,
      photo_url: CLIENTE.photo_url,
      address: CLIENTE.address,
      province: 'Santo Domingo',
      municipality: 'Santo Domingo Este',
      municipal_district: 'San Luis',
      sector: 'Los Mina',
      latitude: 18.4861234,
      longitude: -69.8601234,
      location_accuracy: 12,
      location_note: 'Casa verde, portón negro',
      phone: '8095551234',
      whatsapp: '8295551234',
      monthly_income: 45000,
    });
    // La lista de referencias vuelve a ser una lista, no un texto
    expect(payload.references_json).toEqual([{ name: 'Juan', phone: '8095550000' }]);
    // Pasa a ser de la empresa que restaura; el id viejo no se reutiliza
    expect(payload.user_id).toBe('empresa-nueva');
    expect(payload).not.toHaveProperty('id');
  });

  it('Antes solo se restauraban 6 campos: ahora pasan todos los del archivo', () => {
    const payload = buildClientPayload(CLIENTE, 'e');
    const perdidosAntes = ['document_type', 'jce_verified', 'photo_url', 'province', 'municipality',
      'municipal_district', 'sector', 'latitude', 'longitude', 'location_note', 'whatsapp'];
    for (const col of perdidosAntes) expect(payload).toHaveProperty(col);
  });

  it('Sin full_name lo compone con nombre y apellido; un teléfono vacío queda en blanco', () => {
    const payload = buildClientPayload({ first_name: 'Ana', last_name: 'Gil', dni: '00112345678' }, 'e');
    expect(payload.full_name).toBe('Ana Gil');
    expect(payload.phone).toBe('');
  });

  it('Un teléfono que Excel convirtió en número vuelve a ser texto', () => {
    expect(buildClientPayload({ full_name: 'A', dni: '1', phone: 8095551234 }, 'e').phone).toBe('8095551234');
  });
});

describe('cédula', () => {
  it('Si Excel la convirtió en número se reponen los ceros a la izquierda', () => {
    expect(normalizeDniForImport(112345678, 'cedula')).toBe('00112345678');
    expect(normalizeDniForImport('112345678', 'cedula')).toBe('00112345678');
  });

  it('Una cédula guardada con otro formato se respeta (sigue coincidiendo con el cliente)', () => {
    expect(normalizeDniForImport('001-1234567-8', 'cedula')).toBe('001-1234567-8');
  });

  it('Un pasaporte no se toca', () => {
    expect(normalizeDniForImport('A1234567', 'pasaporte')).toBe('A1234567');
    expect(normalizeDniForImport(1234567, 'pasaporte')).toBe('1234567');
  });
});

describe('limpieza de filas', () => {
  it('Vacío → null; JSON → objeto; un texto que parece JSON pero no lo es queda igual', () => {
    expect(normalizeImportValue('')).toBeNull();
    expect(normalizeImportValue('   ')).toBeNull();
    expect(normalizeImportValue('["a","b"]')).toEqual(['a', 'b']);
    expect(normalizeImportValue('[Nota] pagó tarde')).toBe('[Nota] pagó tarde');
    expect(normalizeImportValue(0)).toBe(0);
    expect(normalizeImportValue(false)).toBe(false);
  });

  it('Se quitan las columnas derivadas del cliente anidado y las indicadas', () => {
    const out = cleanImportRow({ id: 'x', amount: 1, clients_dni: '1', clients_nombre: 'A', loans_monto: 5 }, ['id']);
    expect(out).toEqual({ amount: 1 });
  });
});

describe('importación de préstamos', () => {
  it('Montos con 2 decimales (antes se redondeaban a enteros) y alias de columnas hechas a mano', () => {
    const p = buildLoanPayload({ id: 'L', monto: '15000.456', tasa: 5, plazo: 12, monthly_payment: 1333.335 }, 'e');
    expect(p).toMatchObject({ amount: 15000.46, interest_rate: 5, term_months: 12, monthly_payment: 1333.34, loan_officer_id: 'e' });
    expect(p).not.toHaveProperty('monto');
    expect(p).not.toHaveProperty('id');
  });
});

describe('CSV', () => {
  it('Una dirección con coma ya no desplaza las columnas y la cédula conserva sus ceros', () => {
    const csv = '﻿dni,address,phone\n00112345678,"Calle 5, Los Mina",8095551234\n';
    const [fila] = parseCsvText(csv);
    expect(fila).toEqual({ dni: '00112345678', address: 'Calle 5, Los Mina', phone: '8095551234' });
  });
});

describe('errores de la base', () => {
  it('Reconoce la columna de una clave foránea rota y de un NOT NULL', () => {
    expect(foreignKeyColumn({ code: '23503', details: 'Key (portfolio_id)=(abc) is not present in table "portfolios".' })).toBe('portfolio_id');
    expect(notNullColumn({ code: '23502', message: 'null value in column "created_by" of relation "payments" violates not-null constraint' })).toBe('created_by');
  });

  it('Reconoce las hojas por nombre, también las de versiones anteriores', () => {
    expect(sheetKeyFromName('Clientes')).toBe('clients');
    expect(sheetKeyFromName('Abonos a capital')).toBe('capitalPayments');
    expect(sheetKeyFromName('Historial')).toBe('history');
    expect(sheetKeyFromName('Otra')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Base de datos falsa: registra lo que se escribe y responde lo que diga el caso
// ---------------------------------------------------------------------------
type Op = { table: string; action: 'select' | 'insert' | 'update'; payload?: any; filters: Array<[string, string, any]> };

const fakeSupabase = (handler: (op: Op) => { data: any; error: any }) => {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, action: 'select', filters: [] };
    const builder: any = {
      select: () => builder,
      insert: (payload: any) => { op.action = 'insert'; op.payload = payload; return builder; },
      update: (payload: any) => { op.action = 'update'; op.payload = payload; return builder; },
      eq: (c: string, v: any) => { op.filters.push(['eq', c, v]); return builder; },
      in: (c: string, v: any) => { op.filters.push(['in', c, v]); return builder; },
      limit: () => builder,
      order: () => builder,
      range: () => builder,
      then: (resolve: any, reject: any) => {
        const snapshot = { ...op, payload: op.payload ? JSON.parse(JSON.stringify(op.payload)) : op.payload };
        ops.push(snapshot);
        return Promise.resolve(handler(snapshot)).then(resolve, reject);
      },
    };
    return builder;
  };
  return { client: { from } as any, ops };
};

describe('restauración contra la base', () => {
  it('Si la base aún no tiene una columna (migración sin aplicar) se omite y el cliente se crea igual', async () => {
    let intentos = 0;
    const db = fakeSupabase(op => {
      if (op.action === 'select') return { data: [], error: null };
      intentos++;
      const row = op.payload[0];
      if ('location_note' in row) {
        return { data: null, error: { code: 'PGRST204', message: "Could not find the 'location_note' column of 'clients' in the schema cache" } };
      }
      return { data: [{ id: 'c-nuevo' }], error: null };
    });
    const ctx: RestoreContext = { supabase: db.client, companyId: 'e', userId: 'u' };

    const { result, clientIdByOldId } = await importClientRows(ctx, [CLIENTE]);
    expect(result).toMatchObject({ inserted: 1, errors: 0 });
    expect(intentos).toBe(2);
    expect(clientIdByOldId.get('c-viejo')).toBe('c-nuevo');
    const escrito = db.ops.filter(o => o.action === 'insert').pop()!.payload[0];
    expect(escrito.latitude).toBe(18.4861234); // lo demás sigue
    expect(escrito).not.toHaveProperty('location_note');
  });

  it('Un cliente que ya existe (misma cédula) se ACTUALIZA, no se duplica', async () => {
    const db = fakeSupabase(op => op.action === 'select'
      ? { data: [{ id: 'c-existente' }], error: null }
      : { data: null, error: null });
    const ctx: RestoreContext = { supabase: db.client, companyId: 'e', userId: 'u' };

    const { result } = await importClientRows(ctx, [CLIENTE]);
    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    const update = db.ops.find(o => o.action === 'update')!;
    expect(update.filters).toContainEqual(['eq', 'id', 'c-existente']);
    expect(update.payload.sector).toBe('Los Mina');
  });

  it('Préstamo con cuotas, pagos, abono y penalidad: todo se enlaza al préstamo NUEVO', async () => {
    let n = 0;
    const db = fakeSupabase(op => {
      if (op.action === 'select') {
        // Ningún préstamo del archivo sigue existiendo
        return { data: [], error: null };
      }
      const rows = op.payload as any[];
      return { data: rows.map(() => ({ id: `${op.table}-nuevo-${++n}` })), error: null };
    });
    const ctx: RestoreContext = { supabase: db.client, companyId: 'e', userId: 'u' };

    const out = await restoreLoansWithChildren(ctx, {
      loans: [{ id: 'L-viejo', client_id: 'c-viejo', amount: 10000, interest_rate: 5, term_months: 12, clients_dni: '00112345678' }],
      installments: [{ id: 'i1', loan_id: 'L-viejo', installment_number: 1, total_amount: 1000 }],
      payments: [{ id: 'p1', loan_id: 'L-viejo', amount: 1000, company_id: 'empresa-vieja' }, { id: 'p2', loan_id: 'OTRO', amount: 5 }],
      capitalPayments: [{ id: 'cp1', loan_id: 'L-viejo', amount: 2000, capital_before: 10000, capital_after: 8000 }],
      penalties: [{ id: 'pen1', loan_id: 'L-viejo', amount: 200, source: 'capital_payment', capital_payment_id: 'cp1' }],
    }, new Map([['c-viejo', 'c-nuevo']]), new Map());

    expect(out.loans).toMatchObject({ inserted: 1, errors: 0 });
    const loanInsert = db.ops.find(o => o.table === 'loans' && o.action === 'insert')!;
    expect(loanInsert.payload[0]).toMatchObject({ client_id: 'c-nuevo', loan_officer_id: 'e', amount: 10000 });
    const newLoanId = 'loans-nuevo-1';

    const pago = db.ops.find(o => o.table === 'payments' && o.action === 'insert')!;
    expect(pago.payload).toHaveLength(1); // el pago de otro préstamo no se restaura
    expect(pago.payload[0]).toMatchObject({ loan_id: newLoanId, company_id: 'e' });
    expect(out.payments).toMatchObject({ inserted: 1, skipped: 1 });

    const cuota = db.ops.find(o => o.table === 'installments' && o.action === 'insert')!;
    expect(cuota.payload[0].loan_id).toBe(newLoanId);

    const abono = db.ops.find(o => o.table === 'capital_payments' && o.action === 'insert')!;
    const penalidad = db.ops.find(o => o.table === 'loan_penalties' && o.action === 'insert')!;
    expect(penalidad.payload[0]).toMatchObject({ loan_id: newLoanId, amount: 200 });
    // Apunta al abono NUEVO, no al id del archivo
    expect(penalidad.payload[0].capital_payment_id).toMatch(/^capital_payments-nuevo-/);
    expect(abono.payload[0]).not.toHaveProperty('id');
  });

  it('Un préstamo que sigue existiendo no se duplica, ni sus pagos', async () => {
    const db = fakeSupabase(op => op.action === 'select'
      ? { data: [{ id: 'L-viejo' }], error: null }
      : { data: [{ id: 'x' }], error: null });
    const ctx: RestoreContext = { supabase: db.client, companyId: 'e', userId: 'u' };

    const out = await restoreLoansWithChildren(ctx, {
      loans: [{ id: 'L-viejo', client_id: 'c', amount: 1, interest_rate: 1, term_months: 1 }],
      payments: [{ id: 'p1', loan_id: 'L-viejo', amount: 1 }],
    }, new Map([['c', 'c2']]), new Map());

    expect(out.loans).toMatchObject({ inserted: 0, skipped: 1 });
    expect(db.ops.some(o => o.action === 'insert')).toBe(false);
  });
});
