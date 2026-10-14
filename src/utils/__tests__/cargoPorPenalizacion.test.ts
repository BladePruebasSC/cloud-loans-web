// Un "Cargo por Penalización" es un CARGO NORMAL, no la penalidad del préstamo.
//
// ACLARACIÓN DEL USUARIO (2026-10-14): "cuando un cargo pone como razón cargo por penalización,
// no se refiere a la penalidad, por ende no debe aparecer como penalidad, sino que debe funcionar
// como los demás cargos normales".
//
// La PENALIDAD del préstamo es otra cosa: la que se cobra al hacer un ABONO A CAPITAL con la
// casilla "Penalidad" marcada. "Cargo por Penalización" es solo el nombre de una de las razones
// que se le pueden poner a un cargo.
import { describe, it, expect } from 'vitest';
import { penaltiesFromHistory, summarizePenalties } from '../loanPenalties';

describe('Un cargo con razón "Cargo por Penalización" NO es una penalidad', () => {
  it('EL CASO REPORTADO: no se cuenta como penalidad del préstamo', () => {
    const filas = penaltiesFromHistory([
      {
        id: 'h1', loan_id: 'L1', created_at: '2026-10-14T15:53:00Z',
        description: 'Agregar Cargo: penalty_fee. Monto: RD$1,000.00',
      },
    ]);
    expect(filas).toHaveLength(0);
    expect(summarizePenalties(filas).total).toBe(0);
  });

  it('Ninguna razón de cargo cuenta como penalidad', () => {
    const filas = penaltiesFromHistory([
      { id: 'h1', loan_id: 'L1', created_at: '2026-10-14T10:00:00Z', description: 'Agregar Cargo: penalty_fee. Monto: RD$1,000.00' },
      { id: 'h2', loan_id: 'L1', created_at: '2026-10-14T11:00:00Z', description: 'Agregar Cargo: legal_fee. Monto: RD$800.00' },
      { id: 'h3', loan_id: 'L1', created_at: '2026-10-14T12:00:00Z', description: 'add_charge: penalty_fee. Monto: RD$500.00' },
    ]);
    expect(filas).toHaveLength(0);
  });
});

describe('La penalidad de verdad sigue contando', () => {
  it('La del ABONO A CAPITAL, con su porcentaje', () => {
    const filas = penaltiesFromHistory([
      {
        id: 'h1', loan_id: 'L1', created_at: '2026-09-01T15:00:00Z',
        description: 'Abono a capital: RD$50,000.00. Penalidad (2%): RD$3,000.00. Abono voluntario',
      },
      {
        id: 'h2', loan_id: 'L1', created_at: '2026-10-14T15:53:00Z',
        description: 'Agregar Cargo: penalty_fee. Monto: RD$1,000.00',
      },
    ]);

    expect(filas.map(f => [f.source, f.amount, f.percentage])).toEqual([
      ['capital_payment', 3000, 2],
    ]);
    // El cargo de 1,000 no suma aquí: se debe como cargo, no como penalidad.
    expect(summarizePenalties(filas).total).toBe(3000);
  });

  it('Varias se van sumando', () => {
    const filas = penaltiesFromHistory([
      { id: 'h1', loan_id: 'L1', created_at: '2026-09-01T15:00:00Z', description: 'Abono a capital: RD$10,000.00. Penalidad (2%): RD$200.00' },
      { id: 'h2', loan_id: 'L1', created_at: '2026-09-20T15:00:00Z', description: 'Abono a capital: RD$5,000.00. Penalidad (3%): RD$150.00' },
    ]);
    const total = summarizePenalties(filas);
    expect(total.total).toBe(350);
    expect(total.count).toBe(2);
  });
});
