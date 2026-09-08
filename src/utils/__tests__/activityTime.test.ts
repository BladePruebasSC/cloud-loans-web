// Actividad reciente del inicio.
//
// FALLO REPORTADO (2026-09-08): "se creó el cliente y luego el préstamo, sin embargo dice que el
// préstamo se creó hace 9 horas y el cliente hace 5 h".
//
// CAUSA: la lista mezcla dos formatos de sello de tiempo —unos con hora
// ('2026-09-08T20:00:00+00:00') y otros solo fecha ('2026-09-08')— y se ordenaba con
// `localeCompare`. La fecha suelta es PREFIJO de la forma larga, así que siempre resulta "menor"
// y todo lo que no traía hora se hundía por debajo de lo del mismo día. Encima, al pintarlo se
// le inventaba el mediodía, de modo que afirmaba una hora que nadie había guardado.
import { describe, it, expect } from 'vitest';
import { activityInstant, formatRelativeTime, isDateOnly } from '../activityTime';

/** 8 de septiembre de 2026, 21:00 en Santo Domingo (UTC−4) = 01:00 UTC del día 9. */
const AHORA = Date.parse('2026-09-09T01:00:00Z');

describe('isDateOnly', () => {
  it('Distingue una fecha suelta de un instante', () => {
    expect(isDateOnly('2026-09-08')).toBe(true);
    expect(isDateOnly('2026-09-08T20:00:00+00:00')).toBe(false);
    expect(isDateOnly('2026-09-08T20:00:00')).toBe(false);
    expect(isDateOnly('')).toBe(false);
  });
});

describe('activityInstant — el orden de la actividad reciente', () => {
  it('EL CASO REPORTADO: el préstamo no puede quedar por debajo del cliente', () => {
    // El cliente se registró a las 16:00 y el préstamo justo después, a las 16:30.
    const cliente = '2026-09-08T20:00:00+00:00';
    const prestamo = '2026-09-08T20:30:00+00:00';

    // Orden por instante, de lo más nuevo a lo más viejo.
    const orden = [cliente, prestamo].sort((a, b) => activityInstant(b) - activityInstant(a));
    expect(orden[0]).toBe(prestamo);
  });

  it('Una fecha SIN hora ya no se hunde por debajo de todo lo del mismo día', () => {
    // Así se comparaba antes: como texto.
    const fechaSuelta = '2026-09-08';           // p. ej. un préstamo sin `created_at`
    const conHora = '2026-09-08T04:00:00Z';     // medianoche local del mismo día
    expect(fechaSuelta.localeCompare(conHora)).toBeLessThan(0); // el fallo, tal cual

    // Por instante, la fecha suelta se sitúa al mediodía: por encima de la medianoche.
    expect(activityInstant(fechaSuelta)).toBeGreaterThan(activityInstant(conHora));
  });

  it('Un valor ilegible o vacío cae al final en vez de romper el orden', () => {
    expect(activityInstant('')).toBe(0);
    expect(activityInstant('no es una fecha')).toBe(0);
  });
});

describe('formatRelativeTime — no se inventa la hora', () => {
  it('EL CASO REPORTADO: una fecha sin hora ya no dice "hace 9 h"', () => {
    // Antes se le asignaba el mediodía y, a las 21:00, salía "hace 9 h": un préstamo creado a
    // las 16:30 parecía anterior al cliente de las 16:00.
    expect(formatRelativeTime('2026-09-08', AHORA)).toBe('hoy');
  });

  it('Con hora guardada sí dice cuánto hace', () => {
    expect(formatRelativeTime('2026-09-09T00:59:45Z', AHORA)).toBe('ahora');
    expect(formatRelativeTime('2026-09-09T00:59:00Z', AHORA)).toBe('hace 1 min');
    expect(formatRelativeTime('2026-09-09T00:45:00Z', AHORA)).toBe('hace 15 min');
    expect(formatRelativeTime('2026-09-08T20:00:00Z', AHORA)).toBe('hace 5 h');
    expect(formatRelativeTime('2026-09-08T01:00:00Z', AHORA)).toBe('ayer');
    expect(formatRelativeTime('2026-09-04T01:00:00Z', AHORA)).toBe('hace 5 días');
  });

  it('Las fechas sueltas se cuentan por días, que es lo único que consta', () => {
    expect(formatRelativeTime('2026-09-07', AHORA)).toBe('ayer');
    expect(formatRelativeTime('2026-09-03', AHORA)).toBe('hace 5 días');
    // Más de un mes: la fecha, sin fingir precisión.
    expect(formatRelativeTime('2026-06-15', AHORA)).toBe('15 jun');
  });

  it('Sin dato no escribe nada', () => {
    expect(formatRelativeTime('', AHORA)).toBe('');
    expect(formatRelativeTime('cualquier cosa', AHORA)).toBe('');
  });
});
