// Orden de las filas en la tabla de amortizacion.
//
// FALLO REPORTADO (2026-09-04): el cronograma de la vista previa de solicitudes salia
// desordenado.
//
// CAUSA: ordenaba por numero de cuota comparado como TEXTO. En orden lexicografico "10" va
// antes que "2", asi que un prestamo de 12 cuotas se listaba 1, 10, 11, 12, 2, 3, 4… El
// problema no aparecia con nueve cuotas o menos, que es por lo que habia pasado inadvertido.
import { describe, it, expect } from 'vitest';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

interface Fila { installment: number | string; date: string }

/** Replica del comparador de AmortizationTable tras la correccion. */
const installmentNumber = (value: unknown): number => {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : 0;
};

const ordenar = (filas: Fila[], columna: 'date' | 'installment', dir: 'asc' | 'desc' = 'asc') =>
  [...filas].sort((a, b) => {
    let aValue: any = a[columna];
    let bValue: any = b[columna];

    if (columna === 'date') {
      aValue = String(aValue ?? '');
      bValue = String(bValue ?? '');
    } else {
      aValue = installmentNumber(aValue);
      bValue = installmentNumber(bValue);
    }

    if (aValue === bValue) return 0;
    return dir === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
  });

/** El comparador ANTIGUO, que convertia el numero de cuota a texto. */
const ordenarViejo = (filas: Fila[]) =>
  [...filas].sort((a, b) => {
    const aValue = String(a.installment);
    const bValue = String(b.installment);
    return aValue > bValue ? 1 : -1;
  });

/** Doce cuotas mensuales, ya en orden cronologico. */
const DOCE: Fila[] = Array.from({ length: 12 }, (_, i) => ({
  installment: i + 1,
  date: `2026-${String(i + 1).padStart(2, '0')}-15`,
}));

describe('orden del cronograma de amortizacion', () => {

  it('El caso reportado: 12 cuotas salian 1, 10, 11, 12, 2, 3…', () => {
    const viejo = ordenarViejo(DOCE).map(f => f.installment);
    ok('la vieja desordenaba', viejo.join() === '1,10,11,12,2,3,4,5,6,7,8,9', viejo.join());

    const nuevo = ordenar(DOCE, 'installment').map(f => f.installment);
    ok('ahora sale en orden', nuevo.join() === '1,2,3,4,5,6,7,8,9,10,11,12', nuevo.join());
  });

  it('Con nueve cuotas o menos las dos coincidian: por eso paso inadvertido', () => {
    const nueve = DOCE.slice(0, 9);
    ok('la vieja acertaba con 9',
      ordenarViejo(nueve).map(f => f.installment).join() === '1,2,3,4,5,6,7,8,9');
    // La decima es la que lo rompe todo.
    const diez = DOCE.slice(0, 10);
    ok('con 10 ya falla', ordenarViejo(diez).map(f => f.installment).join() !== '1,2,3,4,5,6,7,8,9,10');
  });

  it('Ordenar por FECHA deja el cronograma como se cobra', () => {
    // Es el orden por defecto: el unico que se lee de arriba abajo sin pensar.
    const desordenadas = [DOCE[5], DOCE[0], DOCE[11], DOCE[2]];
    const porFecha = ordenar(desordenadas, 'date').map(f => f.date);
    ok('cronologico', porFecha.join() === '2026-01-15,2026-03-15,2026-06-15,2026-12-15', porFecha.join());
  });

  it('Las fechas se comparan como texto ISO, sin pasar por new Date()', () => {
    // 'YYYY-MM-DD' ya ordena bien como texto, y asi no se interpreta como UTC —que es el
    // origen de los desfases de un dia que hubo en las notificaciones.
    const cruzandoAno = [
      { installment: 2, date: '2027-01-05' },
      { installment: 1, date: '2026-12-28' },
    ];
    ok('diciembre antes que enero',
      ordenar(cruzandoAno, 'date').map(f => f.date).join() === '2026-12-28,2027-01-05');
  });

  it('El numero de cuota se lee tambien cuando viene como "3/12"', () => {
    // Segun de donde salga la fila, `installment` es un numero o una etiqueta.
    const conEtiqueta: Fila[] = [
      { installment: '10/12', date: '2026-10-15' },
      { installment: '2/12', date: '2026-02-15' },
      { installment: '1/12', date: '2026-01-15' },
    ];
    const orden = ordenar(conEtiqueta, 'installment').map(f => f.installment);
    ok('1, 2, 10', orden.join() === '1/12,2/12,10/12', orden.join());
  });

  it('Descendente es exactamente el inverso', () => {
    const asc = ordenar(DOCE, 'installment', 'asc').map(f => f.installment);
    const desc = ordenar(DOCE, 'installment', 'desc').map(f => f.installment);
    ok('inverso exacto', asc.join() === [...desc].reverse().join());
  });

  it('Valores raros no rompen el orden ni pierden filas', () => {
    const raras: Fila[] = [
      { installment: 2, date: '2026-02-15' },
      { installment: '', date: '' },
      { installment: 1, date: '2026-01-15' },
    ];
    ok('no pierde filas', ordenar(raras, 'installment').length === 3);
    ok('la vacia va primera', installmentNumber('') === 0);
    ok('fecha vacia tambien', ordenar(raras, 'date')[0].date === '');
  });
});
