// Un "Cargo por Penalización" es un cargo Y una penalidad, pero UNA sola deuda.
//
// FALLO REPORTADO (2026-10-14): "cuando se agrega un cargo a un préstamo y se le pone como razón
// penalidad, no cuenta como una penalidad como tal, sino que sigue siendo un cargo normal y
// corriente; este error está causando que el monto se desbalancee más de lo que debería, el cargo
// se triplique en detalles".
import { describe, it, expect } from 'vitest';
import { penaltyAmountInCharges, penaltyChargeIds, penaltiesFromHistory } from '../loanPenalties';

const CARGOS = [
  // Cargo normal, del 10 de octubre
  { id: 'c1', total_amount: 2000, created_at: '2026-10-10T14:00:00Z' },
  // Cargo por penalización, del 14 de octubre
  { id: 'c2', total_amount: 1000, created_at: '2026-10-14T15:53:00Z' },
];

describe('Qué cargos son una penalidad', () => {
  it('Por su enlace directo, cuando la penalidad está guardada en su tabla', () => {
    const penalidades = [
      { amount: 1000, source: 'charge' as const, installment_id: 'c2', created_at: '2026-10-14T15:53:00Z' },
    ];
    const ids = penaltyChargeIds(penalidades, CARGOS);
    expect([...ids]).toEqual(['c2']);
  });

  it('Por monto y día, cuando se leen del historial (sin la migración aplicada)', () => {
    const penalidades = [
      { amount: 1000, source: 'charge' as const, installment_id: null, created_at: '2026-10-14T15:53:00Z' },
    ];
    const ids = penaltyChargeIds(penalidades, CARGOS);
    expect([...ids]).toEqual(['c2']);
  });

  it('Dos penalidades del mismo monto no se emparejan con el mismo cargo', () => {
    const cargos = [
      { id: 'a', total_amount: 500, created_at: '2026-10-14T10:00:00Z' },
      { id: 'b', total_amount: 500, created_at: '2026-10-14T11:00:00Z' },
    ];
    const penalidades = [
      { amount: 500, source: 'charge' as const, installment_id: null, created_at: '2026-10-14T10:00:00Z' },
      { amount: 500, source: 'charge' as const, installment_id: null, created_at: '2026-10-14T11:00:00Z' },
    ];
    expect(penaltyChargeIds(penalidades, cargos).size).toBe(2);
  });

  it('Una penalidad de ABONO A CAPITAL no marca ningún cargo', () => {
    const penalidades = [
      { amount: 1000, source: 'capital_payment' as const, installment_id: null, created_at: '2026-10-14T15:53:00Z' },
    ];
    expect(penaltyChargeIds(penalidades, CARGOS).size).toBe(0);
  });

  it('Sin penalidades, ningún cargo se marca', () => {
    expect(penaltyChargeIds([], CARGOS).size).toBe(0);
  });
});

describe('Cuánto de los cargos pendientes es penalidad', () => {
  it('Solo lo que queda por cobrar del cargo que es penalidad', () => {
    const ids = new Set(['c2']);
    // El cargo de penalidad está entero por cobrar
    expect(penaltyAmountInCharges(ids, [
      { id: 'c1', total_amount: 2000, pending: 2000 },
      { id: 'c2', total_amount: 1000, pending: 1000 },
    ])).toBe(1000);

    // Cobrado a medias
    expect(penaltyAmountInCharges(ids, [
      { id: 'c2', total_amount: 1000, pending: 400 },
    ])).toBe(400);

    // Ya cobrado: no queda penalidad pendiente
    expect(penaltyAmountInCharges(ids, [
      { id: 'c2', total_amount: 1000, pending: 0 },
    ])).toBe(0);
  });

  it('EL CASO REPORTADO: con 3,000 en cargos, 1,000 es la penalidad y no se suma aparte', () => {
    const penalidades = penaltiesFromHistory([
      {
        id: 'h1', loan_id: 'L1', created_at: '2026-10-14T15:53:00Z',
        description: 'Agregar Cargo: penalty_fee. Monto: RD$1,000.00',
      },
    ]);
    expect(penalidades).toHaveLength(1);
    expect(penalidades[0].amount).toBe(1000);
    expect(penalidades[0].source).toBe('charge');

    const ids = penaltyChargeIds(penalidades, CARGOS);
    const cargosPendientes = 3000; // los dos cargos sin cobrar
    const dePenalidad = penaltyAmountInCharges(ids, [
      { id: 'c1', total_amount: 2000, pending: 2000 },
      { id: 'c2', total_amount: 1000, pending: 1000 },
    ]);
    expect(dePenalidad).toBe(1000);
    // La penalidad está DENTRO de los cargos: el balance no la suma dos veces.
    expect(cargosPendientes - dePenalidad).toBe(2000);
  });
});
