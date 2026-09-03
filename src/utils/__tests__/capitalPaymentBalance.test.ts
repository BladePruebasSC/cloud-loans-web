// El saldo del prestamo tiene que contar los ABONOS A CAPITAL.
//
// FALLO REPORTADO (2026-09-03): un prestamo con un abono a capital de RD$3,000 seguia
// apareciendo en el inicio con el saldo anterior, mientras su propia ficha mostraba el saldo
// correcto. Dos cifras distintas para el mismo prestamo segun la pantalla.
//
// CAUSA: los abonos a capital NO estan en `payments`, sino en su propia tabla
// `capital_payments`. La funcion `calculate_loan_remaining_balance` —de la que sale
// `loans.remaining_balance`, que es lo que lee el inicio— solo miraba `payments`, asi que
// para la base ese dinero nunca entro. El frontend si los contaba
// (`loanBalanceBreakdown.ts`), y de ahi que la ficha y el inicio no coincidieran.
//
// Estas pruebas fijan la formula con los dos terminos y reproducen la divergencia con los
// numeros del caso reportado. Prueban la REGLA, no la funcion SQL: la migracion
// 20260905000000 la implementa en la base.
import { describe, it, expect } from 'vitest';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const r2 = (v: number) => Math.round(v * 100) / 100;

interface Entradas {
  totalAmount: number;
  cargos?: number;
  pagos?: number;
  /** Abonos a capital: tabla `capital_payments`. */
  abonosCapital?: number;
}

/** Formula CORRECTA, la de la migracion 20260905000000. */
const balance = ({ totalAmount, cargos = 0, pagos = 0, abonosCapital = 0 }: Entradas) =>
  Math.max(0, r2(totalAmount + cargos - pagos - abonosCapital));

/** La que tenia la base antes: ignoraba `capital_payments`. */
const balanceViejo = ({ totalAmount, cargos = 0, pagos = 0 }: Entradas) =>
  Math.max(0, r2(totalAmount + cargos - pagos));

describe('saldo con abonos a capital', () => {

  it('El caso reportado: un abono de 3,000 tiene que bajar el saldo', () => {
    // Prestamo cuyo saldo antes del abono era 8,333.20.
    const antes = { totalAmount: 8333.2 };
    ok('saldo de partida', balance(antes) === 8333.2, String(balance(antes)));

    const despues = { ...antes, abonosCapital: 3000 };
    ok('baja a 5,333.20', balance(despues) === 5333.2, String(balance(despues)));
    ok('baja exactamente el abono', r2(balance(antes) - balance(despues)) === 3000);

    // La formula vieja no se enteraba: el inicio seguia mostrando 8,333.20.
    ok('la vieja no lo restaba', balanceViejo(despues) === 8333.2, String(balanceViejo(despues)));
    ok('de ahi la divergencia de 3,000',
      r2(balanceViejo(despues) - balance(despues)) === 3000);
  });

  it('Los abonos a capital y los pagos normales se restan los dos', () => {
    // Son dinero recibido por vias distintas; contar solo una lo deja a medias.
    const caso = { totalAmount: 12000, pagos: 2000, abonosCapital: 3000 };
    ok('12,000 - 2,000 - 3,000', balance(caso) === 7000, String(balance(caso)));
    ok('la vieja se quedaba en 10,000', balanceViejo(caso) === 10000);
  });

  it('Con cargos ademas de abonos, cada termino va por su lado', () => {
    const caso = { totalAmount: 12000, cargos: 1000, pagos: 1000, abonosCapital: 3000 };
    // 12,000 + 1,000 (cargo) - 1,000 (se pago el cargo) - 3,000 (abono) = 9,000
    ok('9,000', balance(caso) === 9000, String(balance(caso)));

    // Sin el abono el saldo es el prestamo entero: el cargo entra y sale.
    ok('sin abono queda el prestamo', balance({ ...caso, abonosCapital: 0 }) === 12000);
  });

  it('Un abono que cubre todo deja el saldo en cero, nunca negativo', () => {
    ok('abono exacto', balance({ totalAmount: 5000, abonosCapital: 5000 }) === 0);
    ok('abono de mas', balance({ totalAmount: 5000, abonosCapital: 7000 }) === 0);
    ok('abono + pagos de mas', balance({ totalAmount: 5000, pagos: 3000, abonosCapital: 4000 }) === 0);
  });

  it('Sin abonos las dos formulas coinciden', () => {
    // Es lo que hace segura la migracion sobre los prestamos existentes: recalcular todos no
    // mueve el saldo de los que nunca recibieron un abono a capital.
    for (const caso of [
      { totalAmount: 12000 },
      { totalAmount: 12000, pagos: 4000 },
      { totalAmount: 12000, cargos: 500, pagos: 4000 },
      { totalAmount: 0 },
    ]) {
      ok(`coinciden con ${JSON.stringify(caso)}`, balance(caso) === balanceViejo(caso),
        `${balance(caso)} vs ${balanceViejo(caso)}`);
    }
  });

  it('El orden de los cobros no cambia el saldo final', () => {
    // Importa porque el fallo se manifestaba justo asi: la aplicacion corregia el saldo a
    // mano tras el abono, y el siguiente cobro disparaba un trigger que lo recalculaba con la
    // formula incompleta y borraba la correccion. Con la formula completa da igual el orden.
    const abonoPrimero = balance({ totalAmount: 10000, abonosCapital: 3000, pagos: 2000 });
    const pagoPrimero = balance({ totalAmount: 10000, pagos: 2000, abonosCapital: 3000 });
    ok('mismo resultado', abonoPrimero === pagoPrimero && abonoPrimero === 5000,
      `${abonoPrimero} vs ${pagoPrimero}`);
  });
});
