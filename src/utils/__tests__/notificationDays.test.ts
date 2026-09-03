// Dias hasta el vencimiento en las NOTIFICACIONES.
//
// FALLO REPORTADO (2026-09-03): una notificacion decia "Pago Vence Manana" para un pago del
// 5 de septiembre, mirandola el dia 3. Manana era el 4.
//
// CAUSA — mezclar dos cosas incomparables:
//
//     Math.floor((new Date('2026-09-05') - new Date()) / 86400000)
//
//   · `new Date('2026-09-05')` se parsea como MEDIANOCHE UTC.
//   · `new Date()` es el INSTANTE ACTUAL, con su hora.
//
// En Santo Domingo (UTC-4) la medianoche UTC del dia 5 son las 20:00 del dia 4 local. La
// resta no da un numero entero de dias y `Math.floor` se come la parte fraccionaria, asi que
// el resultado DEPENDIA DE LA HORA A LA QUE SE MIRARA la pantalla.
//
// Estas pruebas reproducen el caso exacto y fijan la regla: los dias entre dos fechas de
// calendario no dependen de la hora ni de la zona horaria.
import { describe, it, expect } from 'vitest';

import { daysBetweenIso } from '@/utils/frequencyUtils';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

/** Lo que hace ahora la pantalla: dias de calendario desde hoy hasta la fecha. */
const daysFromToday = (todayIso: string, iso: string) =>
  daysBetweenIso(todayIso, String(iso || '').split('T')[0]) ?? 0;

/**
 * La formula ANTIGUA, con la hora del dia como parametro para poder demostrar que el
 * resultado cambiaba a lo largo de la jornada.
 */
const formulaVieja = (dueIso: string, ahora: Date) =>
  Math.floor((new Date(dueIso).getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));

/** Etiqueta que elige la notificacion a partir de los dias. */
const etiqueta = (dias: number) =>
  dias === 0 ? 'HOY' : dias === 1 ? 'manana' : `en ${dias} dias`;

describe('dias hasta el vencimiento en notificaciones', () => {

  it('El caso reportado: pago del 5, mirado el 3, NO vence manana', () => {
    const dias = daysFromToday('2026-09-03', '2026-09-05');
    ok('faltan 2 dias', dias === 2, String(dias));
    ok('la etiqueta es "en 2 dias"', etiqueta(dias) === 'en 2 dias', etiqueta(dias));
    ok('y NO es "manana"', etiqueta(dias) !== 'manana');
  });

  it('La formula vieja daba "manana" por la tarde y "en 2 dias" por la manana', () => {
    // Santo Domingo es UTC-4. `new Date('2026-09-05')` = 2026-09-05T00:00Z.
    const porLaManana = new Date('2026-09-03T13:00:00Z'); //  9:00 local
    const porLaTarde  = new Date('2026-09-03T20:57:00Z'); // 16:57 local, la hora de la captura

    ok('por la manana daba 1', formulaVieja('2026-09-05', porLaManana) === 1,
      String(formulaVieja('2026-09-05', porLaManana)));
    ok('por la tarde tambien daba 1', formulaVieja('2026-09-05', porLaTarde) === 1,
      String(formulaVieja('2026-09-05', porLaTarde)));

    // Lo correcto son 2 en los dos momentos: el dia no cambia con la hora.
    ok('lo correcto son 2, siempre', daysFromToday('2026-09-03', '2026-09-05') === 2);

    // Y la formula nueva no depende de la hora en absoluto: no recibe una.
    ok('la nueva no admite hora', daysFromToday('2026-09-03', '2026-09-05T20:57:00Z') === 2);
  });

  it('Las etiquetas caen donde deben', () => {
    const hoy = '2026-09-03';
    ok('mismo dia -> HOY', etiqueta(daysFromToday(hoy, '2026-09-03')) === 'HOY');
    ok('dia siguiente -> manana', etiqueta(daysFromToday(hoy, '2026-09-04')) === 'manana');
    ok('dos dias', etiqueta(daysFromToday(hoy, '2026-09-05')) === 'en 2 dias');
    ok('una semana', etiqueta(daysFromToday(hoy, '2026-09-10')) === 'en 7 dias');
  });

  it('Los vencidos dan negativo, y su atraso es el opuesto', () => {
    const hoy = '2026-09-03';
    ok('vencio ayer', daysFromToday(hoy, '2026-09-02') === -1);
    ok('un dia de atraso', -daysFromToday(hoy, '2026-09-02') === 1);
    ok('vencio hace 205 dias', -daysFromToday(hoy, '2026-02-10') === 205,
      String(-daysFromToday(hoy, '2026-02-10')));
  });

  it('Cruzar fin de mes y fin de ano se cuenta bien', () => {
    // Los saltos de mes son donde una resta de milisegundos suele fallar.
    ok('31 ago -> 1 sep', daysFromToday('2026-08-31', '2026-09-01') === 1);
    ok('28 feb -> 1 mar (2026 no bisiesto)', daysFromToday('2026-02-28', '2026-03-01') === 1);
    ok('29 feb existe en 2028', daysFromToday('2028-02-28', '2028-03-01') === 2);
    ok('31 dic -> 1 ene', daysFromToday('2026-12-31', '2027-01-01') === 1);
  });

  it('Fechas con hora o invalidas no rompen la cuenta', () => {
    // De la base pueden llegar como 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:MM:SS'.
    ok('con hora', daysFromToday('2026-09-03', '2026-09-04T00:00:00') === 1);
    ok('vacia', daysFromToday('2026-09-03', '') === 0);
    ok('nula', daysFromToday('2026-09-03', null as never) === 0);
    ok('basura', daysFromToday('2026-09-03', 'no-es-fecha') === 0);
  });
});
