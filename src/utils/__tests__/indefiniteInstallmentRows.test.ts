// Filas de la tabla "Ver cuotas" en préstamos INDEFINIDOS.
//
// FALLO REPORTADO (2026-09-08): "la tabla de ver cuotas sigue sin generar la siguiente cuota,
// esto solo pasa en los indefinidos". El préstamo —RD$150,000 al 3% mensual, RD$4,500 por
// período— estaba pagado hasta el 1 de octubre, un período que AÚN NO VENCE, y la tabla se
// quedaba en esa fila: 5 pagadas, 0 pendientes, 0 vencidas. Un préstamo sin vencimiento sin
// nada que cobrar.
//
// CAUSA: el bucle que arma las filas paraba al incluir el primer período posterior a hoy, sin
// mirar si estaba pagado. Pagando por adelantado, esa última fila salía "Pagada" y no se
// generaba ninguna más.
//
// Réplica del bucle de `InstallmentsTable` (la lista que se muestra se arma ahí, no en la
// generación de `installments`), para fijarlo con fechas concretas.
import { describe, it, expect } from 'vitest';

const addPeriodIso = (iso: string, freq: string): string => {
  const [yy, mm, dd] = String(iso).split('-').map(Number);
  const dt = new Date(yy, mm - 1, dd);
  switch (freq) {
    case 'daily': dt.setDate(dt.getDate() + 1); break;
    case 'weekly': dt.setDate(dt.getDate() + 7); break;
    case 'biweekly': dt.setDate(dt.getDate() + 14); break;
    default: dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); break;
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

interface Fila { dueDate: string; isPaid: boolean }

const armarFilas = (opts: {
  firstDue: string;
  frequency: string;
  todayIso: string;
  expected: number;
  paidByDue: Record<string, number>;
  chargeDueDates?: string[];
  /** `false` reproduce el comportamiento anterior: parar en el primer período futuro. */
  seguirSiEstaPagado?: boolean;
}): Fila[] => {
  const { firstDue, frequency, todayIso, expected, paidByDue } = opts;
  const seguir = opts.seguirSiEstaPagado !== false;
  const cargos = new Set(opts.chargeDueDates || []);
  const filas: Fila[] = [];

  let cur = firstDue;
  let rowNum = 1;
  let hayCuotaPendiente = false;

  while (rowNum <= 500) {
    if (cargos.has(cur)) {
      if (cur > todayIso && (!seguir || hayCuotaPendiente)) break;
      cur = addPeriodIso(cur, frequency);
      continue;
    }

    const paid = paidByDue[cur] || 0;
    const remaining = Math.max(0, expected - paid);
    const isPaid = remaining <= 0.01 && paid > 0.01;
    filas.push({ dueDate: cur, isPaid });

    if (!isPaid) hayCuotaPendiente = true;
    rowNum++;

    if (cur > todayIso && (!seguir || !isPaid)) break;
    cur = addPeriodIso(cur, frequency);
  }

  return filas;
};

// El préstamo del reporte: primera cuota el 1 de julio, hoy 8 de septiembre, y pagados jul,
// ago, sep y oct (este último por adelantado). Más un cargo con fecha 2 de septiembre.
const CASO = {
  firstDue: '2026-07-01',
  frequency: 'monthly',
  todayIso: '2026-09-08',
  expected: 4500,
  paidByDue: {
    '2026-07-01': 4500,
    '2026-08-01': 4500,
    '2026-09-01': 4500,
    '2026-10-01': 4500,
  } as Record<string, number>,
  chargeDueDates: ['2026-09-02'],
};

describe('Filas de cuotas en préstamos indefinidos', () => {
  it('EL CASO REPORTADO: pagando por adelantado se quedaba sin próxima cuota', () => {
    // Comportamiento anterior: paraba en el primer período futuro, ya estuviera pagado o no.
    const antes = armarFilas({ ...CASO, seguirSiEstaPagado: false });
    expect(antes.map(f => f.dueDate)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    expect(antes.filter(f => !f.isPaid)).toHaveLength(0); // 0 pendientes, nada que cobrar

    // Ahora: se sigue hasta el primer período que siga pendiente.
    const ahora = armarFilas(CASO);
    expect(ahora.map(f => f.dueDate)).toEqual([
      '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01',
    ]);
    expect(ahora.filter(f => !f.isPaid).map(f => f.dueDate)).toEqual(['2026-11-01']);
  });

  it('Con cuotas vencidas sin pagar, la tabla no se alarga de más', () => {
    // Sin pagos: todas las vencidas + el período en curso, y para. La cuota de dentro de dos
    // meses no debe aparecer.
    const filas = armarFilas({ ...CASO, paidByDue: {} });
    expect(filas.map(f => f.dueDate)).toEqual([
      '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
    ]);
    expect(filas.every(f => !f.isPaid)).toBe(true);
  });

  it('Al día justo hasta hoy: aparece el período en curso como pendiente', () => {
    const filas = armarFilas({
      ...CASO,
      paidByDue: { '2026-07-01': 4500, '2026-08-01': 4500, '2026-09-01': 4500 },
    });
    expect(filas.map(f => f.dueDate)).toEqual([
      '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
    ]);
    expect(filas.filter(f => !f.isPaid).map(f => f.dueDate)).toEqual(['2026-10-01']);
  });

  it('Pagando varios períodos por adelantado, la próxima sigue siendo una sola', () => {
    const filas = armarFilas({
      ...CASO,
      paidByDue: {
        '2026-07-01': 4500, '2026-08-01': 4500, '2026-09-01': 4500,
        '2026-10-01': 4500, '2026-11-01': 4500, '2026-12-01': 4500,
      },
    });
    expect(filas.filter(f => !f.isPaid).map(f => f.dueDate)).toEqual(['2027-01-01']);
  });

  it('Un abono PARCIAL deja el período pendiente y ahí se para', () => {
    const filas = armarFilas({
      ...CASO,
      paidByDue: { '2026-07-01': 4500, '2026-08-01': 4500, '2026-09-01': 4500, '2026-10-01': 2000 },
    });
    expect(filas.filter(f => !f.isPaid).map(f => f.dueDate)).toEqual(['2026-10-01']);
  });

  it('Un CARGO en una fecha futura no corta la generación si todo está pagado', () => {
    // El cargo tiene su propia fila; no debe impedir que aparezca la próxima cuota de interés.
    const filas = armarFilas({ ...CASO, chargeDueDates: ['2026-11-01'] });
    // Noviembre es fecha de cargo, así que la próxima cuota de interés es diciembre.
    expect(filas.filter(f => !f.isPaid).map(f => f.dueDate)).toEqual(['2026-12-01']);
  });
});
