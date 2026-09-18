// Penalidad del préstamo, préstamos por aprobar en el dashboard y frecuencia de los indefinidos.
//
// CAMBIOS SOLICITADOS (2026-09-18):
//   · "Si un préstamo no está aprobado no puede afectar el dashboard de inicio, deben afectar
//     después de ser aprobados."
//   · "Los préstamos indefinidos deben mostrar su forma de plazo, si es diario, quincenal,
//     mensual… debajo de donde dice indefinido."
//   · "Penalidad, es el monto que se agrega haciendo un abono a capital u otras actualizaciones y
//     debe tener un apartado en el préstamo que lo muestre y vaya sumando en caso de ser varias
//     veces."
import { describe, it, expect, vi } from 'vitest';
import {
  isMissingPenaltiesTable, parseDopAmount, penaltiesFromHistory, penaltyTotalsByLoan,
  recordLoanPenalty, summarizePenalties,
} from '../loanPenalties';
import {
  computePortfolioSnapshot, splitLoansForDashboard, buildMonthlySeries, CANCELLED_BEFORE_APPROVAL_REASON,
} from '../portfolioMetrics';
import { getFrequencyName } from '../frequencyUtils';

describe('penalidad: montos escritos en el historial', () => {
  it('Lee el formato es-DO que usa la app', () => {
    expect(parseDopAmount('3,000.00')).toBe(3000);
    expect(parseDopAmount('1,234,567.89')).toBe(1234567.89);
    expect(parseDopAmount('500')).toBe(500);
    expect(parseDopAmount('1.500,50')).toBe(1500.5);
    expect(parseDopAmount('')).toBe(0);
  });

  it('Recupera las penalidades de abonos y cargos desde el texto del historial', () => {
    const filas = penaltiesFromHistory([
      { id: 'h1', loan_id: 'L1', created_at: '2026-09-01T15:00:00Z',
        description: 'Abono a capital: RD$50,000.00. Penalidad (2%): RD$3,000.00. Abono voluntario' },
      { id: 'h2', loan_id: 'L1', created_at: '2026-09-10T15:00:00Z',
        description: 'Agregar Cargo: penalty_fee. Monto: RD$1,500.00. Notas: por atraso' },
      { id: 'h3', loan_id: 'L1', created_at: '2026-09-11T15:00:00Z',
        description: 'Agregar Cargo: legal_fee. Monto: RD$800.00' },
      { id: 'h4', loan_id: 'L2', created_at: '2026-09-12T15:00:00Z',
        description: 'Abono a capital: RD$10,000.00. ' },
    ]);
    expect(filas.map(f => [f.loan_id, f.source, f.amount, f.percentage])).toEqual([
      ['L1', 'capital_payment', 3000, 2],
      ['L1', 'charge', 1500, null],
    ]);
  });

  it('EL CASO: varias penalidades del mismo préstamo se van SUMANDO', () => {
    const filas = [
      { loan_id: 'L1', amount: 3000 },
      { loan_id: 'L1', amount: 1500.25 },
      { loan_id: 'L2', amount: 700 },
    ];
    const porPrestamo = penaltyTotalsByLoan(filas);
    expect(porPrestamo.get('L1')).toEqual({ total: 4500.25, count: 2 });
    expect(porPrestamo.get('L2')).toEqual({ total: 700, count: 1 });
    expect(summarizePenalties(filas)).toEqual({ total: 5200.25, count: 3 });
  });

  it('Distingue "la tabla no existe" (migración sin aplicar) de otros errores', () => {
    expect(isMissingPenaltiesTable({ code: 'PGRST205', message: "Could not find the table 'public.loan_penalties'" })).toBe(true);
    expect(isMissingPenaltiesTable({ code: '42P01', message: 'relation "public.loan_penalties" does not exist' })).toBe(true);
    expect(isMissingPenaltiesTable({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('penalidad: registro', () => {
  const fake = (existing: any[] = [], insertError: any = null) => {
    const inserts: any[] = [];
    const builder = (table: string) => {
      let action = 'select';
      let payload: any;
      const b: any = {
        select: () => b, eq: () => b, limit: () => b,
        insert: (p: any) => { action = 'insert'; payload = p; inserts.push({ table, payload: p }); return b; },
        single: () => b,
        then: (res: any) => Promise.resolve(
          action === 'select' ? { data: existing, error: null }
            : insertError ? { data: null, error: insertError } : { data: { id: 'pen-1' }, error: null },
        ).then(res),
      };
      void payload;
      return b;
    };
    return { client: { from: builder } as any, inserts };
  };

  it('Guarda la penalidad del abono con su porcentaje y el abono al que pertenece', async () => {
    const db = fake();
    const id = await recordLoanPenalty(db.client, {
      loan_id: 'L1', amount: 3000.004, source: 'capital_payment', percentage: 2, base_amount: 150000,
      capital_payment_id: 'cp1',
    });
    expect(id).toBe('pen-1');
    expect(db.inserts[0].payload[0]).toMatchObject({
      loan_id: 'L1', amount: 3000, source: 'capital_payment', percentage: 2, base_amount: 150000, capital_payment_id: 'cp1',
    });
  });

  it('No la duplica si el abono ya tiene la suya', async () => {
    const db = fake([{ id: 'ya-estaba' }]);
    const id = await recordLoanPenalty(db.client, { loan_id: 'L1', amount: 10, source: 'capital_payment', capital_payment_id: 'cp1' });
    expect(id).toBe('ya-estaba');
    expect(db.inserts).toHaveLength(0);
  });

  it('Si falta la migración no lanza: el abono ya se registró y no debe caerse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = fake([], { code: 'PGRST205', message: "Could not find the table 'public.loan_penalties'" });
    await expect(recordLoanPenalty(db.client, { loan_id: 'L1', amount: 10, source: 'charge' })).resolves.toBeNull();
    warn.mockRestore();
  });

  it('Un monto de cero no se registra', async () => {
    const db = fake();
    expect(await recordLoanPenalty(db.client, { loan_id: 'L1', amount: 0, source: 'charge' })).toBeNull();
    expect(db.inserts).toHaveLength(0);
  });
});

describe('dashboard: préstamos por aprobar', () => {
  const prestamos = [
    { id: 'a', status: 'active', amount: 10000, start_date: '2026-09-01', created_at: '2026-09-01' },
    { id: 'p', status: 'pending', amount: 50000, start_date: '2026-09-15', created_at: '2026-09-15' },
    { id: 'x', status: 'deleted', deleted_at: '2026-09-16', deleted_reason: CANCELLED_BEFORE_APPROVAL_REASON, amount: 7000 },
    { id: 'd', status: 'deleted', deleted_at: '2026-09-16', deleted_reason: 'Entrada duplicada', amount: 3000 },
  ];

  it('EL CASO REPORTADO: uno por aprobar no entra en las cifras, solo se cuenta aparte', () => {
    const { live, deleted, awaitingApproval } = splitLoansForDashboard(prestamos as any[]);
    expect(live.map(l => l.id)).toEqual(['a']);
    expect(awaitingApproval).toBe(1);
    // Cancelar uno por aprobar tampoco es actividad: nunca se aprobó
    expect(deleted.map(l => l.id)).toEqual(['d']);

    const snapshot = computePortfolioSnapshot(live as any[], '2026-09-18');
    expect(snapshot.totalLent).toBe(10000); // antes: 60,000 con el pendiente
    expect(snapshot.totalLoans).toBe(1);

    const serie = buildMonthlySeries([], [], live as any[], '2026-09-18', 1);
    expect(serie[0]).toMatchObject({ colocado: 10000, prestamos: 1 });
  });

  it('Al aprobarlo ya cuenta', () => {
    const aprobado = prestamos.map(l => l.id === 'p' ? { ...l, status: 'active' } : l);
    const { live, awaitingApproval } = splitLoansForDashboard(aprobado as any[]);
    expect(live.map(l => l.id)).toEqual(['a', 'p']);
    expect(awaitingApproval).toBe(0);
  });
});

describe('indefinidos: nombre de la frecuencia', () => {
  it('Se muestra bajo "Indefinido"', () => {
    expect(getFrequencyName('monthly')).toBe('Mensual');
    expect(getFrequencyName('biweekly')).toBe('Quincenal');
    expect(getFrequencyName('weekly')).toBe('Semanal');
    expect(getFrequencyName('daily')).toBe('Diario');
    expect(getFrequencyName(null)).toBe('Mensual');
  });
});
