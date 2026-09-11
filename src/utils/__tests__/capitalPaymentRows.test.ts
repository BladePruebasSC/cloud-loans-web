// El abono a capital como una fila más de la tabla de amortización.
//
// PEDIDO (2026-09-11): "en las tablas de amortización, tanto de Ver cuotas como del estado de
// cuenta, debe colocar como una fila nueva o un separador el abono a capital, debido a que al
// final el abono a capital es un pago más y así se lleva un mejor control".
import { describe, it, expect } from 'vitest';
import { interleaveCapitalPayments, toCapitalPaymentEntries } from '../capitalPaymentRows';

const cuota = (n: number, due: string) => ({ n, due });
const CUOTAS = [
  cuota(1, '2026-09-01'),
  cuota(2, '2026-10-01'),
  cuota(3, '2026-11-01'),
  cuota(4, '2026-12-01'),
];
// 9 de septiembre, 3:25 p. m. en Santo Domingo.
const ABONO = { id: 'a1', amount: 50000, capital_before: 150000, capital_after: 100000, created_at: '2026-09-09T19:25:00+00:00' };

const orden = (entries: ReturnType<typeof interleaveCapitalPayments<{ n: number; due: string }>>) =>
  entries.map(e => (e.kind === 'installment' ? `#${e.row.n}` : `abono ${e.entry.amount}`));

describe('interleaveCapitalPayments', () => {
  it('El abono queda entre la última cuota vencida antes y la siguiente', () => {
    const filas = interleaveCapitalPayments(CUOTAS, c => c.due, [ABONO]);
    expect(orden(filas)).toEqual(['#1', 'abono 50000', '#2', '#3', '#4']);
  });

  it('La fila lleva el monto y el capital antes y después', () => {
    const [entrada] = toCapitalPaymentEntries([ABONO]);
    expect(entrada).toMatchObject({
      dateIso: '2026-09-09', amount: 50000, capitalBefore: 150000, capitalAfter: 100000,
    });
  });

  it('Una cuota que vence el mismo día del abono va antes que el abono', () => {
    const mismoDia = { ...ABONO, created_at: '2026-10-01T15:00:00+00:00' };
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, [mismoDia])))
      .toEqual(['#1', '#2', 'abono 50000', '#3', '#4']);
  });

  it('Varios abonos se ordenan por fecha aunque lleguen desordenados', () => {
    const segundo = { ...ABONO, id: 'a2', amount: 20000, created_at: '2026-11-15T15:00:00+00:00' };
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, [segundo, ABONO])))
      .toEqual(['#1', 'abono 50000', '#2', '#3', 'abono 20000', '#4']);
  });

  it('Un abono posterior a la última cuota va al final, salvo en una vista recortada', () => {
    const tarde = { ...ABONO, created_at: '2027-01-15T15:00:00+00:00' };
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, [tarde])).slice(-1)).toEqual(['abono 50000']);
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, [tarde], { includeTrailing: false })))
      .toEqual(['#1', '#2', '#3', '#4']);
  });

  it('Sin abonos la tabla queda igual', () => {
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, []))).toEqual(['#1', '#2', '#3', '#4']);
    expect(orden(interleaveCapitalPayments(CUOTAS, c => c.due, null))).toEqual(['#1', '#2', '#3', '#4']);
  });

  it('Los abonos de monto cero no se pintan', () => {
    expect(toCapitalPaymentEntries([{ ...ABONO, amount: 0 }])).toEqual([]);
  });
});
