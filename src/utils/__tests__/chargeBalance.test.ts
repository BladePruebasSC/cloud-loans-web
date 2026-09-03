// Balance del prestamo cuando hay CARGOS de por medio.
//
// FALLO REPORTADO (2026-09-03): al pagar un cargo, el inicio no restaba ese pago del monto
// del prestamo.
//
// CAUSA: `pay_charges` (LoanUpdateForm) recalculaba el balance por su cuenta con
//
//     suma de `principal_amount` de las cuotas NO pagadas
//
// y lo escribia DESPUES de insertar los pagos, pisando el valor que los triggers de la base
// acababan de calcular bien. Esa formula deja fuera todo el interes pendiente y cuenta una
// cuota abonada a medias como si se debiera entera.
//
// Estas pruebas fijan la formula CORRECTA —la de `calculate_loan_remaining_balance`— y
// demuestran con numeros por que la otra no vale. No prueban codigo de la aplicacion sino la
// regla de negocio: la aplicacion ya no calcula esto, lo lee de la base.
import { describe, it, expect } from 'vitest';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const r2 = (v: number) => Math.round(v * 100) / 100;

interface Cuota {
  principal: number;
  interest: number;
  total: number;
  isPaid: boolean;
  /** Un cargo es una cuota con interes 0 y principal == total. No hay columna que lo diga. */
  isCharge: boolean;
}

const cuota = (principal: number, interest: number, isPaid = false): Cuota => ({
  principal, interest, total: r2(principal + interest), isPaid, isCharge: false,
});

const cargo = (monto: number, isPaid = false): Cuota => ({
  principal: monto, interest: 0, total: monto, isPaid, isCharge: true,
});

/** Replica de `calculate_loan_remaining_balance`: total + cargos - pagos. */
const balanceCorrecto = (totalAmount: number, cuotas: Cuota[], pagos: number) => {
  const cargos = r2(cuotas.filter(c => c.isCharge).reduce((s, c) => s + c.total, 0));
  return Math.max(0, r2(totalAmount + cargos - pagos));
};

/** La formula que tenia `pay_charges` y que causaba el fallo. */
const balanceViejo = (cuotas: Cuota[]) =>
  Math.max(0, r2(cuotas.filter(c => !c.isPaid).reduce((s, c) => s + c.principal, 0)));

describe('balance del prestamo con cargos', () => {

  it('El caso reportado: pagar un cargo baja el balance en ese importe', () => {
    // Prestamo de 10,000 al 20% a 4 cuotas -> total 12,000. Mas un cargo de 1,000.
    const totalAmount = 12000;
    const cuotas = [
      cuota(2500, 500), cuota(2500, 500), cuota(2500, 500), cuota(2500, 500),
      cargo(1000),
    ];

    const antes = balanceCorrecto(totalAmount, cuotas, 0);
    ok('se debe el total mas el cargo', antes === 13000, String(antes));

    // Se paga el cargo: entra una fila en `payments` de 1,000.
    const cuotasTrasPago = cuotas.map(c => (c.isCharge ? { ...c, isPaid: true } : c));
    const despues = balanceCorrecto(totalAmount, cuotasTrasPago, 1000);

    ok('el balance baja exactamente el cargo', r2(antes - despues) === 1000, `${antes} -> ${despues}`);
    ok('queda el prestamo entero', despues === 12000, String(despues));
  });

  it('La formula vieja perdia todo el interes pendiente', () => {
    const totalAmount = 12000;
    const cuotas = [
      cuota(2500, 500), cuota(2500, 500), cuota(2500, 500), cuota(2500, 500),
      cargo(1000),
    ];
    const cuotasTrasPago = cuotas.map(c => (c.isCharge ? { ...c, isPaid: true } : c));

    const correcto = balanceCorrecto(totalAmount, cuotasTrasPago, 1000);
    const viejo = balanceViejo(cuotasTrasPago);

    ok('el correcto es 12,000', correcto === 12000, String(correcto));
    ok('el viejo daba 10,000', viejo === 10000, String(viejo));
    // Los 2,000 que faltan son EXACTAMENTE el interes de las cuatro cuotas: la formula
    // sumaba solo capital.
    ok('la diferencia es el interes completo', r2(correcto - viejo) === 2000, String(r2(correcto - viejo)));
  });

  it('La formula vieja tambien ignoraba los abonos parciales', () => {
    // Cuota 1 abonada a medias: se pagaron 1,500 de 3,000. Sigue sin estar "pagada".
    const totalAmount = 12000;
    const cuotas = [cuota(2500, 500), cuota(2500, 500), cuota(2500, 500), cuota(2500, 500)];

    const correcto = balanceCorrecto(totalAmount, cuotas, 1500);
    ok('el correcto descuenta el abono', correcto === 10500, String(correcto));

    // La vieja cuenta la cuota entera porque `is_paid` sigue en false: el abono se pierde.
    const viejo = balanceViejo(cuotas);
    ok('la vieja ignora los 1,500', viejo === 10000, String(viejo));
    ok('y ademas pierde el interes', viejo < correcto);
  });

  it('Un cargo pagado no se resta dos veces', () => {
    // El cargo sigue sumando al total (la deuda existio) y el pago se resta una sola vez.
    // Quitarlo tambien del lado de los cargos lo descontaria dos veces.
    const cuotas = [cuota(2500, 500), cargo(1000, true)];
    const balance = balanceCorrecto(3000, cuotas, 1000);
    ok('3,000 + 1,000 - 1,000', balance === 3000, String(balance));
  });

  it('Varios cargos, unos pagados y otros no', () => {
    const totalAmount = 12000;
    const cuotas = [
      cuota(2500, 500), cuota(2500, 500), cuota(2500, 500), cuota(2500, 500),
      cargo(1000, true),   // pagado
      cargo(500),          // pendiente
      cargo(250),          // pendiente
    ];
    // Total a deber: 12,000 + 1,750 en cargos = 13,750. Pagado: 1,000.
    const balance = balanceCorrecto(totalAmount, cuotas, 1000);
    ok('12,750', balance === 12750, String(balance));

    // Pagar los otros dos deja el prestamo limpio de cargos.
    const todosPagados = cuotas.map(c => (c.isCharge ? { ...c, isPaid: true } : c));
    ok('tras pagarlos todos queda el prestamo', balanceCorrecto(totalAmount, todosPagados, 1750) === 12000);
  });

  it('El balance nunca baja de cero', () => {
    // Un cliente que paga de mas (redondeos, un abono extra) no puede dejar saldo negativo.
    const cuotas = [cuota(2500, 500)];
    ok('pago exacto', balanceCorrecto(3000, cuotas, 3000) === 0);
    ok('pago de mas', balanceCorrecto(3000, cuotas, 3500) === 0);
  });

  it('Sin cargos las dos formulas siguen sin coincidir', () => {
    // Para que quede claro que el fallo no era "de cargos": la formula vieja estaba mal
    // siempre, y el cargo solo lo hizo visible.
    const cuotas = [cuota(2500, 500), cuota(2500, 500)];
    ok('correcto', balanceCorrecto(6000, cuotas, 0) === 6000);
    ok('viejo pierde el interes', balanceViejo(cuotas) === 5000);
  });
});
