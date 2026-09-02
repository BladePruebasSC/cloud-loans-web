// Orden de los pagos en el historial del prestamo.
//
// FALLO REPORTADO (2026-09-02): un pago avanzado que salda las cuotas 1, 2 y 3 aparecia en el
// historial como 1, 2, 3 — con la primera abajo, en el sitio del movimiento mas reciente.
//
// CAUSA: `now()` en Postgres devuelve el instante en que EMPEZO LA TRANSACCION, no el de cada
// fila. El pago avanzado inserta todas sus cuotas en un solo `insert`, asi que las tres salen
// con `created_at` identico; y `payment_date` es un DATE, asi que tambien empata. Con los dos
// criterios empatados, `sort` devolvia la lista tal como venia: el orden de insercion.
import { describe, it, expect } from 'vitest';

import {
  comparePaymentsNewestFirst, sortPaymentsNewestFirst, sortPaymentsOldestFirst,
} from '@/utils/paymentOrdering';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

/** Las tres filas del caso reportado: un solo cobro, mismo instante, cuotas 1, 2 y 3. */
const TANDA_AVANZADA = [
  { id: 'p1', payment_date: '2026-09-02', created_at: '2026-09-02T17:45:00Z', due_date: '2026-09-02' },
  { id: 'p2', payment_date: '2026-09-02', created_at: '2026-09-02T17:45:00Z', due_date: '2026-09-03' },
  { id: 'p3', payment_date: '2026-09-02', created_at: '2026-09-02T17:45:00Z', due_date: '2026-09-04' },
];

describe('orden de los pagos', () => {

  it('El caso reportado: la cuota 3 va primero, la 1 al final', () => {
    const orden = sortPaymentsNewestFirst(TANDA_AVANZADA).map(p => p.id);
    ok('3, 2, 1', orden.join() === 'p3,p2,p1', orden.join());

    // Y da igual como venga la lista de la base de datos: el resultado es el mismo.
    const alReves = sortPaymentsNewestFirst([...TANDA_AVANZADA].reverse()).map(p => p.id);
    ok('estable venga como venga', alReves.join() === 'p3,p2,p1', alReves.join());
  });

  it('El desempate por due_date solo actua cuando el resto empata', () => {
    // Un pago de OTRO dia manda sobre la cuota a la que se aplico: lo que ordena la lista es
    // cuando se cobro, no a que cuota fue.
    const conFechas = [
      { id: 'viejo', payment_date: '2026-09-01', created_at: '2026-09-01T10:00:00Z', due_date: '2026-12-01' },
      { id: 'nuevo', payment_date: '2026-09-05', created_at: '2026-09-05T10:00:00Z', due_date: '2026-09-01' },
    ];
    const orden = sortPaymentsNewestFirst(conFechas).map(p => p.id);
    ok('manda la fecha de cobro', orden.join() === 'nuevo,viejo', orden.join());

    // Mismo dia pero distinta hora de registro: manda la hora.
    const mismaFecha = [
      { id: 'temprano', payment_date: '2026-09-02', created_at: '2026-09-02T09:00:00Z', due_date: '2026-12-01' },
      { id: 'tarde', payment_date: '2026-09-02', created_at: '2026-09-02T18:00:00Z', due_date: '2026-09-01' },
    ];
    ok('manda la hora de registro',
      sortPaymentsNewestFirst(mismaFecha).map(p => p.id).join() === 'tarde,temprano');
  });

  it('El orden inverso recorre lo mismo del primero al ultimo', () => {
    // El calculo acumulativo del historial necesita el orden cronologico. Tiene que ser
    // exactamente el inverso, o dos cuotas del mismo cobro se asignarian al reves.
    const asc = sortPaymentsOldestFirst(TANDA_AVANZADA).map(p => p.id);
    ok('1, 2, 3', asc.join() === 'p1,p2,p3', asc.join());

    const desc = sortPaymentsNewestFirst(TANDA_AVANZADA).map(p => p.id);
    ok('es el inverso exacto', asc.join() === [...desc].reverse().join());
  });

  it('Con todo empatado el orden sigue siendo estable', () => {
    // Dos abonos a la MISMA cuota el mismo dia y en el mismo instante: sin un ultimo criterio
    // la lista bailaria entre recargas y el historial parpadearia.
    const iguales = [
      { id: 'b', payment_date: '2026-09-02', created_at: '2026-09-02T17:45:00Z', due_date: '2026-09-02' },
      { id: 'a', payment_date: '2026-09-02', created_at: '2026-09-02T17:45:00Z', due_date: '2026-09-02' },
    ];
    const primera = sortPaymentsNewestFirst(iguales).map(p => p.id).join();
    const segunda = sortPaymentsNewestFirst([...iguales].reverse()).map(p => p.id).join();
    ok('mismo resultado en ambos sentidos', primera === segunda, `${primera} vs ${segunda}`);
  });

  it('No revienta con datos incompletos', () => {
    // Pagos antiguos pueden no tener `due_date` o traer fechas invalidas.
    const sucios = [
      { id: 'sin-nada' },
      { id: 'fecha-mala', payment_date: 'no-es-fecha', created_at: '', due_date: null },
      { id: 'bueno', payment_date: '2026-09-02', created_at: '2026-09-02T10:00:00Z', due_date: '2026-09-02' },
    ];
    const orden = sortPaymentsNewestFirst(sucios).map(p => p.id);
    ok('el que tiene fecha va primero', orden[0] === 'bueno', orden.join());
    ok('no pierde ninguno', orden.length === 3);

    ok('lista vacia', sortPaymentsNewestFirst([]).length === 0);
  });

  it('No muta la lista original', () => {
    // El historial reutiliza el mismo array para varios calculos.
    const original = [...TANDA_AVANZADA];
    const copia = original.map(p => p.id).join();
    sortPaymentsNewestFirst(original);
    sortPaymentsOldestFirst(original);
    ok('intacta', original.map(p => p.id).join() === copia, original.map(p => p.id).join());
  });

  it('El comparador devuelve 0 solo cuando todo coincide', () => {
    const uno = TANDA_AVANZADA[0];
    ok('consigo mismo', comparePaymentsNewestFirst(uno, uno) === 0);
    ok('con otro no', comparePaymentsNewestFirst(TANDA_AVANZADA[0], TANDA_AVANZADA[1]) !== 0);
    // Antisimetria: si a va antes que b, b va despues que a.
    const ab = comparePaymentsNewestFirst(TANDA_AVANZADA[0], TANDA_AVANZADA[2]);
    const ba = comparePaymentsNewestFirst(TANDA_AVANZADA[2], TANDA_AVANZADA[0]);
    ok('antisimetrico', Math.sign(ab) === -Math.sign(ba), `${ab} vs ${ba}`);
  });
});
