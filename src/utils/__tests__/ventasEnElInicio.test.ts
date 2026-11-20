// ============================================================================
// LAS VENTAS Y LOS EMPEÑOS EN EL INICIO
// ============================================================================
// PEDIDO (2026-11-20): "al dashboard inicial agrégale que salgan las ventas o empeños, que
// también salga lo de penalidad en movimientos recientes en la página principal".
//
// La trampa está en CONTAR las ventas: en esta base cada fila de `sales` es una LÍNEA, no una
// venta. Sin agrupar, una venta de tres productos saldría tres veces en los movimientos
// recientes y el inicio diría "3 ventas" donde hubo una.
import { describe, it, expect } from 'vitest';
import { groupSaleTickets } from '../saleTickets';

const linea = (over: Record<string, unknown> = {}) => ({
  customer_name: 'Omar Santana',
  created_at: '2026-11-20T15:04:00Z',
  sale_date: '2026-11-20',
  quantity: 1,
  unit_price: 123900,
  total_price: 123900,
  ...over,
});

describe('las ventas del inicio', () => {
  it('EL CASO: tres líneas insertadas a la vez son UNA venta', () => {
    const tickets = groupSaleTickets([
      linea(),
      linea({ unit_price: 1180, total_price: 1180 }),
      linea({ unit_price: 2360, total_price: 2360 }),
    ] as any);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].lineas).toBe(3);
    expect(tickets[0].total).toBe(127440);  // 123,900 + 1,180 + 2,360
    expect(tickets[0].cliente).toBe('Omar Santana');
    expect(tickets[0].day).toBe('2026-11-20');
  });

  it('Dos ventas del mismo cliente en momentos distintos son dos', () => {
    const tickets = groupSaleTickets([
      linea(),
      linea({ created_at: '2026-11-20T17:30:00Z' }),
    ] as any);
    expect(tickets).toHaveLength(2);
  });

  it('Cuando la venta tiene número, manda el número', () => {
    const tickets = groupSaleTickets([
      linea({ sale_number: 'SALE-1', created_at: '2026-11-20T15:04:00Z' }),
      linea({ sale_number: 'SALE-1', created_at: '2026-11-20T15:04:01Z' }),
    ] as any);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].key).toBe('SALE-1');
  });

  it('Una venta de mostrador sin cliente se llama "Consumidor final"', () => {
    const tickets = groupSaleTickets([linea({ customer_name: '   ' })] as any);
    expect(tickets[0].cliente).toBe('Consumidor final');
  });

  it('El importe sale de cantidad × precio unitario, que lleva ITBIS', () => {
    const tickets = groupSaleTickets([linea({ quantity: 3, unit_price: 1180, total_price: 3000 })] as any);
    expect(tickets[0].total).toBe(3540);
  });

  it('Una fila sin fecha no entra: no se puede situar en el tiempo', () => {
    expect(groupSaleTickets([linea({ created_at: null, sale_date: null })] as any)).toHaveLength(0);
    expect(groupSaleTickets([] as any)).toHaveLength(0);
  });
});
