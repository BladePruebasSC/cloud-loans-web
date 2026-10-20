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

import { chargeHistoryBalances, isPayChargesEntry, paymentIdsOfEntry } from '../chargeHistoryBalances';

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

  it('El caso reportado: cobrar el cargo lo BAJA, no lo vuelve a sumar', () => {
    // "Se crea un cargo, se paga, y en el historial sale de nuevo un 'Agregar Cargo' donde suma
    // los 1,000 que se pagó al monto" (2026-10-20). El préstamo iba por 46,850.
    const saldos = chargeHistoryBalances({
      baseTotal: 46850,
      chargesTotal: 1000,            // el cargo recién creado
      entries: [
        { id: 'cargo', created_at: '2026-10-20T15:36:00.000Z', amount: 1000, kind: 'charge' },
        {
          id: 'cobro', created_at: '2026-10-20T15:46:00.000Z', amount: 1000, kind: 'payment',
          paymentIds: ['pago-1'],
        },
      ],
      // El cobro del cargo, que ya representa la entrada 'cobro': no se cuenta dos veces.
      payments: [{ id: 'pago-1', at: '2026-10-20T15:45:00.000Z', amount: 1000 }],
    });

    expect(saldos.get('cargo')).toEqual({ prev: 46850, next: 47850 });
    expect(saldos.get('cobro')).toEqual({ prev: 47850, next: 46850 });
  });

  it('Un cobro que no declara sus pagos no los descuenta dos veces de más', () => {
    // Sin `paymentIds`, el pago sí entra en "lo cobrado": la entrada enseña el saldo ya con el
    // cobro descontado y le resta su monto otra vez. Por eso la entrada los declara.
    const conIds = chargeHistoryBalances({
      baseTotal: 10000, chargesTotal: 1000,
      entries: [{
        id: 'cobro', created_at: '2026-10-20T15:46:00.000Z', amount: 1000,
        kind: 'payment', paymentIds: ['p1'],
      }],
      payments: [{ id: 'p1', at: '2026-10-20T15:45:00.000Z', amount: 1000 }],
    });
    expect(conIds.get('cobro')).toEqual({ prev: 11000, next: 10000 });
  });

  it('Un cobro de cargos no cuenta como cargo del préstamo', () => {
    // `chargesTotal` son los cargos que existen en las cuotas. Si el cobro contara como uno,
    // el punto de partida bajaría sin motivo.
    const saldos = chargeHistoryBalances({
      baseTotal: 46850,
      chargesTotal: 1000,
      entries: [
        { id: 'cargo', created_at: '2026-10-20T15:36:00.000Z', amount: 1000, kind: 'charge' },
        { id: 'cobro', created_at: '2026-10-20T15:46:00.000Z', amount: 1000, kind: 'payment', paymentIds: ['p1'] },
      ],
      payments: [{ id: 'p1', at: '2026-10-20T15:45:00.000Z', amount: 1000 }],
    });
    // Si el cobro hubiera contado como cargo del historial, "cargosDeSiempre" se habría ido a 0
    // igualmente, pero el arranque seguiría siendo 46,850: lo que no puede es moverse.
    expect(saldos.get('cargo')!.prev).toBe(46850);
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

describe('reconocer una entrada de "Pagar cargos"', () => {

  it('Por sus notas, que es como las escribe el formulario', () => {
    expect(isPayChargesEntry({
      notes: JSON.stringify({ payment_ids: ['p1', 'p2'], update_type: 'pay_charges' }),
      description: 'Pago de Cargos: . Monto: RD$1,000.00. Saldo: RD$47,850.00 → RD$46,850.00',
    })).toBe(true);
  });

  it('Y por su descripción, para las entradas viejas sin notas', () => {
    expect(isPayChargesEntry({ description: 'Pago de Cargos: mora. Monto: RD$500.00' })).toBe(true);
    expect(isPayChargesEntry({ description: '  pago de cargos: …' })).toBe(true);
  });

  it('Agregar un cargo NO es cobrarlo, aunque las dos frases lleven la palabra "Cargo"', () => {
    // El fallo: la pantalla decidía con un `includes('Cargo')` y "Pago de Cargos" también la
    // lleva, así que un cobro se enseñaba como un cargo nuevo.
    expect(isPayChargesEntry({ description: 'Agregar Cargo: penalty_fee. Monto: RD$1,000.00' })).toBe(false);
    expect(isPayChargesEntry({ description: 'Abono a capital: RD$5,000.00' })).toBe(false);
    expect(isPayChargesEntry(null)).toBe(false);
    expect(isPayChargesEntry({})).toBe(false);
  });

  it('Unas notas que no son JSON no rompen nada', () => {
    expect(isPayChargesEntry({ notes: 'el cliente pasó por la oficina', description: 'Agregar Cargo: x' }))
      .toBe(false);
    expect(paymentIdsOfEntry({ notes: 'texto suelto' })).toEqual([]);
  });

  it('Los pagos de la entrada salen de sus notas', () => {
    expect(paymentIdsOfEntry({
      notes: JSON.stringify({ payment_ids: ['p1', null, 'p2'], update_type: 'pay_charges' }),
    })).toEqual(['p1', 'p2']);
    expect(paymentIdsOfEntry({ notes: JSON.stringify({ update_type: 'pay_charges' }) })).toEqual([]);
    expect(paymentIdsOfEntry(undefined)).toEqual([]);
  });
});
