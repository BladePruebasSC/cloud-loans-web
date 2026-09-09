// "Mora acumulada" del inicio y columna "Mora RD$" de cobranza.
//
// FALLO REPORTADO (2026-09-09), dos síntomas del mismo origen:
//   · "aun cuando eliminas la mora de un préstamo, en inicio sigue diciendo que hay préstamo en
//     mora y el monto lo dice";
//   · "en la parte de cobranza en la mora siempre sale 0.00 aun teniendo un monto".
//
// CAUSA: las dos pantallas leían `loans.current_late_fee`, una columna CACHEADA. Solo la
// escriben algunos flujos (registrar un pago, el barrido de mora, la configuración global), así
// que en un préstamo por el que no ha pasado ninguno se queda en 0 para siempre —el RD$0.00— y
// en otro conserva un importe viejo que ya no se debe. El resto de la aplicación nunca la usa:
// calcula la mora desde las cuotas.
import { describe, it, expect } from 'vitest';
import { computePortfolioSnapshot, type LoanLike } from '../portfolioMetrics';

const HOY = '2026-09-09';

const prestamo = (over: Partial<LoanLike> & { id: string }): LoanLike => ({
  status: 'active',
  amount: 100000,
  remaining_balance: 100000,
  next_payment_date: '2026-09-01',
  grace_period_days: 0,
  current_late_fee: 0,
  ...over,
} as LoanLike);

describe('computePortfolioSnapshot — mora acumulada', () => {
  it('EL CASO REPORTADO: la mora condonada deja de sumar', () => {
    // La columna cacheada sigue diciendo 406.25 porque nadie la reescribió tras condonar.
    const loans = [prestamo({ id: 'L1', current_late_fee: 406.25 })];

    const conColumna = computePortfolioSnapshot(loans, HOY);
    expect(conColumna.lateFeeTotal).toBe(406.25); // el fallo, tal cual

    // Calculada desde las cuotas —donde sí consta la condonación— es cero.
    const calculada = new Map([['L1', 0]]);
    expect(computePortfolioSnapshot(loans, HOY, undefined, calculada).lateFeeTotal).toBe(0);
  });

  it('EL OTRO CASO: una mora real deja de salir en 0.00', () => {
    // La columna nunca se escribió para este préstamo, así que decía 0.
    const loans = [prestamo({ id: 'L1', current_late_fee: 0 })];
    expect(computePortfolioSnapshot(loans, HOY).lateFeeTotal).toBe(0); // el fallo, tal cual

    const calculada = new Map([['L1', 1250.5]]);
    expect(computePortfolioSnapshot(loans, HOY, undefined, calculada).lateFeeTotal).toBe(1250.5);
  });

  it('Suma la mora de toda la cartera, no solo la del primero', () => {
    const loans = [
      prestamo({ id: 'L1' }),
      prestamo({ id: 'L2' }),
      prestamo({ id: 'L3' }),
    ];
    const calculada = new Map([['L1', 100], ['L2', 250.25], ['L3', 0]]);
    expect(computePortfolioSnapshot(loans, HOY, undefined, calculada).lateFeeTotal).toBe(350.25);
  });

  it('Un préstamo sin cuotas leídas conserva su columna en vez de contarse como 0', () => {
    // Devolver 0 por no haber podido leer sus cuotas haría DESAPARECER una mora real, que es
    // peor que enseñar un dato viejo.
    const loans = [prestamo({ id: 'L1', current_late_fee: 800 }), prestamo({ id: 'L2', current_late_fee: 0 })];
    const calculada = new Map([['L2', 300]]); // L1 no está en el mapa
    expect(computePortfolioSnapshot(loans, HOY, undefined, calculada).lateFeeTotal).toBe(1100);
  });

  it('Los préstamos saldados o eliminados no aportan mora', () => {
    const loans = [
      prestamo({ id: 'L1', status: 'paid', current_late_fee: 500 }),
      prestamo({ id: 'L2', status: 'deleted', current_late_fee: 500 }),
      prestamo({ id: 'L3', status: 'active' }),
    ];
    const calculada = new Map([['L1', 500], ['L2', 500], ['L3', 75]]);
    expect(computePortfolioSnapshot(loans, HOY, undefined, calculada).lateFeeTotal).toBe(75);
  });

  it('Un cero calculado NO se confunde con "no hay dato"', () => {
    // La diferencia entre `0` y `undefined` es justo lo que hace que una condonación se respete.
    const loans = [prestamo({ id: 'L1', current_late_fee: 406.25 })];
    expect(computePortfolioSnapshot(loans, HOY, undefined, new Map([['L1', 0]])).lateFeeTotal).toBe(0);
    expect(computePortfolioSnapshot(loans, HOY, undefined, new Map()).lateFeeTotal).toBe(406.25);
  });
});
