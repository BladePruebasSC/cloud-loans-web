// ============================================================================
// LOS SALDOS DE UNA ENTRADA DE "AGREGAR CARGO" EN EL HISTORIAL
// ============================================================================
// FALLO REPORTADO (2026-10-19): "en historial de modificaciones, valores anteriores y valores
// nuevos, ves que pasa de 1,083.33 a 2,083.33; el cargo es de 1,000 sí, pero ese monto antes del
// cargo tenía un gasto de cierre que actúa como gasto, o sea que el monto pasó de 3,083.33 a
// 4,083.33 como sale en los datos".
//
// El préstamo del caso: 1,000 prestados a 5 cuotas mensuales de 216.67 (total 1,083.33), con
// 2,000 de gastos de cierre y un cargo de 1,000 agregado a mano.
//
// El historial no enseña los saldos tal como se guardaron: los REHACE desde el total del
// préstamo. Y los rehacía sumando SOLO los cargos que aparecen en el propio historial, así que el
// de los gastos de cierre —creado junto con el préstamo, sin pasar por el historial— no entraba
// ni en el "antes" ni en el "después".
import { describe, it, expect } from 'vitest';

import { chargeHistoryBalances } from '../chargeHistoryBalances';

// 5 cuotas de 216.67 (capital 199.97 + interés 16.70)
const TOTAL_DEL_PRESTAMO = 1083.33;
const GASTOS_DE_CIERRE = 2000;
const CARGO = 1000;

const ENTRADA = { id: 'h1', created_at: '2026-10-19T15:01:00.000Z', amount: CARGO };

describe('saldos del historial al agregar un cargo', () => {

  it('El caso reportado: el gasto de cierre ya estaba antes del cargo', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: CARGO + GASTOS_DE_CIERRE,   // los dos cargos que hay en las cuotas
      entries: [ENTRADA],
    });

    expect(saldos.get('h1')).toEqual({ prev: 3083.33, next: 4083.33 });

    // Lo que decía antes: la cadena arrancaba en el total del préstamo, sin el cierre.
    const comoAntes = { prev: TOTAL_DEL_PRESTAMO, next: TOTAL_DEL_PRESTAMO + CARGO };
    expect(comoAntes).toEqual({ prev: 1083.33, next: 2083.33 });
  });

  it('La diferencia entre las dos cifras es siempre el monto del cargo', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: CARGO + GASTOS_DE_CIERRE,
      entries: [ENTRADA],
    });
    const { prev, next } = saldos.get('h1')!;
    expect(Math.round((next - prev) * 100) / 100).toBe(CARGO);
  });

  it('Varios cargos encadenan uno detrás de otro', () => {
    // Préstamo de 27,000 con 2,500 de cierre y dos cargos a mano, de 1,000 y 600.
    const saldos = chargeHistoryBalances({
      baseTotal: 27000,
      chargesTotal: 2500 + 1000 + 600,
      entries: [
        { id: 'a', created_at: '2026-10-14T18:16:00.000Z', amount: 1000 },
        { id: 'b', created_at: '2026-10-14T19:00:00.000Z', amount: 600 },
      ],
    });

    expect(saldos.get('a')).toEqual({ prev: 29500, next: 30500 });
    expect(saldos.get('b')).toEqual({ prev: 30500, next: 31100 });
  });

  it('El orden lo pone la fecha, no cómo lleguen las entradas', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: 27000,
      chargesTotal: 2500 + 1000 + 600,
      entries: [
        { id: 'b', created_at: '2026-10-14T19:00:00.000Z', amount: 600 },
        { id: 'a', created_at: '2026-10-14T18:16:00.000Z', amount: 1000 },
      ],
    });
    expect(saldos.get('a')!.prev).toBe(29500);
    expect(saldos.get('b')!.prev).toBe(30500);
  });

  it('Sin gastos de cierre, la cadena arranca en el total del préstamo', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: CARGO,                      // el único cargo es el del historial
      entries: [ENTRADA],
    });
    expect(saldos.get('h1')).toEqual({ prev: 1083.33, next: 2083.33 });
  });

  it('Lo ya cobrado antes de la entrada se descuenta', () => {
    // Dos cuotas pagadas (216.67 cada una) antes de agregar el cargo.
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: CARGO + GASTOS_DE_CIERRE,
      entries: [ENTRADA],
      payments: [
        { at: '2026-10-17T14:00:00.000Z', amount: 216.67 },
        { at: '2026-10-18T14:00:00.000Z', amount: 216.67 },
        // Este es POSTERIOR a la entrada: no cuenta para este "antes".
        { at: '2026-10-20T14:00:00.000Z', amount: 216.67 },
      ],
    });

    expect(saldos.get('h1')).toEqual({ prev: 2649.99, next: 3649.99 });
  });

  it('Si un cargo del historial ya no existe en las cuotas, no se resta de más', () => {
    // `chargesTotal` menor que lo que suman las entradas: los "cargos de siempre" son 0, nunca
    // un número negativo que rebajaría el saldo.
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: 0,
      entries: [ENTRADA],
    });
    expect(saldos.get('h1')).toEqual({ prev: 1083.33, next: 2083.33 });
  });

  it('Sin entradas de cargo no hay nada que calcular', () => {
    expect(chargeHistoryBalances({ baseTotal: 1083.33, chargesTotal: 2000, entries: [] }).size).toBe(0);
    expect(chargeHistoryBalances({ baseTotal: 1083.33, chargesTotal: 2000, entries: null }).size).toBe(0);
  });

  it('Una entrada sin fecha no descuenta cobros a ciegas', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: TOTAL_DEL_PRESTAMO,
      chargesTotal: CARGO + GASTOS_DE_CIERRE,
      entries: [{ id: 'sin-fecha', amount: CARGO }],
      payments: [{ at: '2026-10-17T14:00:00.000Z', amount: 216.67 }],
    });
    expect(saldos.get('sin-fecha')).toEqual({ prev: 3083.33, next: 4083.33 });
  });

  it('El saldo nunca sale negativo', () => {
    const saldos = chargeHistoryBalances({
      baseTotal: 1000,
      chargesTotal: 0,
      entries: [ENTRADA],
      payments: [{ at: '2026-10-17T14:00:00.000Z', amount: 5000 }],
    });
    expect(saldos.get('h1')!.prev).toBe(0);
    expect(saldos.get('h1')!.next).toBe(CARGO);
  });
});
